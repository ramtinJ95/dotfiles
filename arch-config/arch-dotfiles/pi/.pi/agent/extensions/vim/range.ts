import { getLineBounds } from "./motions";
import type { TextObjectKind, VimOperator } from "./types";

export interface OperatorRange {
	start: number;
	endExclusive: number;
	cursorAfter: number;
}

function clampIndex(buffer: string, index: number): number {
	if (index <= 0) return 0;
	if (index >= buffer.length) return buffer.length;
	return index;
}

type CharClass = "whitespace" | "word" | "punctuation";

function classify(char: string): CharClass {
	if (/\s/u.test(char)) return "whitespace";
	if (/[\p{L}\p{N}_]/u.test(char)) return "word";
	return "punctuation";
}

function resolveChangeWordEnd(buffer: string, start: number): number {
	if (start >= buffer.length) return start;
	const first = buffer[start] ?? "";
	if (/\s/u.test(first)) return start;

	const cls = classify(first);
	let end = start;
	while (end < buffer.length && classify(buffer[end] ?? "") === cls) {
		end++;
	}
	return end;
}

function isWordChar(char: string): boolean {
	return /[\p{L}\p{N}_]/u.test(char);
}

function isEscaped(line: string, idx: number): boolean {
	let backslashes = 0;
	for (let i = idx - 1; i >= 0 && line[i] === "\\"; i--) {
		backslashes++;
	}
	return backslashes % 2 === 1;
}

function resolveInnerWordRange(buffer: string, cursorIndex: number): OperatorRange | null {
	if (buffer.length === 0) return null;
	const cursor = clampIndex(buffer, cursorIndex);
	const line = getLineBounds(buffer, cursor);
	if (line.endExclusive <= line.start) return null;

	let probe = Math.min(cursor, line.endExclusive - 1);
	if (probe < line.start) probe = line.start;

	if (!isWordChar(buffer[probe] ?? "")) {
		let right = probe;
		while (right < line.endExclusive && !isWordChar(buffer[right] ?? "")) right++;
		if (right < line.endExclusive) {
			probe = right;
		} else {
			let left = probe;
			while (left >= line.start && !isWordChar(buffer[left] ?? "")) left--;
			if (left < line.start) return null;
			probe = left;
		}
	}

	let start = probe;
	while (start > line.start && isWordChar(buffer[start - 1] ?? "")) start--;

	let endExclusive = probe;
	while (endExclusive < line.endExclusive && isWordChar(buffer[endExclusive] ?? "")) endExclusive++;

	return { start, endExclusive, cursorAfter: start };
}

function resolveInsideQuotesRange(buffer: string, cursorIndex: number, quote: '"' | "'" | "`"): OperatorRange | null {
	const cursor = clampIndex(buffer, cursorIndex);
	const line = getLineBounds(buffer, cursor);
	const text = buffer.slice(line.start, line.endExclusive);
	const col = cursor - line.start;

	const positions: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === quote && !isEscaped(text, i)) positions.push(i);
	}

	const pairs: Array<{ open: number; close: number }> = [];
	for (let i = 0; i + 1 < positions.length; i += 2) {
		pairs.push({ open: positions[i]!, close: positions[i + 1]! });
	}

	if (pairs.length === 0) return null;

	// Vim-like behavior:
	// 1) If cursor is inside/on a quoted pair, use that pair.
	// 2) Otherwise, use the first quoted pair to the right (supports di" before first quote).
	// 3) If none to the right, fall back to the closest pair on the left.
	let selected: { open: number; close: number } | null = null;

	for (const pair of pairs) {
		if (col < pair.open || col > pair.close) continue;
		if (!selected || pair.close - pair.open < selected.close - selected.open) {
			selected = pair;
		}
	}

	if (!selected) {
		selected = pairs.find((pair) => pair.open > col) ?? null;
	}

	if (!selected) {
		for (let i = pairs.length - 1; i >= 0; i--) {
			const pair = pairs[i];
			if (!pair) continue;
			if (pair.close < col) {
				selected = pair;
				break;
			}
		}
	}

	if (!selected) return null;

	const start = line.start + selected.open + 1;
	const endExclusive = line.start + selected.close;
	return { start, endExclusive, cursorAfter: start };
}

function resolveInsidePairRange(
	buffer: string,
	cursorIndex: number,
	openChar: "(" | "[" | "{",
	closeChar: ")" | "]" | "}",
): OperatorRange | null {
	const cursor = clampIndex(buffer, cursorIndex);
	const line = getLineBounds(buffer, cursor);
	const text = buffer.slice(line.start, line.endExclusive);
	const col = cursor - line.start;

	let left = -1;
	let depth = 0;
	for (let i = Math.min(col, text.length - 1); i >= 0; i--) {
		const ch = text[i];
		if (ch === closeChar) {
			depth++;
		} else if (ch === openChar) {
			if (depth === 0) {
				left = i;
				break;
			}
			depth--;
		}
	}
	if (left === -1) return null;

	let right = -1;
	depth = 0;
	for (let i = left + 1; i < text.length; i++) {
		const ch = text[i];
		if (ch === openChar) {
			depth++;
		} else if (ch === closeChar) {
			if (depth === 0) {
				right = i;
				break;
			}
			depth--;
		}
	}
	if (right === -1) return null;
	if (col < left || col > right) return null;

	const start = line.start + left + 1;
	const endExclusive = line.start + right;
	return { start, endExclusive, cursorAfter: start };
}

export function resolveTextObjectRange(buffer: string, cursorIndex: number, object: TextObjectKind): OperatorRange | null {
	switch (object.type) {
		case "innerWord":
			return resolveInnerWordRange(buffer, cursorIndex);
		case "insideQuotes":
			return resolveInsideQuotesRange(buffer, cursorIndex, object.quote);
		case "insidePair":
			return resolveInsidePairRange(buffer, cursorIndex, object.open, object.close);
		default:
			return null;
	}
}

export function resolveOperatorRange(
	buffer: string,
	cursorIndex: number,
	operator: VimOperator,
	motionTarget: number,
): OperatorRange | null {
	const start = clampIndex(buffer, cursorIndex);
	let endExclusive = clampIndex(buffer, motionTarget);

	if (operator === "change") {
		const changeEnd = resolveChangeWordEnd(buffer, start);
		if (changeEnd > start) {
			endExclusive = Math.min(endExclusive, changeEnd);
		}
	}

	if (endExclusive <= start) return null;

	return {
		start,
		endExclusive,
		cursorAfter: start,
	};
}
