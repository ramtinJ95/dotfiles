import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const TOOL_NAME = "apply_patch";
const END_OF_FILE_MARKER = "*** End of File";
const STATUS_KEY = "apply-patch";
const APPROVAL_ENTRY_TYPE = "apply_patch:approved_paths";

type Hunk =
	| { type: "add"; path: string; contents: string }
	| { type: "delete"; path: string }
	| { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] };

interface UpdateFileChunk {
	old_lines: string[];
	new_lines: string[];
	change_context?: string;
	is_end_of_file?: boolean;
}

interface PlannedFileChange {
	filePath: string;
	relativePath: string;
	type: "add" | "update" | "delete" | "move";
	oldContent: string;
	newContent: string;
	movePath?: string;
	diff: string;
	additions: number;
	deletions: number;
}

type ApplyPatchParams = {
	patchText?: string;
	input?: string;
};

interface ApplyPatchApprovalEntry {
	approvedPaths?: string[];
}

function isGptFamilyModel(model: ExtensionContext["model"]): boolean {
	if (!model?.id) return false;
	return model.id.toLowerCase().startsWith("gpt-");
}

function unique<T>(items: T[]): T[] {
	return Array.from(new Set(items));
}

function trimDiff(diff: string): string {
	const lines = diff.split("\n");
	const contentLines = lines.filter(
		(line) =>
			(line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
			!line.startsWith("---") &&
			!line.startsWith("+++"),
	);

	if (contentLines.length === 0) return diff;

	let min = Number.POSITIVE_INFINITY;
	for (const line of contentLines) {
		const content = line.slice(1);
		if (content.trim().length > 0) {
			const match = content.match(/^(\s*)/);
			if (match) min = Math.min(min, match[1].length);
		}
	}
	if (!Number.isFinite(min) || min <= 0) return diff;

	const trimmedLines = lines.map((line) => {
		if (
			(line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
			!line.startsWith("---") &&
			!line.startsWith("+++")
		) {
			const prefix = line[0];
			const content = line.slice(1);
			return prefix + content.slice(min);
		}
		return line;
	});

	return trimmedLines.join("\n");
}

function splitContentLines(content: string): string[] {
	if (!content) return [];
	const lines = content.split("\n");
	if (content.endsWith("\n")) lines.pop();
	return lines;
}

function generateSimpleUnifiedDiff(oldContent: string, newContent: string): string {
	const oldLines = splitContentLines(oldContent);
	const newLines = splitContentLines(newContent);
	const maxLen = Math.max(oldLines.length, newLines.length);

	let body = "";
	let hasChanges = false;
	for (let i = 0; i < maxLen; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];

		if (oldLine === newLine) {
			if (oldLine !== undefined) body += ` ${oldLine}\n`;
			continue;
		}

		if (oldLine !== undefined) {
			body += `-${oldLine}\n`;
			hasChanges = true;
		}
		if (newLine !== undefined) {
			body += `+${newLine}\n`;
			hasChanges = true;
		}
	}

	if (!hasChanges) return "";
	const oldCount = Math.max(oldLines.length, 1);
	const newCount = Math.max(newLines.length, 1);
	return `@@ -1,${oldCount} +1,${newCount} @@\n${body}`;
}

function createTwoFilesPatch(_oldFileName: string, _newFileName: string, oldContent: string, newContent: string): string {
	const diffBody = generateSimpleUnifiedDiff(oldContent, newContent);
	if (!diffBody) return "";
	return `--- ${_oldFileName}\n+++ ${_newFileName}\n${diffBody}`;
}

function computeLineCounts(oldContent: string, newContent: string) {
	let additions = 0;
	let deletions = 0;
	const diff = generateSimpleUnifiedDiff(oldContent, newContent);
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) additions++;
		if (line.startsWith("-")) deletions++;
	}
	return { additions, deletions };
}

function parsePatchHeader(
	lines: string[],
	startIdx: number,
): { filePath: string; movePath?: string; nextIdx: number } | null {
	const line = lines[startIdx];

	if (line.startsWith("*** Add File:")) {
		const filePath = line.split(":", 2)[1]?.trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Delete File:")) {
		const filePath = line.split(":", 2)[1]?.trim();
		return filePath ? { filePath, nextIdx: startIdx + 1 } : null;
	}

	if (line.startsWith("*** Update File:")) {
		const filePath = line.split(":", 2)[1]?.trim();
		let movePath: string | undefined;
		let nextIdx = startIdx + 1;

		if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
			movePath = lines[nextIdx].split(":", 2)[1]?.trim();
			nextIdx++;
		}

		return filePath ? { filePath, movePath, nextIdx } : null;
	}

	return null;
}

function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
	const chunks: UpdateFileChunk[] = [];
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("@@")) {
			const contextLine = lines[i].substring(2).trim();
			i++;

			const oldLines: string[] = [];
			const newLines: string[] = [];
			let isEndOfFile = false;

			while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("***")) {
				const changeLine = lines[i];

				if (changeLine === END_OF_FILE_MARKER) {
					isEndOfFile = true;
					i++;
					break;
				}

				if (changeLine.startsWith(" ")) {
					const content = changeLine.substring(1);
					oldLines.push(content);
					newLines.push(content);
				} else if (changeLine.startsWith("-")) {
					oldLines.push(changeLine.substring(1));
				} else if (changeLine.startsWith("+")) {
					newLines.push(changeLine.substring(1));
				}

				i++;
			}

			chunks.push({
				old_lines: oldLines,
				new_lines: newLines,
				change_context: contextLine || undefined,
				is_end_of_file: isEndOfFile || undefined,
			});
		} else {
			i++;
		}
	}

	return { chunks, nextIdx: i };
}

function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
	let content = "";
	let i = startIdx;

	while (i < lines.length && !lines[i].startsWith("***")) {
		if (lines[i].startsWith("+")) {
			content += `${lines[i].substring(1)}\n`;
		}
		i++;
	}

	if (content.endsWith("\n")) content = content.slice(0, -1);
	return { content, nextIdx: i };
}

function stripWrappingQuotes(raw: string): string {
	const value = raw.trim();
	if (value.length >= 2) {
		if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
			return value.slice(1, -1);
		}
	}
	return value;
}

function stripKnownWrappers(input: string): { patch: string; workdir?: string } {
	const directHeredoc = input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
	if (directHeredoc) return { patch: directHeredoc[2] };

	const shellApplyPatch = input.match(
		/^(?:cd\s+(.+?)\s*&&\s*)?(?:apply_patch|applypatch)\s*<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\2\s*$/,
	);
	if (shellApplyPatch) {
		return {
			patch: shellApplyPatch[3],
			workdir: shellApplyPatch[1] ? stripWrappingQuotes(shellApplyPatch[1]) : undefined,
		};
	}

	return { patch: input };
}

function parsePatch(patchText: string): { hunks: Hunk[]; normalizedPatch: string; workdir?: string } {
	const wrapped = stripKnownWrappers(patchText.trim());
	const cleaned = wrapped.patch;
	const lines = cleaned.split("\n");
	const hunks: Hunk[] = [];

	const beginMarker = "*** Begin Patch";
	const endMarker = "*** End Patch";

	const beginIdx = lines.findIndex((line) => line.trim() === beginMarker);
	const endIdx = lines.findIndex((line) => line.trim() === endMarker);

	if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
		throw new Error("Invalid patch format: missing Begin/End markers");
	}

	let i = beginIdx + 1;
	while (i < endIdx) {
		const header = parsePatchHeader(lines, i);
		if (!header) {
			i++;
			continue;
		}

		if (lines[i].startsWith("*** Add File:")) {
			const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx);
			hunks.push({ type: "add", path: header.filePath, contents: content });
			i = nextIdx;
			continue;
		}

		if (lines[i].startsWith("*** Delete File:")) {
			hunks.push({ type: "delete", path: header.filePath });
			i = header.nextIdx;
			continue;
		}

		if (lines[i].startsWith("*** Update File:")) {
			const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx);
			hunks.push({ type: "update", path: header.filePath, move_path: header.movePath, chunks });
			i = nextIdx;
			continue;
		}

		i++;
	}

	return {
		hunks,
		normalizedPatch: cleaned,
		workdir: wrapped.workdir,
	};
}

function resolvePatchWorkdir(patchWorkdir: string | undefined, cwd: string): string {
	if (!patchWorkdir) return cwd;
	const normalized = stripWrappingQuotes(patchWorkdir);
	if (!normalized) return cwd;

	const resolved = path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(cwd, normalized);
	const relative = path.relative(cwd, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Path escapes workspace and is not allowed: ${patchWorkdir}`);
	}
	return resolved;
}

function normalizeUnicode(str: string): string {
	return str
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
		.replace(/\u2026/g, "...")
		.replace(/\u00A0/g, " ");
}

type Comparator = (a: string, b: string) => boolean;

function tryMatch(
	lines: string[],
	pattern: string[],
	startIndex: number,
	compare: Comparator,
	eof: boolean,
): number {
	if (eof) {
		const fromEnd = lines.length - pattern.length;
		if (fromEnd >= startIndex) {
			let matches = true;
			for (let j = 0; j < pattern.length; j++) {
				if (!compare(lines[fromEnd + j], pattern[j])) {
					matches = false;
					break;
				}
			}
			if (matches) return fromEnd;
		}
	}

	for (let i = startIndex; i <= lines.length - pattern.length; i++) {
		let matches = true;
		for (let j = 0; j < pattern.length; j++) {
			if (!compare(lines[i + j], pattern[j])) {
				matches = false;
				break;
			}
		}
		if (matches) return i;
	}

	return -1;
}

function seekSequence(lines: string[], pattern: string[], startIndex: number, eof = false): number {
	if (pattern.length === 0) return -1;

	const exact = tryMatch(lines, pattern, startIndex, (a, b) => a === b, eof);
	if (exact !== -1) return exact;

	const rstrip = tryMatch(lines, pattern, startIndex, (a, b) => a.trimEnd() === b.trimEnd(), eof);
	if (rstrip !== -1) return rstrip;

	const trim = tryMatch(lines, pattern, startIndex, (a, b) => a.trim() === b.trim(), eof);
	if (trim !== -1) return trim;

	return tryMatch(lines, pattern, startIndex, (a, b) => normalizeUnicode(a.trim()) === normalizeUnicode(b.trim()), eof);
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
	const result = [...lines];

	for (let i = replacements.length - 1; i >= 0; i--) {
		const [startIdx, oldLen, newSegment] = replacements[i];
		result.splice(startIdx, oldLen, ...newSegment);
	}

	return result;
}

function deriveNewContentsFromChunks(
	filePath: string,
	chunks: UpdateFileChunk[],
	originalContent: string,
): { content: string } {
	let originalLines = originalContent.split("\n");
	if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") originalLines.pop();

	const replacements: Array<[number, number, string[]]> = [];
	let lineIndex = 0;

	for (const chunk of chunks) {
		if (chunk.change_context) {
			const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex);
			if (contextIdx === -1) {
				throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`);
			}
			lineIndex = contextIdx + 1;
		}

		if (chunk.old_lines.length === 0) {
			const insertionIdx =
				originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
					? originalLines.length - 1
					: originalLines.length;
			replacements.push([insertionIdx, 0, chunk.new_lines]);
			continue;
		}

		let pattern = chunk.old_lines;
		let newSlice = chunk.new_lines;
		let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);

		if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
				newSlice = newSlice.slice(0, -1);
			}
			found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file);
		}

		if (found === -1) {
			throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`);
		}

		replacements.push([found, pattern.length, newSlice]);
		lineIndex = found + pattern.length;
	}

	replacements.sort((a, b) => a[0] - b[0]);
	let newLines = applyReplacements(originalLines, replacements);

	if (newLines.length === 0 || newLines[newLines.length - 1] !== "") newLines.push("");
	return { content: newLines.join("\n") };
}

function ensureWorkspaceRelativePatchPath(inputPath: string, cwd: string): string {
	const cleaned = inputPath.replace(/^@/, "").trim();
	if (!cleaned) throw new Error("Patch path cannot be empty");
	if (path.isAbsolute(cleaned)) throw new Error(`Absolute path is not allowed in apply_patch: ${cleaned}`);

	const resolved = path.resolve(cwd, cleaned);
	const relative = path.relative(cwd, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Path escapes workspace and is not allowed: ${cleaned}`);
	}
	return resolved;
}

export function looksLikeApplyPatchShellInvocation(command: string): boolean {
	if (!command) return false;
	const trimmed = command.trim();
	if (/^(?:apply_patch|applypatch)\b/.test(trimmed)) return true;
	if (/^(?:cd\s+.+?&&\s*)?(?:apply_patch|applypatch)\b/.test(trimmed)) return true;
	return /(?:^|[;&]\s*|&&\s*)(?:apply_patch|applypatch)\b/.test(trimmed);
}

export function getApplyPatchTextFromParams(params: unknown): string {
	if (!params || typeof params !== "object") {
		throw new Error("apply_patch verification failed: patch input must be an object");
	}

	const candidate = params as ApplyPatchParams;
	const patchText = (typeof candidate.patchText === "string" ? candidate.patchText : "").trim();
	if (patchText.length > 0) return patchText;

	const input = (typeof candidate.input === "string" ? candidate.input : "").trim();
	if (input.length > 0) return input;

	throw new Error("apply_patch verification failed: expected either 'patchText' or 'input'");
}

function getApprovedPathsFromSession(ctx: ExtensionContext): Set<string> {
	const approved = new Set<string>();
	for (const entry of ctx.sessionManager.getEntries()) {
		if ((entry as { type?: string }).type !== "custom") continue;
		const custom = entry as unknown as { customType?: string; data?: ApplyPatchApprovalEntry };
		if (custom.customType !== APPROVAL_ENTRY_TYPE) continue;
		if (!Array.isArray(custom.data?.approvedPaths)) continue;
		for (const target of custom.data.approvedPaths) {
			if (typeof target === "string" && target.length > 0) approved.add(target);
		}
	}
	return approved;
}

export async function ensureApplyPatchPathsApproved(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	targetPaths: string[],
): Promise<void> {
	const approved = getApprovedPathsFromSession(ctx);
	const pending = targetPaths.filter((target) => !approved.has(target));
	if (pending.length === 0) return;

	pi.appendEntry<ApplyPatchApprovalEntry>(APPROVAL_ENTRY_TYPE, {
		approvedPaths: pending,
	});
}

export async function ensureApplyPatchApprovedAtCwd(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	patchText: string,
	cwd: string,
): Promise<void> {
	const targets = getApplyPatchTargetPathsAtCwd(patchText, cwd);
	await ensureApplyPatchPathsApproved(pi, ctx, targets);
}

export function getApplyPatchTargetPathsAtCwd(patchText: string, cwd: string): string[] {
	const parsed = parsePatch(patchText.trim());
	const effectiveCwd = resolvePatchWorkdir(parsed.workdir, cwd);
	const touched = new Set<string>();

	for (const hunk of parsed.hunks) {
		touched.add(ensureWorkspaceRelativePatchPath(hunk.path, effectiveCwd));
		if (hunk.type === "update" && hunk.move_path) {
			touched.add(ensureWorkspaceRelativePatchPath(hunk.move_path, effectiveCwd));
		}
	}

	return Array.from(touched);
}

async function planChanges(patchText: string, cwd: string): Promise<PlannedFileChange[]> {
	if (!patchText) throw new Error("patchText is required");

	let hunks: Hunk[];
	let normalizedPatch = "";
	let effectiveCwd = cwd;
	try {
		const parsed = parsePatch(patchText);
		hunks = parsed.hunks;
		normalizedPatch = parsed.normalizedPatch.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
		effectiveCwd = resolvePatchWorkdir(parsed.workdir, cwd);
	} catch (error) {
		throw new Error(`apply_patch verification failed: ${error}`);
	}

	if (hunks.length === 0) {
		if (normalizedPatch === "*** Begin Patch\n*** End Patch") {
			throw new Error("patch rejected: empty patch");
		}
		throw new Error("apply_patch verification failed: no hunks found");
	}

	const fileChanges: PlannedFileChange[] = [];

	for (const hunk of hunks) {
		const filePath = ensureWorkspaceRelativePatchPath(hunk.path, effectiveCwd);
		const relativePath = path.relative(cwd, filePath) || hunk.path;

		switch (hunk.type) {
			case "add": {
				const oldContent = "";
				const newContent =
					hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`;
				const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, newContent));
				const { additions, deletions } = computeLineCounts(oldContent, newContent);
				fileChanges.push({
					filePath,
					relativePath,
					type: "add",
					oldContent,
					newContent,
					diff,
					additions,
					deletions,
				});
				break;
			}

			case "update": {
				const stats = await fs.stat(filePath).catch(() => null);
				if (!stats || stats.isDirectory()) {
					throw new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`);
				}

				const oldContent = await fs.readFile(filePath, "utf-8");
				let newContent = oldContent;
				try {
					const fileUpdate = deriveNewContentsFromChunks(filePath, hunk.chunks, oldContent);
					newContent = fileUpdate.content;
				} catch (error) {
					throw new Error(`apply_patch verification failed: ${error}`);
				}

				const movePath = hunk.move_path
					? ensureWorkspaceRelativePatchPath(hunk.move_path, effectiveCwd)
					: undefined;
				const outputPath = movePath ?? filePath;
				const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, newContent));
				const { additions, deletions } = computeLineCounts(oldContent, newContent);

				fileChanges.push({
					filePath,
					relativePath: path.relative(cwd, outputPath),
					type: movePath ? "move" : "update",
					oldContent,
					newContent,
					movePath,
					diff,
					additions,
					deletions,
				});
				break;
			}

			case "delete": {
				const contentToDelete = await fs.readFile(filePath, "utf-8").catch((error) => {
					throw new Error(`apply_patch verification failed: ${error}`);
				});
				const diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentToDelete, ""));
				const deletions = contentToDelete.split("\n").length;
				fileChanges.push({
					filePath,
					relativePath,
					type: "delete",
					oldContent: contentToDelete,
					newContent: "",
					diff,
					additions: 0,
					deletions,
				});
				break;
			}
		}
	}

	return fileChanges;
}

async function applyChanges(planned: PlannedFileChange[]) {
	for (const change of planned) {
		switch (change.type) {
			case "add":
				await fs.mkdir(path.dirname(change.filePath), { recursive: true });
				await fs.writeFile(change.filePath, change.newContent, "utf-8");
				break;
			case "update":
				await fs.writeFile(change.filePath, change.newContent, "utf-8");
				break;
			case "move":
				if (!change.movePath) throw new Error(`apply_patch verification failed: missing move destination`);
				await fs.mkdir(path.dirname(change.movePath), { recursive: true });
				await fs.writeFile(change.movePath, change.newContent, "utf-8");
				await fs.unlink(change.filePath);
				break;
			case "delete":
				await fs.unlink(change.filePath);
				break;
		}
	}
}

function buildSummary(changes: PlannedFileChange[]): string {
	const lines = changes.map((change) => {
		if (change.type === "add") return `A ${change.relativePath}`;
		if (change.type === "delete") return `D ${change.relativePath}`;
		return `M ${change.relativePath}`;
	});
	return `Success. Updated the following files:\n${lines.join("\n")}`;
}

export async function executeApplyPatchAtCwd(patchText: string, cwd: string) {
	const planned = await planChanges(patchText, cwd);
	await applyChanges(planned);

	const output = buildSummary(planned);
	const files = planned.map((change) => ({
		filePath: change.filePath,
		relativePath: change.relativePath,
		type: change.type,
		diff: change.diff,
		before: change.oldContent,
		after: change.newContent,
		additions: change.additions,
		deletions: change.deletions,
		movePath: change.movePath,
	}));

	return {
		content: [{ type: "text" as const, text: output }],
		details: {
			files,
			diff: planned.map((c) => c.diff).join("\n"),
		},
	};
}

export default function registerApplyPatch(pi: ExtensionAPI) {
	let lastNonGptTools: string[] | undefined;

	function allToolNames() {
		return new Set(pi.getAllTools().map((t) => t.name));
	}

	function safeSetActiveTools(toolNames: string[]) {
		const allowed = allToolNames();
		const next = unique(toolNames).filter((name) => allowed.has(name));
		const current = pi.getActiveTools();
		if (next.length === current.length && next.every((name, idx) => name === current[idx])) return;
		pi.setActiveTools(next);
	}

	function applyToolPolicy(ctx: ExtensionContext) {
		const current = pi.getActiveTools();
		const isGpt = isGptFamilyModel(ctx.model);

		if (isGpt) {
			lastNonGptTools = current.filter((name) => name !== TOOL_NAME);
			const next = current.filter((name) => name !== "edit" && name !== "write" && name !== TOOL_NAME);
			next.push(TOOL_NAME);
			safeSetActiveTools(next);
			ctx.ui.setStatus(STATUS_KEY, "apply_patch enabled (GPT model)");
			return;
		}

		const restore = (lastNonGptTools ?? current).filter((name) => name !== TOOL_NAME);
		safeSetActiveTools(restore);
		lastNonGptTools = restore;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	pi.on("session_start", async (_event, ctx) => {
		applyToolPolicy(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		applyToolPolicy(ctx);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = typeof (event.input as { command?: unknown })?.command === "string"
				? ((event.input as { command?: string }).command ?? "")
				: "";
			if (looksLikeApplyPatchShellInvocation(command)) {
				return {
					block: true,
					reason: "apply_patch was requested via bash. Use the apply_patch tool instead.",
				};
			}
			return undefined;
		}

		if (event.toolName !== TOOL_NAME) return undefined;

		try {
			const patchText = getApplyPatchTextFromParams(event.input);
			await ensureApplyPatchApprovedAtCwd(pi, ctx, patchText, ctx.cwd);
			return undefined;
		} catch (error) {
			return {
				block: true,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	});

	pi.registerTool({
		name: TOOL_NAME,
		label: "apply_patch",
		description:
			"Apply a structured patch to files. Uses Codex/OpenCode-style patch format with *** Begin Patch/*** End Patch envelopes and Add/Update/Delete operations.",
		parameters: Type.Object({
			patchText: Type.Optional(
				Type.String({
					description: "Full patch text in apply_patch format",
				}),
			),
			input: Type.Optional(
				Type.String({
					description: "Full patch text in apply_patch format (Codex JSON tool compatibility)",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const patchText = getApplyPatchTextFromParams(params);
			await ensureApplyPatchApprovedAtCwd(pi, ctx, patchText, ctx.cwd);
			return executeApplyPatchAtCwd(patchText, ctx.cwd);
		},
	});
}
