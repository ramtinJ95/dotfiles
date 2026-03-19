import type { FindSpec, VimMotion } from "./types";

type CharClass = "whitespace" | "word" | "punctuation";

function classify(char: string): CharClass {
	if (/\s/u.test(char)) return "whitespace";
	if (/[\p{L}\p{N}_]/u.test(char)) return "word";
	return "punctuation";
}

function clampIndex(buffer: string, index: number): number {
	if (index <= 0) return 0;
	if (index >= buffer.length) return buffer.length;
	return index;
}

export function getLineBounds(buffer: string, index: number): { start: number; endExclusive: number } {
	const i = clampIndex(buffer, index);
	let start = i;
	while (start > 0 && buffer[start - 1] !== "\n") start--;

	let endExclusive = i;
	while (endExclusive < buffer.length && buffer[endExclusive] !== "\n") endExclusive++;

	return { start, endExclusive };
}

export function resolveWordForward(buffer: string, cursorIndex: number): number {
	const len = buffer.length;
	let i = clampIndex(buffer, cursorIndex);
	if (i >= len) return len;

	const currentClass = classify(buffer[i] ?? "");

	if (currentClass === "whitespace") {
		while (i < len && classify(buffer[i] ?? "") === "whitespace") i++;
		return i;
	}

	while (i < len && classify(buffer[i] ?? "") === currentClass) i++;
	while (i < len && classify(buffer[i] ?? "") === "whitespace") i++;

	return i;
}

export function resolveFindTarget(buffer: string, cursorIndex: number, spec: FindSpec): number | null {
	const cursor = clampIndex(buffer, cursorIndex);
	const line = getLineBounds(buffer, cursor);

	if (spec.direction === "forward") {
		for (let i = cursor + 1; i < line.endExclusive; i++) {
			if (buffer[i] !== spec.char) continue;
			return spec.till ? Math.max(cursor, i - 1) : i;
		}
		return null;
	}

	for (let i = cursor - 1; i >= line.start; i--) {
		if (buffer[i] !== spec.char) continue;
		return spec.till ? Math.min(cursor, i + 1) : i;
	}
	return null;
}

export function reverseFindSpec(spec: FindSpec): FindSpec {
	return {
		...spec,
		direction: spec.direction === "forward" ? "backward" : "forward",
	};
}

export function resolveMotion(buffer: string, cursorIndex: number, motion: VimMotion): number {
	switch (motion) {
		case "wordForward":
			return resolveWordForward(buffer, cursorIndex);
		default:
			return cursorIndex;
	}
}
