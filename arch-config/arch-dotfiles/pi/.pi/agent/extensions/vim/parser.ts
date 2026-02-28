import type { FindDirection, NormalCommand, TextObjectKind, VimState } from "./types";

function isPrintable(key: string): boolean {
	return key.length === 1 && key.charCodeAt(0) >= 32;
}

function parseFindPrefix(key: string): { direction: FindDirection; till: boolean } | null {
	switch (key) {
		case "f":
			return { direction: "forward", till: false };
		case "F":
			return { direction: "backward", till: false };
		case "t":
			return { direction: "forward", till: true };
		case "T":
			return { direction: "backward", till: true };
		default:
			return null;
	}
}

function parseInsideTextObjectTarget(key: string): TextObjectKind | null {
	switch (key) {
		case "w":
			return { type: "innerWord" };
		case '"':
			return { type: "insideQuotes", quote: '"' };
		case "'":
			return { type: "insideQuotes", quote: "'" };
		case "`":
			return { type: "insideQuotes", quote: "`" };
		case "(":
		case ")":
			return { type: "insidePair", open: "(", close: ")" };
		case "[":
		case "]":
			return { type: "insidePair", open: "[", close: "]" };
		case "{":
		case "}":
			return { type: "insidePair", open: "{", close: "}" };
		default:
			return null;
	}
}

export function parseNormalKey(key: string, state: VimState): NormalCommand {
	if (state.pendingFind) {
		if (!isPrintable(key)) return { type: "clearPending" };
		if (state.pendingOperator) {
			return {
				type: "operatorFindChar",
				operator: state.pendingOperator,
				spec: { ...state.pendingFind, char: key },
			};
		}
		return {
			type: "findChar",
			spec: { ...state.pendingFind, char: key },
		};
	}

	if (state.pendingTextObject) {
		const object = parseInsideTextObjectTarget(key);
		if (!object || !state.pendingOperator) return { type: "clearPending" };
		return { type: "operatorTextObject", operator: state.pendingOperator, object };
	}

	if (state.pendingOperator) {
		const findPrefix = parseFindPrefix(key);
		if (findPrefix) {
			return { type: "setPendingFind", spec: findPrefix };
		}
		if (key === ";") {
			return { type: "operatorRepeatFind", operator: state.pendingOperator, reverse: false };
		}
		if (key === ",") {
			return { type: "operatorRepeatFind", operator: state.pendingOperator, reverse: true };
		}
		if (key === "i") {
			return { type: "setPendingTextObject", prefix: "inside" };
		}
		if (key === "w") {
			return { type: "operatorMotion", operator: state.pendingOperator, motion: "wordForward" };
		}
		if (state.pendingOperator === "delete" && key === "d") {
			return { type: "deleteLine" };
		}
		return { type: "clearPending" };
	}

	if (state.pendingPrefix) {
		if (state.pendingPrefix === "g" && key === "g") {
			return { type: "gotoBufferStart" };
		}
		return { type: "clearPending" };
	}

	const findPrefix = parseFindPrefix(key);
	if (findPrefix) {
		return { type: "setPendingFind", spec: findPrefix };
	}

	switch (key) {
		case ";":
			return { type: "repeatFind", reverse: false };
		case ",":
			return { type: "repeatFind", reverse: true };
		case "h":
			return { type: "move", move: "left" };
		case "j":
			return { type: "move", move: "down" };
		case "k":
			return { type: "move", move: "up" };
		case "l":
			return { type: "move", move: "right" };
		case "w":
			return { type: "move", move: "wordForward" };
		case "b":
			return { type: "move", move: "wordBackward" };
		case "0":
			return { type: "move", move: "lineStart" };
		case "$":
			return { type: "move", move: "lineEnd" };
		case "G":
			return { type: "move", move: "bufferEnd" };
		case "g":
			return { type: "setPendingPrefix", prefix: "g" };
		case "u":
			return { type: "edit", edit: "undo" };
		case "x":
			return { type: "edit", edit: "deleteChar" };
		case "d":
			return { type: "setPendingOperator", operator: "delete" };
		case "c":
			return { type: "setPendingOperator", operator: "change" };
		case "i":
			return { type: "switchMode", mode: "insert" };
		case "a":
			return { type: "appendInsert" };
		case "I":
			return { type: "insertLineStart" };
		case "A":
			return { type: "insertLineEnd" };
		case "o":
			return { type: "openBelow" };
		case "O":
			return { type: "openAbove" };
		default:
			return { type: "noop" };
	}
}
