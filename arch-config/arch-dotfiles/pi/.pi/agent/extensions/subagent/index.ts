/**
 * Subagent Tool - Delegate focused tasks to specialized agents.
 *
 * This extension runs a separate `pi` process per invocation to keep
 * subagent work isolated from the parent conversation context.
 *
 * Supported mode:
 *   - Single: { agent: "name", task: "..." }
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	getMarkdownTheme,
	keyHint,
	truncateHead,
	type ExtensionAPI,
	type TruncationResult,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";

const COLLAPSED_ITEM_COUNT = 10;

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	if (model) parts.push(model);
	return parts.join(" ");
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: any, text: string) => string,
): string {
	const shortenPath = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "find ") + themeFg("accent", pattern) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
		}
	}
}

function normalizePathArg(value: string | undefined): string | undefined {
	if (!value) return undefined;
	let normalized = value.startsWith("@") ? value.slice(1) : value;
	if (normalized === "~") normalized = os.homedir();
	else if (normalized.startsWith("~/")) normalized = path.join(os.homedir(), normalized.slice(2));
	return normalized;
}

function resolveSubagentCwd(baseCwd: string, requestedCwd: string | undefined): string {
	const normalized = normalizePathArg(requestedCwd);
	if (!normalized) return baseCwd;
	return path.isAbsolute(normalized) ? normalized : path.resolve(baseCwd, normalized);
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
}

interface SubagentDetails {
	mode: "single";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	result?: SingleResult;
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

type DisplayItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, any> };

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "assistant") continue;
		const textParts: string[] = [];
		for (const part of msg.content) {
			if (part.type === "text") {
				const text = part.text.trim();
				if (text) textParts.push(text);
			}
		}
		if (textParts.length > 0) return textParts.join("\n\n");
	}
	return "";
}

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		for (const part of msg.content) {
			if (part.type === "text") items.push({ type: "text", text: part.text });
			else if (part.type === "toolCall") items.push({ type: "toolCall", name: part.name, args: part.arguments });
		}
	}
	return items;
}

function writePromptToTempFile(agentName: string, prompt: string): { dir: string; filePath: string } {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tmpDir, filePath };
}

function buildErrorMessage(result: SingleResult): string {
	return result.errorMessage || result.stderr.trim() || getFinalOutput(result.messages) || "(no output)";
}

function truncateForParentOutput(output: string): {
	text: string;
	truncation?: TruncationResult;
	fullOutputPath?: string;
} {
	const truncation = truncateHead(output, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	if (!truncation.truncated) return { text: output };

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
	const fullOutputPath = path.join(tempDir, "output.md");
	fs.writeFileSync(fullOutputPath, output, { encoding: "utf-8", mode: 0o600 });

	let text = truncation.content;
	text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	text += ` Full output saved to: ${fullOutputPath}]`;

	return { text, truncation, fullOutputPath };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runSingleAgent(
	cwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	inheritedModel: string | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (result?: SingleResult) => SubagentDetails,
): Promise<SingleResult> {
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		};
	}

	const selectedModel = agent.model ?? inheritedModel;
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (selectedModel) args.push("--model", selectedModel);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: -1,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: selectedModel,
	};

	const emitUpdate = () => {
		if (!onUpdate) return;
		onUpdate({
			content: [{ type: "text", text: getFinalOutput(currentResult.messages) || "(running...)" }],
			details: makeDetails(currentResult),
		});
	};

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn("pi", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && msg.model) currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", (error) => {
				currentResult.stderr += error.message;
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) throw new Error("Subagent was aborted");
		return currentResult;
	} finally {
		if (tmpPromptPath)
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				/* ignore */
			}
		if (tmpPromptDir)
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				/* ignore */
			}
	}
}

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke" })),
	task: Type.Optional(Type.String({ description: "Task to delegate to the agent" })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for agent discovery and execution" })),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate a focused task to a specialized subagent with isolated context.",
			"Mode: single only (agent + task).",
			`Output returned to the parent is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} if needed.`,
			'Default agent scope is "user" (from ~/.pi/agent/agents).',
			'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
		].join(" "),
		promptSnippet: "Delegate one focused task to a specialized agent in an isolated pi subprocess.",
		promptGuidelines: [
			"Use this tool when isolated context or a specialized agent prompt will help.",
			"Pass exactly one { agent, task } per call. For multiple agents, make multiple tool calls.",
			"Prefer agentScope: \"user\" unless the repository is trusted and project-local agents are needed.",
			"Give the delegated agent a concrete, self-contained task with file paths and expected output.",
		],
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agentScope: AgentScope = params.agentScope ?? "user";
			const effectiveCwd = resolveSubagentCwd(ctx.cwd, params.cwd);

			if (!params.agent || !params.task) {
				const discovery = discoverAgents(effectiveCwd, agentScope);
				const available = discovery.agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				throw new Error(`Invalid parameters. Provide { agent, task }. Available agents: ${available}`);
			}

			const discovery = discoverAgents(effectiveCwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? true;
			const inheritedModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

			const makeDetails = (result?: SingleResult): SubagentDetails => ({
				mode: "single",
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				result,
			});

			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
				const projectAgent = agents.find((a) => a.name === params.agent && a.source === "project");
				if (projectAgent) {
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					const ok = await ctx.ui.confirm(
						"Run project-local agent?",
						`Agent: ${projectAgent.name}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok) {
						return {
							content: [{ type: "text", text: "Canceled: project-local agent not approved." }],
							details: makeDetails(),
						};
					}
				}
			}

			const result = await runSingleAgent(
				effectiveCwd,
				agents,
				params.agent,
				params.task,
				inheritedModel,
				signal,
				onUpdate,
				makeDetails,
			);

			const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
			if (isError) {
				throw new Error(`Agent ${result.stopReason || "failed"}: ${buildErrorMessage(result)}`);
			}

			const finalOutput = getFinalOutput(result.messages) || "(no output)";
			const truncated = truncateForParentOutput(finalOutput);
			return {
				content: [{ type: "text", text: truncated.text }],
				details: {
					...makeDetails(result),
					truncation: truncated.truncation,
					fullOutputPath: truncated.fullOutputPath,
				},
			};
		},

		renderCall(args, theme) {
			const scope: AgentScope = args.agentScope ?? "user";
			const agentName = args.agent || "...";
			const preview = args.task ? (args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task) : "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`);
			text += `\n  ${theme.fg("dim", preview)}`;
			if (args.cwd) text += `\n  ${theme.fg("muted", `cwd: ${args.cwd}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as SubagentDetails | undefined;
			const runningResult = details?.result;

			if (isPartial && !runningResult) {
				return new Text(theme.fg("warning", "⏳ subagent running..."), 0, 0);
			}

			if (!details || !details.result) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const r = details.result;
			const isRunning = isPartial || r.exitCode === -1;
			const isError = r.exitCode > 0 || r.stopReason === "error" || r.stopReason === "aborted";
			const icon = isRunning
				? theme.fg("warning", "⏳")
				: isError
					? theme.fg("error", "✗")
					: theme.fg("success", "✓");
			const displayItems = getDisplayItems(r.messages);
			const finalOutput = getFinalOutput(r.messages);
			const mdTheme = getMarkdownTheme();

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped = limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", preview)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (expanded) {
				const container = new Container();
				let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
				if (isRunning) header += ` ${theme.fg("warning", "[running]")}`;
				if (!isRunning && isError && r.stopReason) header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				container.addChild(new Text(header, 0, 0));
				if (!isRunning && isError) container.addChild(new Text(theme.fg("error", buildErrorMessage(r)), 0, 0));
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
				container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
				if (displayItems.length === 0 && !finalOutput) {
					container.addChild(new Text(theme.fg("muted", isRunning ? "(running...)" : "(no output)"), 0, 0));
				} else {
					for (const item of displayItems) {
						if (item.type === "toolCall") {
							container.addChild(
								new Text(
									theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
									0,
									0,
								),
							);
						}
					}
					if (finalOutput) {
						container.addChild(new Spacer(1));
						container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
					}
				}
				if (details.truncation && details.fullOutputPath) {
					container.addChild(new Spacer(1));
					container.addChild(
						new Text(
							theme.fg(
								"muted",
								`Returned to parent truncated to ${details.truncation.outputLines}/${details.truncation.totalLines} lines; full output saved to ${details.fullOutputPath}`,
							),
							0,
							0,
						),
					);
				}
				const usageStr = formatUsageStats(r.usage, r.model);
				if (usageStr) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
				}
				return container;
			}

			let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
			if (isRunning) text += ` ${theme.fg("warning", "[running]")}`;
			if (!isRunning && isError && r.stopReason) text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
			if (!isRunning && isError) {
				text += `\n${theme.fg("error", buildErrorMessage(r))}`;
			} else if (displayItems.length === 0) {
				text += `\n${theme.fg("muted", isRunning ? "(running...)" : "(no output)")}`;
			} else {
				text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
				if (displayItems.length > COLLAPSED_ITEM_COUNT) {
					text += `\n${theme.fg("muted", `(${keyHint("expandTools", "to expand")})`)}`;
				}
			}
			if (details.truncation && details.fullOutputPath) {
				text += `\n${theme.fg("muted", `Returned to parent truncated; full output: ${details.fullOutputPath}`)}`;
			}
			const usageStr = formatUsageStats(r.usage, r.model);
			if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
			return new Text(text, 0, 0);
		},
	});
}
