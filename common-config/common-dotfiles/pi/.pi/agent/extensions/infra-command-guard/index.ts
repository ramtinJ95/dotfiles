import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const INFRA_PATTERN_GLOBAL = /\b(?:kubectl|terraform)\b/i;
const REQUEST_SOUND_PATH = fileURLToPath(new URL("./sounds/peon-something-need-doing.mp3", import.meta.url));

function playApprovalRequestSound(): void {
	if (process.platform !== "darwin") return;
	const child = spawn("afplay", [REQUEST_SOUND_PATH], { detached: true, stdio: "ignore" });
	child.on("error", () => {});
	child.unref();
}


const SHELL_RUNNERS = new Set([
	"sh",
	"bash",
	"zsh",
	"dash",
	"fish",
	"xargs",
	"python",
	"python3",
	"python3.11",
	"python3.12",
	"node",
	"perl",
	"ruby",
]);

const SAFE_KUBECTL_TOP_LEVEL = new Set([
	"api-resources",
	"api-versions",
	"describe",
	"diff",
	"explain",
	"get",
	"log",
	"logs",
	"port-forward",
	"top",
	"version",
	"wait",
]);

const SAFE_KUBECTL_NESTED = {
	auth: new Set(["can-i", "whoami"]),
	rollout: new Set(["history", "status"]),
};

const SAFE_TERRAFORM_TOP_LEVEL = new Set([
	"fmt",
	"graph",
	"init",
	"plan",
	"providers",
	"show",
	"validate",
	"version",
]);

const SAFE_TERRAFORM_NESTED = {
	state: new Set(["list", "show"]),
	workspace: new Set(["list", "select", "show"]),
};

const KUBECTL_LEADING_BOOLEAN_OPTIONS = new Set([
	"-A",
	"--all-namespaces",
	"--disable-compression",
	"--insecure-skip-tls-verify",
	"--match-server-version",
	"--warnings-as-errors",
]);

const KUBECTL_LEADING_VALUE_OPTIONS = new Set([
	"-n",
	"--namespace",
	"-s",
	"--server",
	"--as",
	"--as-group",
	"--cache-dir",
	"--certificate-authority",
	"--client-certificate",
	"--client-key",
	"--cluster",
	"--context",
	"--kubeconfig",
	"--password",
	"--profile",
	"--profile-output",
	"--request-timeout",
	"--tls-server-name",
	"--token",
	"--user",
	"--username",
	"-v",
]);

const TERRAFORM_LEADING_BOOLEAN_OPTIONS = new Set(["-help", "--help", "-version", "--version", "-no-color"]);
const TERRAFORM_LEADING_VALUE_OPTIONS = new Set(["-chdir"]);

const ENV_BOOLEAN_OPTIONS = new Set(["-0", "-i", "--ignore-environment", "--null"]);
const ENV_VALUE_OPTIONS = new Set(["-C", "-S", "-u", "--chdir", "--split-string", "--unset"]);

const SUDO_BOOLEAN_OPTIONS = new Set([
	"-A",
	"-E",
	"-H",
	"-K",
	"-k",
	"-n",
	"-S",
	"-V",
	"-b",
	"-l",
	"-s",
	"-v",
	"--askpass",
	"--edit",
	"--list",
	"--non-interactive",
	"--preserve-env",
	"--remove-timestamp",
	"--reset-timestamp",
	"--shell",
	"--stdin",
	"--validate",
	"--version",
]);

const SUDO_VALUE_OPTIONS = new Set([
	"-C",
	"-D",
	"-R",
	"-T",
	"-U",
	"-g",
	"-h",
	"-p",
	"-r",
	"-t",
	"-u",
	"--chdir",
	"--close-from",
	"--group",
	"--host",
	"--other-user",
	"--prompt",
	"--role",
	"--type",
	"--user",
]);

const TIME_BOOLEAN_OPTIONS = new Set(["-p", "-v", "--portability", "--verbose"]);
const TIME_VALUE_OPTIONS = new Set(["-f", "-o", "--format", "--output"]);

const SHELL_CONTROL_KEYWORDS = new Set([
	"!",
	"if",
	"then",
	"elif",
	"else",
	"fi",
	"for",
	"while",
	"until",
	"do",
	"done",
	"case",
	"esac",
	"select",
	"function",
]);

const SHELL_EXECUTION_BUILTINS = new Set([".", "source", "eval", "exec"]);

function stripPath(raw) {
	const normalized = String(raw || "");
	const parts = normalized.split(/[\\/]/);
	return (parts[parts.length - 1] || normalized).toLowerCase();
}

function isAssignmentWord(word) {
	return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(word);
}

function isSecretLikeKubectlTarget(word) {
	const normalized = String(word || "").toLowerCase();
	return normalized.split(",").some((piece) => {
		const target = piece.trim();
		return target === "secret" || target === "secrets" || target.startsWith("secret/") || target.startsWith("secrets/");
	});
}

function hasRawKubectlFlag(words) {
	return words.some((word) => word === "--raw" || word.startsWith("--raw="));
}

function normalizeForInfraScan(text) {
	return String(text || "").replace(/["'\\]/g, "");
}

function containsInfraText(text) {
	return INFRA_PATTERN_GLOBAL.test(normalizeForInfraScan(text));
}

function isKubectlPortForwardOnlyCommand(command) {
	const normalized = normalizeForInfraScan(command).toLowerCase();
	const kubectlMentions = normalized.match(/\bkubectl\b(?=[\s;|&()<>]|$)/g) || [];
	if (kubectlMentions.length === 0) return false;
	if (/\bterraform\b/.test(normalized)) return false;
	const kubectlPortForwardMentions =
		normalized.match(/\bkubectl\b(?=[\s;|&()<>]|$)(?:(?!&&|\|\||[;&|\n]).)*\bport-forward\b/g) || [];
	return kubectlPortForwardMentions.length === kubectlMentions.length;
}

function matchesLeadingOption(option, knownSet) {
	if (knownSet.has(option)) return true;
	if (option.includes("=")) {
		const key = option.slice(0, option.indexOf("="));
		return knownSet.has(key);
	}
	return false;
}

function classifyLeadingOption(option, booleanOptions, valueOptions) {
	if (matchesLeadingOption(option, booleanOptions)) return "boolean";
	if (matchesLeadingOption(option, valueOptions)) return "value";
	return "unknown";
}

function parseSimpleCommands(command) {
	const segments = [];
	let words = [];
	let bareWords = [];
	let current = "";
	let currentBare = "";
	let inSingle = false;
	let inDouble = false;
	let escapeNext = false;
	let skipNextWord = false;
	let inComment = false;

	const add = (ch, quoted) => {
		current += ch;
		if (!quoted) currentBare += ch;
	};

	const pushWord = () => {
		if (!current) {
			currentBare = "";
			return;
		}
		if (skipNextWord) {
			skipNextWord = false;
			current = "";
			currentBare = "";
			return;
		}
		words.push(current);
		bareWords.push(currentBare);
		current = "";
		currentBare = "";
	};

	const pushSegment = () => {
		pushWord();
		if (words.length > 0) {
			segments.push({ words, bare: bareWords.join(" ") });
			words = [];
			bareWords = [];
		}
	};

	for (let i = 0; i < command.length; i += 1) {
		const ch = command[i];
		const next = command[i + 1];

		if (inComment) {
			if (ch === "\n") {
				inComment = false;
				if (skipNextWord) return { error: "Invalid redirection before comment" };
				pushSegment();
			}
			continue;
		}

		if (escapeNext) {
			add(ch, inDouble);
			escapeNext = false;
			continue;
		}

		if (inSingle) {
			if (ch === "'") inSingle = false;
			else add(ch, true);
			continue;
		}

		if (inDouble) {
			if (ch === '"') {
				inDouble = false;
				continue;
			}
			if (ch === "`") return { error: "Backtick command substitution is not supported" };
			if (ch === "$") {
				if (next === "(") return { error: "Command substitution is not supported" };
				add(ch, true);
				continue;
			}
			if (ch === "\\") {
				escapeNext = true;
				continue;
			}
			add(ch, true);
			continue;
		}

		if (ch === "#" && current.length === 0) {
			inComment = true;
			continue;
		}

		if (ch === "\\") {
			escapeNext = true;
			continue;
		}

		if (ch === "'") {
			inSingle = true;
			continue;
		}

		if (ch === '"') {
			inDouble = true;
			continue;
		}

		if (ch === "`") return { error: "Backtick command substitution is not supported" };
		if (ch === "$" && next === "(") return { error: "Command substitution is not supported" };

		if (ch === " " || ch === "\t" || ch === "\r") {
			pushWord();
			continue;
		}

		if (ch === "\n" || ch === ";") {
			if (skipNextWord) return { error: "Invalid redirection before command separator" };
			pushSegment();
			continue;
		}

		if (ch === "&") {
			if (next === "&") {
				if (skipNextWord) return { error: "Invalid redirection before command separator" };
				pushSegment();
				i += 1;
				continue;
			}
			return { error: "Background execution is not supported by the infra guard parser" };
		}

		if (ch === "|") {
			if (skipNextWord) return { error: "Invalid redirection before command separator" };
			pushSegment();
			if (next === "|" || next === "&") i += 1;
			continue;
		}

		if (ch === "<" || ch === ">") {
			if (next === "(") return { error: "Process substitution is not supported" };
			if (ch === "<" && next === "<") return { error: "Heredoc syntax is not supported" };
			if (/^\d+$/.test(current)) {
				current = "";
				currentBare = "";
			}
			else pushWord();
			if (next === ">" || next === "&" || next === "|") i += 1;
			skipNextWord = true;
			continue;
		}

		if (ch === "(" || ch === ")" || ch === "{" || ch === "}") {
			return { error: `Unsupported shell grouping token: ${ch}` };
		}

		add(ch, false);
	}

	if (escapeNext) return { error: "Trailing escape is not supported" };
	if (inSingle || inDouble) return { error: "Unterminated quote" };
	if (skipNextWord && !current) return { error: "Redirection without a target is not supported" };

	pushSegment();
	return { segments };
}

function consumeKnownOptions(words, startIndex, booleanOptions, valueOptions) {
	let index = startIndex;
	while (index < words.length) {
		const word = words[index];
		if (word === "--") return { index: index + 1 };
		if (!word.startsWith("-")) break;
		const classification = classifyLeadingOption(word, booleanOptions, valueOptions);
		if (classification === "unknown") {
			return { error: `Unsupported wrapper option: ${word}` };
		}
		if (classification === "boolean") {
			index += 1;
			continue;
		}
		if (word.includes("=")) {
			index += 1;
			continue;
		}
		if (index + 1 >= words.length) {
			return { error: `Missing value for option: ${word}` };
		}
		index += 2;
	}
	return { index };
}

function extractInvocation(words) {
	let index = 0;
	const wrappers = [];

	while (index < words.length) {
		while (index < words.length && isAssignmentWord(words[index])) index += 1;
		if (index >= words.length) {
			return { executable: null, args: [], words: [], wrappers };
		}

		const rawExecutable = words[index];
		const executable = stripPath(rawExecutable);

		if (executable === "env") {
			wrappers.push(executable);
			index += 1;
			const consumed = consumeKnownOptions(words, index, ENV_BOOLEAN_OPTIONS, ENV_VALUE_OPTIONS);
			if (consumed.error) return { error: consumed.error };
			index = consumed.index;
			while (index < words.length && isAssignmentWord(words[index])) index += 1;
			continue;
		}

		if (executable === "sudo") {
			wrappers.push(executable);
			index += 1;
			const consumed = consumeKnownOptions(words, index, SUDO_BOOLEAN_OPTIONS, SUDO_VALUE_OPTIONS);
			if (consumed.error) return { error: consumed.error };
			index = consumed.index;
			while (index < words.length && isAssignmentWord(words[index])) index += 1;
			continue;
		}

		if (executable === "time") {
			wrappers.push(executable);
			index += 1;
			const consumed = consumeKnownOptions(words, index, TIME_BOOLEAN_OPTIONS, TIME_VALUE_OPTIONS);
			if (consumed.error) return { error: consumed.error };
			index = consumed.index;
			continue;
		}

		if (executable === "stdbuf") {
			wrappers.push(executable);
			index += 1;
			while (index < words.length && words[index].startsWith("-")) {
				const option = words[index];
				if (!(option.startsWith("-i") || option.startsWith("-o") || option.startsWith("-e"))) {
					return { error: `Unsupported stdbuf option: ${option}` };
				}
				index += 1;
			}
			continue;
		}

		if (executable === "nice") {
			wrappers.push(executable);
			index += 1;
			if (index < words.length && words[index].startsWith("-")) {
				const option = words[index];
				if (option === "-n" || option === "--adjustment") {
					if (index + 1 >= words.length) return { error: `Missing value for option: ${option}` };
					index += 2;
				} else if (/^-\d+$/.test(option)) {
					index += 1;
				} else {
					return { error: `Unsupported nice option: ${option}` };
				}
			}
			continue;
		}

		if (executable === "command" || executable === "builtin") {
			wrappers.push(executable);
			index += 1;
			while (index < words.length && words[index] === "--") index += 1;
			continue;
		}

		if (executable === "nohup" || executable === "chronic" || executable === "setsid") {
			wrappers.push(executable);
			index += 1;
			continue;
		}

		return {
			executable,
			rawExecutable,
			args: words.slice(index + 1),
			words: words.slice(index),
			wrappers,
		};
	}

	return { executable: null, args: [], words: [], wrappers };
}

function collectPositionals(words, options) {
	const { maxPositionals, leadingBooleanOptions, leadingValueOptions } = options;
	const positionals = [];
	let index = 0;

	while (index < words.length && positionals.length < maxPositionals) {
		const word = words[index];
		if (word === "--") {
			index += 1;
			while (index < words.length && positionals.length < maxPositionals) {
				positionals.push(words[index]);
				index += 1;
			}
			break;
		}

		if (word.startsWith("-")) {
			if (positionals.length === 0) {
				const classification = classifyLeadingOption(word, leadingBooleanOptions, leadingValueOptions);
				if (classification === "unknown") {
					return { error: `Unsupported leading option: ${word}` };
				}
				if (classification === "boolean") {
					index += 1;
					continue;
				}
				if (word.includes("=")) {
					index += 1;
					continue;
				}
				if (index + 1 >= words.length) {
					return { error: `Missing value for option: ${word}` };
				}
				index += 2;
				continue;
			}

			if (word.includes("=")) {
				index += 1;
				continue;
			}

			if (index + 1 < words.length && !words[index + 1].startsWith("-")) {
				index += 2;
			} else {
				index += 1;
			}
			continue;
		}

		positionals.push(word);
		index += 1;
	}

	return { positionals };
}

function requireApproval(reason: string): { allow: boolean; reason: string } {
	return { allow: false, reason };
}

function allow(): { allow: boolean; reason?: string } {
	return { allow: true };
}

function evaluateKubectl(invocation) {
	if (hasRawKubectlFlag(invocation.args)) {
		return requireApproval("kubectl --raw is not on the low-risk allowlist");
	}

	const collected = collectPositionals(invocation.args, {
		maxPositionals: 3,
		leadingBooleanOptions: KUBECTL_LEADING_BOOLEAN_OPTIONS,
		leadingValueOptions: KUBECTL_LEADING_VALUE_OPTIONS,
	});
	if (collected.error) {
		return requireApproval(`kubectl uses an unsupported flag layout (${collected.error})`);
	}

	const positionals = collected.positionals;
	const topLevel = (positionals[0] || "").toLowerCase();
	const nested = (positionals[1] || "").toLowerCase();
	const target = positionals[1] || "";

	if (!topLevel) {
		return requireApproval("kubectl command could not be classified safely");
	}

	if (topLevel === "get" || topLevel === "describe") {
		if (isSecretLikeKubectlTarget(target)) {
			return requireApproval(`kubectl ${topLevel} against secrets may expose secret material`);
		}
		return allow();
	}

	if (topLevel === "auth") {
		if (SAFE_KUBECTL_NESTED.auth.has(nested)) return allow();
		return requireApproval(`kubectl auth ${nested || "<unknown>"} is not on the low-risk allowlist`);
	}

	if (topLevel === "rollout") {
		if (SAFE_KUBECTL_NESTED.rollout.has(nested)) return allow();
		return requireApproval(`kubectl rollout ${nested || "<unknown>"} may change workload state`);
	}

	if (topLevel === "cluster-info" && nested === "dump") {
		return requireApproval("kubectl cluster-info dump can expose sensitive cluster state");
	}

	if (SAFE_KUBECTL_TOP_LEVEL.has(topLevel)) return allow();

	return requireApproval(`kubectl ${topLevel} is not on the low-risk allowlist`);
}

function evaluateTerraform(invocation) {
	const collected = collectPositionals(invocation.args, {
		maxPositionals: 2,
		leadingBooleanOptions: TERRAFORM_LEADING_BOOLEAN_OPTIONS,
		leadingValueOptions: TERRAFORM_LEADING_VALUE_OPTIONS,
	});
	if (collected.error) {
		return requireApproval(`terraform uses an unsupported flag layout (${collected.error})`);
	}

	const positionals = collected.positionals;
	const topLevel = (positionals[0] || "").toLowerCase();
	const nested = (positionals[1] || "").toLowerCase();

	if (!topLevel) {
		if (invocation.args.some((arg) => arg === "-version" || arg === "--version")) return allow();
		return requireApproval("terraform command could not be classified safely");
	}

	if (topLevel === "state") {
		if (SAFE_TERRAFORM_NESTED.state.has(nested)) return allow();
		return requireApproval(`terraform state ${nested || "<unknown>"} can mutate or rewrite state`);
	}

	if (topLevel === "workspace") {
		if (SAFE_TERRAFORM_NESTED.workspace.has(nested)) return allow();
		return requireApproval(`terraform workspace ${nested || "<unknown>"} is not on the low-risk allowlist`);
	}

	if (topLevel === "output") {
		return requireApproval("terraform output may expose sensitive values");
	}

	if (SAFE_TERRAFORM_TOP_LEVEL.has(topLevel)) return allow();

	return requireApproval(`terraform ${topLevel} is not on the low-risk allowlist`);
}

function evaluateCommand(command) {
	if (!containsInfraText(command)) return allow();
	if (isKubectlPortForwardOnlyCommand(command)) return allow();

	const parsed = parseSimpleCommands(command);
	if (parsed.error) {
		return requireApproval(`This command uses shell syntax the infra guard cannot classify safely (${parsed.error})`);
	}

	for (const segment of parsed.segments) {
		const invocation = extractInvocation(segment.words);
		if (invocation.error) {
			return requireApproval(`This command uses a wrapper the infra guard cannot classify safely (${invocation.error})`);
		}

		if (!invocation.executable) continue;

		if (SHELL_CONTROL_KEYWORDS.has(invocation.executable)) {
			return requireApproval(`This command uses shell control flow (${invocation.executable}), which requires manual approval`);
		}

		if (SHELL_EXECUTION_BUILTINS.has(invocation.executable)) {
			return requireApproval(`This command uses shell execution syntax (${invocation.executable}), which requires manual approval`);
		}

		const segmentText = segment.words.join(" ");
		const segmentMentionsInfra = containsInfraText(segmentText);
		if (SHELL_RUNNERS.has(invocation.executable) && segmentMentionsInfra) {
			return requireApproval(`This command delegates infra execution through ${invocation.executable}, which requires manual approval`);
		}

		if (invocation.executable === "kubectl") {
			const decision = evaluateKubectl(invocation);
			if (!decision.allow) return decision;
			continue;
		}

		if (invocation.executable === "terraform") {
			const decision = evaluateTerraform(invocation);
			if (!decision.allow) return decision;
			continue;
		}

		if (containsInfraText(segment.bare)) {
			return requireApproval(
				`This command invokes infra tooling through ${invocation.executable}, which requires manual approval`,
			);
		}
	}

	return allow();
}

function checkRm(command) {
	if (/(^|[|;\n\r]|&&)\s*rm\s/.test(command)) {
		return requireApproval("rm command needs confirmation");
	}
	return allow();
}

function evaluateCommandWithRm(command) {
	const rmDecision = checkRm(command);
	if (!rmDecision.allow) return rmDecision;
	return evaluateCommand(command);
}

function wrapBlock(text: string, width: number): string[] {
	const normalized = String(text || "").replace(/\r\n/g, "\n");
	const wrapped = [];
	for (const rawLine of normalized.split("\n")) {
		if (rawLine.length === 0) {
			wrapped.push("");
			continue;
		}
		const lines = wrapTextWithAnsi(rawLine, Math.max(1, width));
		if (lines.length === 0) wrapped.push("");
		else wrapped.push(...lines);
	}
	return wrapped;
}

class InfraApprovalOverlay {
	private scrollOffset = 0;
	private viewHeight = 0;
	private totalLines = 0;
	private choiceIndex = 0;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: any,
		private approvalDetails: {
			summary: string;
			flags: Array<{ flag: string; meaning: string }>;
			blastRadius: string;
		},
		private reason: string,
		private command: string,
		private done: (approved: boolean) => void,
	) {}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel") || matchesKey(data, "n")) {
			this.done(false);
			return;
		}

		if (matchesKey(data, "y")) {
			this.done(true);
			return;
		}

		if (matchesKey(data, Key.up)) {
			this.scrollBy(-1);
			return;
		}

		if (matchesKey(data, Key.down)) {
			this.scrollBy(1);
			return;
		}

		if (matchesKey(data, "pageUp") || matchesKey(data, Key.ctrl("u"))) {
			this.scrollBy(-(this.viewHeight || 1));
			return;
		}

		if (matchesKey(data, "pageDown") || matchesKey(data, Key.ctrl("d"))) {
			this.scrollBy(this.viewHeight || 1);
			return;
		}

		if (matchesKey(data, Key.home) || matchesKey(data, "g")) {
			this.scrollTo(0);
			return;
		}

		if (matchesKey(data, Key.end) || matchesKey(data, Key.shift("g"))) {
			this.scrollTo(Number.MAX_SAFE_INTEGER);
			return;
		}

		if (
			this.keybindings.matches(data, "tui.select.down") ||
			matchesKey(data, "j") ||
			matchesKey(data, "l") ||
			matchesKey(data, Key.right) ||
			matchesKey(data, Key.tab)
		) {
			this.moveChoice(1);
			return;
		}

		if (
			this.keybindings.matches(data, "tui.select.up") ||
			matchesKey(data, "k") ||
			matchesKey(data, "h") ||
			matchesKey(data, Key.left) ||
			matchesKey(data, Key.shift("tab"))
		) {
			this.moveChoice(-1);
			return;
		}

		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.done(this.choiceIndex === 1);
		}
	}

	render(width: number): string[] {
		const border = (text: string) => this.theme.fg("border", text);
		const innerWidth = Math.max(40, width - 2);
		const bodyWidth = Math.max(10, innerWidth - 2);
		const maxHeight = Math.max(14, Math.floor((this.tui.terminal.rows || 24) * 0.85));
		const headerLines = 2;
		const footerLines = 4;
		const borderLines = 2;
		const contentHeight = Math.max(4, maxHeight - headerLines - footerLines - borderLines);
		const bodyLines = this.buildBodyLines(bodyWidth);
		this.totalLines = bodyLines.length;
		this.viewHeight = contentHeight;

		const maxScroll = Math.max(0, this.totalLines - contentHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
		const visibleBodyLines = bodyLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);

		const lines: string[] = [];
		const padLine = (text: string) => {
			const truncated = truncateToWidth(text, innerWidth);
			return truncated + " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
		};

		const title = truncateToWidth(" Approve running this command? ", innerWidth);
		const titlePad = Math.max(0, innerWidth - visibleWidth(title));
		lines.push(border("╭") + this.theme.fg("accent", title) + border(`${"─".repeat(titlePad)}╮`));
		lines.push(border("│") + padLine(this.theme.fg("warning", " Review the explanation. Default selection is Cancel.")) + border("│"));

		for (const bodyLine of visibleBodyLines) {
			lines.push(border("│") + padLine(` ${bodyLine}`) + border("│"));
		}
		for (let i = visibleBodyLines.length; i < contentHeight; i += 1) {
			lines.push(border("│") + padLine("") + border("│"));
		}

		const start = this.totalLines === 0 ? 0 : Math.min(this.totalLines, this.scrollOffset + 1);
		const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
		const scrollText = this.totalLines > this.viewHeight
			? ` ${start}-${end}/${this.totalLines} • ↑↓ scroll • PgUp/PgDn or Ctrl+u/d page • g/G top/bottom`
			: " ↑↓ scroll • PgUp/PgDn or Ctrl+u/d page • g/G top/bottom";
		lines.push(border("│") + padLine(this.theme.fg("dim", scrollText)) + border("│"));
		lines.push(border("│") + padLine(this.renderChoiceLine(0, "Cancel", "warning")) + border("│"));
		lines.push(border("│") + padLine(this.renderChoiceLine(1, "Approve and run", "success")) + border("│"));
		lines.push(
			border("│") +
				padLine(this.theme.fg("dim", " j/k or h/l move choice • Enter confirm • y allow • n or Esc cancel")) +
				border("│"),
		);
		lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

		return lines.map((line) => truncateToWidth(line, width));
	}

	invalidate(): void {}

	private buildBodyLines(width: number): string[] {
		const lines = [];
		lines.push(this.theme.fg("accent", this.theme.bold("Command")));
		for (const line of wrapBlock(this.command, Math.max(1, width - 2))) {
			lines.push(this.theme.fg("muted", "  ") + this.theme.fg("text", line));
		}
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("Guard reason")));
		lines.push(...wrapBlock(this.reason, width).map((line) => this.theme.fg("warning", line)));
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("What it does")));
		lines.push(...wrapBlock(this.approvalDetails.summary, width).map((line) => this.theme.fg("text", line)));
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("Flags / options")));
		if (this.approvalDetails.flags.length === 0) {
			lines.push(this.theme.fg("muted", "No important flags or options."));
		} else {
			for (const item of this.approvalDetails.flags) {
				const label = this.theme.fg("muted", `• ${item.flag}: `);
				const wrapped = wrapBlock(item.meaning, Math.max(1, width - visibleWidth(`• ${item.flag}: `)));
				lines.push(label + this.theme.fg("text", wrapped[0] || ""));
				for (const continuation of wrapped.slice(1)) {
					lines.push(this.theme.fg("muted", "  ") + this.theme.fg("text", continuation));
				}
			}
		}
		lines.push("");
		lines.push(this.theme.fg("accent", this.theme.bold("Blast radius")));
		lines.push(...wrapBlock(this.approvalDetails.blastRadius, width).map((line) => this.theme.fg("text", line)));
		return lines;
	}

	private renderChoiceLine(index: number, label: string, color: "warning" | "success"): string {
		const selected = this.choiceIndex === index;
		const prefix = selected ? this.theme.fg("accent", "> ") : "  ";
		const text = selected ? this.theme.bg("selectedBg", this.theme.fg(color, ` ${label} `)) : this.theme.fg("dim", label);
		return `${prefix}${text}`;
	}

	private moveChoice(delta: number): void {
		this.choiceIndex = Math.max(0, Math.min(1, this.choiceIndex + (delta < 0 ? -1 : 1)));
		this.tui.requestRender();
	}

	private scrollBy(delta: number): void {
		const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
		this.tui.requestRender();
	}

	private scrollTo(target: number): void {
		const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
		this.scrollOffset = Math.max(0, Math.min(target, maxScroll));
		this.tui.requestRender();
	}
}

function formatApprovalRequest(reason, command) {
	return [
		`BLOCKED — ${reason}`,
		`Command: ${command}`,
		"",
		"Before retrying, you MUST present this through the approve_infra_command tool",
		"(NOT a plain chat message). Follow these steps exactly:",
		"",
		"  1. Draft structured, plain-language approval details:",
		"       • summary: what the command does, without repeating the command text",
		"       • flags: each important flag/option and what it changes",
		"       • blastRadius: what changes, what data is exposed, and worst-case impact",
		"",
		"  2. Call approve_infra_command with:",
		"       • command: the EXACT command byte-for-byte, no edits",
		"       • reason: the guard reason above",
		"       • summary, flags, and blastRadius as separate fields",
		"",
		'  3. If the user selects "Approve and run", retry the original shell tool',
		"     with the EXACT command byte-for-byte, no edits.",
		'  4. If the user selects "Cancel" or anything else, stop — do not retry.',
		"  5. Do NOT explain in chat first; the approval details must live inside",
		"     the approval UI so the user can review and approve in one place.",
	].join("\n");
}

async function requestInfraApproval(
	ctx: any,
	approvalDetails: { summary: string; flags: Array<{ flag: string; meaning: string }>; blastRadius: string },
	reason: string,
	command: string,
): Promise<boolean> {
	const approved = await ctx.ui.custom(
		(tui, theme, keybindings, done) => new InfraApprovalOverlay(tui, theme, keybindings, approvalDetails, reason, command, done),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "82%",
				minWidth: 72,
				maxHeight: "85%",
			},
		},
	);
	return approved === true;
}

function consumeApproval(approvals: Map<string, number>, command: string) {
	const count = approvals.get(command) || 0;
	if (count <= 0) return false;
	if (count === 1) approvals.delete(command);
	else approvals.set(command, count - 1);
	return true;
}

const ApproveInfraCommandParams = Type.Object({
	command: Type.String({ description: "The exact blocked command, byte-for-byte. Do not edit or normalize." }),
	reason: Type.String({ description: "The infra-command-guard block reason." }),
	summary: Type.String({ description: "Plain-language summary of what the command does. Do not repeat the command text." }),
	flags: Type.Array(
		Type.Object({
			flag: Type.String({ description: "The flag, option, or argument name, e.g. --dry-run=client." }),
			meaning: Type.String({ description: "What this flag or option changes about the command." }),
		}),
		{ description: "Important flags/options and their meanings. Use [] if none are important." },
	),
	blastRadius: Type.String({ description: "Concrete blast radius: what changes, what data is exposed, and worst-case impact." }),
});

export default function createExtension(pi: ExtensionAPI) {
	const bashTool = createBashTool(process.cwd());
	const approvedCommands = new Map<string, number>();

	pi.registerTool({
		name: "approve_infra_command",
		label: "Approve Infra Command",
		description:
			"Ask the user to approve one exact blocked infra or rm command with structured risk details.",
		promptSnippet: "Ask the user to approve one exact blocked infra/rm command with structured risk details.",
		promptGuidelines: [
			"Use approve_infra_command only after infra-command-guard blocks a shell command and explicitly instructs you to use it.",
			"When using approve_infra_command, pass the exact blocked command byte-for-byte; do not edit, normalize, quote, or simplify it.",
			"When using approve_infra_command, keep summary, flags, and blastRadius non-overlapping; the approval UI renders command and reason separately.",
		],
		parameters: ApproveInfraCommandParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (ctx.mode !== "tui") {
				return {
					content: [{ type: "text", text: "Cannot approve: TUI approval UI is not available. Do not retry the command." }],
					details: { approved: false, reason: params.reason, command: params.command },
				};
			}

			playApprovalRequestSound();
			const approved = await requestInfraApproval(
				ctx,
				{ summary: params.summary, flags: params.flags, blastRadius: params.blastRadius },
				params.reason,
				params.command,
			);
			if (!approved) {
				return {
					content: [{ type: "text", text: "User cancelled. Do not retry the command." }],
					details: { approved: false, reason: params.reason, command: params.command },
				};
			}

			approvedCommands.set(params.command, (approvedCommands.get(params.command) || 0) + 1);
			return {
				content: [{ type: "text", text: "Approved once. Retry the exact same command byte-for-byte now." }],
				details: { approved: true, reason: params.reason, command: params.command },
			};
		},
	});

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "exec_command" && event.toolName !== "functions.exec_command") return undefined;

		const command = typeof (event.input as { cmd?: unknown })?.cmd === "string" ? (event.input as { cmd: string }).cmd : "";
		if (!command) return undefined;
		if (consumeApproval(approvedCommands, command)) return undefined;

		const decision = evaluateCommandWithRm(command);
		if (decision.allow) return undefined;

		return {
			block: true,
			reason:
				ctx.mode === "tui"
					? formatApprovalRequest(decision.reason, command)
					: `${formatApprovalRequest(decision.reason, command)}\n\nBlocked outside TUI mode.`,
		};
	});

	pi.registerTool({
		...bashTool,
		execute: async (toolCallId, params, signal, onUpdate, ctx) => {
			const command = typeof params?.command === "string" ? params.command : "";
			if (consumeApproval(approvedCommands, command)) {
				return bashTool.execute(toolCallId, params, signal, onUpdate);
			}

			const decision = evaluateCommandWithRm(command);
			if (decision.allow) {
				return bashTool.execute(toolCallId, params, signal, onUpdate);
			}

			if (ctx.mode !== "tui") {
				throw new Error(`${formatApprovalRequest(decision.reason, command)}\n\nBlocked outside TUI mode.`);
			}

			throw new Error(formatApprovalRequest(decision.reason, command));
		},
	});
}

export const _test = {
	parseSimpleCommands,
	extractInvocation,
	collectPositionals,
	isKubectlPortForwardOnlyCommand,
	evaluateCommand,
	evaluateKubectl,
	evaluateTerraform,
	checkRm,
	evaluateCommandWithRm,
};
