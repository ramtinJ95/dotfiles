import type { PendingFind, VimOperator, VimState } from "./types";

export function createInitialState(): VimState {
	return {
		mode: "insert",
		pendingOperator: null,
		pendingPrefix: null,
		pendingFind: null,
		pendingTextObject: null,
		lastFind: null,
	};
}

export function clearPending(state: VimState): void {
	state.pendingOperator = null;
	state.pendingPrefix = null;
	state.pendingFind = null;
	state.pendingTextObject = null;
}

export function hasPending(state: VimState): boolean {
	return (
		state.pendingOperator !== null ||
		state.pendingPrefix !== null ||
		state.pendingFind !== null ||
		state.pendingTextObject !== null
	);
}

function operatorLabel(operator: VimOperator | null): string {
	if (operator === "delete") return "d";
	if (operator === "change") return "c";
	return "";
}

function findLabel(find: PendingFind | null): string {
	if (!find) return "";
	if (find.direction === "forward") return find.till ? "t" : "f";
	return find.till ? "T" : "F";
}

export function pendingLabel(state: VimState): string | null {
	const op = operatorLabel(state.pendingOperator);
	if (state.pendingTextObject === "inside") return `${op}i`;
	if (state.pendingFind) return `${op}${findLabel(state.pendingFind)}`;
	if (op) return op;
	if (state.pendingPrefix === "g") return "g";
	return null;
}
