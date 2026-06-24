import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	Text,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface QuestionOption {
	label: string;
	description?: string;
}

interface Question {
	id: string;
	question: string;
	multiple: boolean;
	options: QuestionOption[];
}

type Answers = string[][];

const OptionSchema = Type.Object({
	label: Type.String({ description: "Short answer label." }),
	description: Type.Optional(Type.String({ description: "Short explanation." })),
});

const QuestionSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Stable question id." })),
	question: Type.String({ description: "Short question for the user." }),
	multiple: Type.Optional(Type.Boolean({ description: "Allow multiple answers." })),
	options: Type.Array(OptionSchema, { description: "Answer options." }),
});

const AskQuestionsParameters = Type.Object({
	questions: Type.Array(QuestionSchema, { description: "Questions to ask the user." }),
});

const OTHER_OPTION_LABEL = "Type custom answer";
const REPHRASE_REQUEST_ANSWER =
	"User needs this question rephrased, split into multiple questions, or followed up to cover more ground.";

function textContent(text: string) {
	return { type: "text" as const, text };
}

function normalizeOption(option: unknown): QuestionOption | null {
	if (!option || typeof option !== "object") return null;
	const input = option as { label?: unknown; description?: unknown };
	const label = typeof input.label === "string" ? input.label.trim() : "";
	if (!label) return null;
	const description = typeof input.description === "string" ? input.description.trim() : "";
	return { label, ...(description ? { description } : {}) };
}

function normalizeQuestion(input: unknown, index: number): Question | null {
	if (!input || typeof input !== "object") return null;
	const value = input as { id?: unknown; question?: unknown; multiple?: unknown; options?: unknown };
	const question = typeof value.question === "string" ? value.question.trim() : "";
	if (!question) return null;
	const options = Array.isArray(value.options) ? value.options.map(normalizeOption).filter(Boolean) : [];
	const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : `q${index + 1}`;
	return { id, question, multiple: value.multiple === true, options };
}

function normalizeQuestions(params: unknown): Question[] {
	const input = params as { questions?: unknown } | undefined;
	return Array.isArray(input?.questions)
		? input.questions.map((question, index) => normalizeQuestion(question, index)).filter(Boolean)
		: [];
}

function customAnswerFor(value: string): string {
	const trimmed = value.trim();
	return trimmed || REPHRASE_REQUEST_ANSWER;
}

function summarizeAnswers(questions: Question[], answers: Answers): string {
	return answers
		.map((answer, index) => `${questions[index]?.question ?? `Question ${index + 1}`}: ${answer.join(", ") || "No answer"}`)
		.join("\n");
}

function editorTheme(theme: any): EditorTheme {
	return {
		borderColor: (s) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		},
	};
}

function renderWrapped(lines: string[], width: number, prefix: string, text: string): void {
	const prefixWidth = visibleWidth(prefix);
	if (prefixWidth >= width) {
		lines.push(...wrapTextWithAnsi(prefix + text, width));
		return;
	}
	const wrapped = wrapTextWithAnsi(text, Math.max(1, width - prefixWidth));
	const continuationPrefix = " ".repeat(prefixWidth);
	for (let index = 0; index < wrapped.length; index++) {
		lines.push(`${index === 0 ? prefix : continuationPrefix}${wrapped[index]}`);
	}
}

async function askInTui(ctx: any, questions: Question[]): Promise<Answers | null> {
	if (ctx.mode !== "tui") return null;

	return await ctx.ui.custom<Answers | null>((tui: any, theme: any, keybindings: any, done: (value: Answers | null) => void) => {
		const state = { tab: 0, focus: 0, editing: false };
		let cached: string[] | undefined;
		const answers: Answers = questions.map(() => []);
		const custom = questions.map(() => "");
		const customOn = questions.map(() => false);
		const editor = new Editor(tui, editorTheme(theme));

		const reviewTab = () => questions.length;
		const isReview = () => state.tab === reviewTab();
		const current = () => questions[state.tab];
		const options = () => current()?.options ?? [];
		const optionCount = () => options().length + 1;
		const answered = (index: number) => (answers[index]?.length ?? 0) > 0 || customOn[index] === true;
		const refresh = () => {
			cached = undefined;
			tui.requestRender();
		};
		const clampFocus = () => {
			state.focus = Math.max(0, Math.min(optionCount() - 1, state.focus));
		};
		const setTab = (next: number) => {
			state.tab = Math.max(0, Math.min(reviewTab(), next));
			state.focus = 0;
			state.editing = false;
			editor.setText(custom[state.tab] ?? "");
			refresh();
		};
		const saveCustom = (value = editor.getText()) => {
			const question = current();
			if (!question) return;
			const previous = customOn[state.tab] ? customAnswerFor(custom[state.tab] ?? "") : null;
			const next = customAnswerFor(typeof value === "string" ? value : "");
			custom[state.tab] = typeof value === "string" ? value : "";
			customOn[state.tab] = true;
			if (question.multiple) {
				answers[state.tab] = [...answers[state.tab].filter((item) => item !== previous && item !== next), next];
			} else {
				answers[state.tab] = [next];
			}
		};
		editor.onSubmit = (value) => {
			saveCustom(value);
			state.editing = false;
			refresh();
		};
		const pick = (index: number) => {
			const question = current();
			const option = options()[index];
			if (!question || !option) return;
			if (question.multiple) {
				answers[state.tab] = answers[state.tab].includes(option.label)
					? answers[state.tab].filter((item) => item !== option.label)
					: [...answers[state.tab], option.label];
			} else {
				answers[state.tab] = [option.label];
				customOn[state.tab] = false;
			}
			refresh();
		};
		const activateFocused = () => {
			if (state.focus === options().length) {
				state.editing = true;
				editor.setText(custom[state.tab] ?? "");
				refresh();
				return;
			}
			pick(state.focus);
		};

		function handleInput(data: string) {
			if (state.editing) {
				if (matchesKey(data, Key.escape)) {
					state.editing = false;
					editor.setText(custom[state.tab] ?? "");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.escape) || data === "q") {
				done(null);
				return;
			}
			if (matchesKey(data, Key.left) || data === "h") {
				setTab(state.tab - 1);
				return;
			}
			if (matchesKey(data, Key.right) || data === "l") {
				setTab(state.tab + 1);
				return;
			}
			if (matchesKey(data, Key.tab)) {
				setTab(state.tab + 1);
				return;
			}
			if (matchesKey(data, Key.shift("tab"))) {
				setTab(state.tab - 1);
				return;
			}

			if (isReview()) {
				if (matchesKey(data, Key.enter) || data === " ") done(answers);
				return;
			}

			if (keybindings?.matches?.(data, "tui.select.up") || data === "k") {
				state.focus = Math.max(0, state.focus - 1);
				refresh();
				return;
			}
			if (keybindings?.matches?.(data, "tui.select.down") || data === "j") {
				state.focus = Math.min(optionCount() - 1, state.focus + 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.home) || data === "g") {
				state.focus = 0;
				refresh();
				return;
			}
			if (matchesKey(data, Key.end) || data === "G") {
				state.focus = optionCount() - 1;
				refresh();
				return;
			}
			if (matchesKey(data, Key.enter) || matchesKey(data, Key.space) || data === " ") {
				activateFocused();
				return;
			}

			clampFocus();
		}

		function renderTabs(width: number): string[] {
			const tabs = Array.from({ length: questions.length + 1 }, (_, index) => {
				const active = index === state.tab;
				const label = index === questions.length ? "Review" : `${answered(index) ? "■" : "□"} ${index + 1}`;
				const text = ` ${label} `;
				return active ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("muted", text);
			}).join(" ");
			return wrapTextWithAnsi(` ${tabs}`, width);
		}

		function renderOption(lines: string[], width: number, option: QuestionOption, index: number) {
			const selected = state.focus === index;
			const checked = answers[state.tab]?.includes(option.label);
			const cursor = selected ? theme.fg("accent", "> ") : "  ";
			const mark = checked ? theme.fg("success", current()?.multiple ? "✓ " : "● ") : "  ";
			const color = selected ? "accent" : "text";
			renderWrapped(lines, width, cursor + mark, theme.fg(color, option.label));
			if (option.description) renderWrapped(lines, width, "    ", theme.fg("muted", option.description));
		}

		function renderQuestion(lines: string[], width: number) {
			const question = current();
			if (!question) return;
			renderWrapped(
				lines,
				width,
				" ",
				theme.fg("text", question.question) + " " + theme.fg("muted", question.multiple ? "Pick any that apply" : "Pick one"),
			);
			lines.push("");
			for (let index = 0; index < options().length; index++) {
				renderOption(lines, width, options()[index], index);
			}
			const otherSelected = state.focus === options().length;
			const otherPrefix = `${otherSelected ? theme.fg("accent", "> ") : "  "}${customOn[state.tab] ? theme.fg("success", "✓ ") : "  "}`;
			const otherText = `${OTHER_OPTION_LABEL}${custom[state.tab]?.trim() ? `: ${custom[state.tab].trim()}` : ""}`;
			renderWrapped(lines, width, otherPrefix, theme.fg(otherSelected ? "accent" : "muted", otherText));
			if (otherSelected) renderWrapped(lines, width, "    ", theme.fg("dim", "Leave blank to ask the agent to rephrase."));
			if (state.editing) {
				lines.push("");
				for (const line of editor.render(Math.max(1, width - 2))) lines.push(` ${line}`);
			}
			lines.push("");
			renderWrapped(
				lines,
				width,
				" ",
				theme.fg(
					"dim",
					"j/k or ↑↓ options • Space/Enter select/type • blank custom answer asks agent to follow up • q/Esc dismiss",
				),
			);
		}

		function renderReview(lines: string[], width: number) {
			renderWrapped(lines, width, " ", theme.fg("accent", theme.bold("Review")));
			lines.push("");
			for (let index = 0; index < questions.length; index++) {
				renderWrapped(lines, width, " ", theme.fg("muted", `${index + 1}. ${questions[index].question}`));
				renderWrapped(lines, width, "    ", theme.fg("text", answers[index]?.join(", ") || "No answer"));
			}
			lines.push("");
			renderWrapped(lines, width, " ", theme.fg("dim", "Enter submits • h/l or ←/→ questions • q/Esc dismisses"));
		}

		function render(width: number): string[] {
			if (cached) return cached;
			const renderWidth = Math.max(1, width);
			const lines: string[] = [];
			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			lines.push(...renderTabs(renderWidth));
			lines.push("");
			if (isReview()) renderReview(lines, renderWidth);
			else renderQuestion(lines, renderWidth);
			lines.push(theme.fg("accent", "─".repeat(renderWidth)));
			cached = lines;
			return lines;
		}

		return {
			render,
			handleInput,
			invalidate: () => {
				cached = undefined;
			},
		};
	});
}

async function askOther(ctx: any, question: Question): Promise<string | null> {
	const value = await ctx.ui.input(question.question, "Type custom answer; leave blank to ask agent to rephrase");
	return value === undefined ? null : customAnswerFor(value);
}

async function askSingleWithPiUi(ctx: any, question: Question): Promise<string[] | null> {
	const labels = question.options.map((option) => option.label);
	const picked =
		labels.length > 0
			? await ctx.ui.select(question.question, [...labels, OTHER_OPTION_LABEL])
			: await ctx.ui.input(question.question, "Type an answer");
	if (picked === undefined) return null;
	if (labels.length === 0) return [customAnswerFor(picked)];
	if (picked !== OTHER_OPTION_LABEL) return [picked];
	const other = await askOther(ctx, question);
	return other === null ? null : [other];
}

async function askMultipleWithPiUi(ctx: any, question: Question): Promise<string[] | null> {
	const labels = question.options.map((option) => option.label);
	const picked: string[] = [];
	while (true) {
		const next = await ctx.ui.select(question.question, [
			...labels.filter((option) => !picked.includes(option)),
			OTHER_OPTION_LABEL,
			"Done",
		]);
		if (!next) return null;
		if (next === "Done") return picked;
		if (next === OTHER_OPTION_LABEL) {
			const other = await askOther(ctx, question);
			if (other === null) return null;
			picked.push(other);
		} else {
			picked.push(next);
		}
	}
}

async function askWithPiUi(ctx: any, questions: Question[]): Promise<Answers | null> {
	if (!ctx.hasUI) return null;
	const answers: Answers = [];
	for (const question of questions) {
		const answer = question.multiple ? await askMultipleWithPiUi(ctx, question) : await askSingleWithPiUi(ctx, question);
		if (!answer) return null;
		answers.push(answer);
	}
	return answers;
}

export default function askQuestions(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_questions",
		label: "Ask questions",
		description: "Ask the user one or more short multiple-choice questions and wait for answers.",
		parameters: AskQuestionsParameters,
		promptSnippet: "ask_questions: Ask the user short questions when blocked. Use short sentences.",
		promptGuidelines: [
			"Use ask_questions only when you need the user's choice to continue.",
			"Keep ask_questions questions and options short.",
			"Do not use ask_questions for approval when you can pick a safe default.",
		],

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const questions = normalizeQuestions(params);
			if (questions.length === 0) {
				return { content: [textContent("No questions were provided.")] };
			}

			const answers = ctx.mode === "tui" ? await askInTui(ctx, questions) : await askWithPiUi(ctx, questions);
			if (!answers) {
				return { content: [textContent("Questions dismissed.")], isError: true };
			}

			return { content: [textContent(summarizeAnswers(questions, answers))], details: { answers } };
		},

		renderCall(args, theme) {
			const count = Array.isArray(args.questions) ? args.questions.length : 0;
			return new Text(
				theme.fg("toolTitle", theme.bold("ask_questions ")) +
					theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`),
				0,
				0,
			);
		},

		renderResult(result, _options, theme) {
			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			return new Text(theme.fg(result.isError ? "warning" : "success", text), 0, 0);
		},
	});
}
