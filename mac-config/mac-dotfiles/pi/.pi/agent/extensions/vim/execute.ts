import { resolveFindTarget, resolveMotion, reverseFindSpec } from "./motions";
import { resolveOperatorRange, resolveTextObjectRange, type OperatorRange } from "./range";
import type { FindSpec, VimMode, VimMotion, VimOperator, TextObjectKind } from "./types";
import { EditorAdapter } from "./adapter";

export interface OperatorExecutionResult {
	applied: boolean;
	nextMode: VimMode | null;
}

export interface FindExecutionResult {
	applied: boolean;
	usedSpec?: FindSpec;
}

function applyOperatorRange(
	adapter: EditorAdapter,
	operator: VimOperator,
	range: OperatorRange | null,
): OperatorExecutionResult {
	if (!range) {
		return { applied: false, nextMode: null };
	}

	if (range.endExclusive > range.start) {
		adapter.replaceRange(range.start, range.endExclusive, "", range.cursorAfter);
		return {
			applied: true,
			nextMode: operator === "change" ? "insert" : "normal",
		};
	}

	if (operator === "change") {
		adapter.setCursorIndex(range.cursorAfter);
		return { applied: false, nextMode: "insert" };
	}

	return { applied: false, nextMode: null };
}

function resolveOperatorFindRange(cursorIndex: number, target: number, spec: FindSpec): OperatorRange | null {
	if (target === cursorIndex) return null;

	if (spec.direction === "forward") {
		return {
			start: cursorIndex,
			endExclusive: target + 1,
			cursorAfter: cursorIndex,
		};
	}

	return {
		start: target,
		endExclusive: cursorIndex + 1,
		cursorAfter: target,
	};
}

export function executeOperatorMotion(
	adapter: EditorAdapter,
	operator: VimOperator,
	motion: VimMotion,
): OperatorExecutionResult {
	const buffer = adapter.getText();
	const cursorIndex = adapter.getCursorIndex();
	const motionTarget = resolveMotion(buffer, cursorIndex, motion);
	const range = resolveOperatorRange(buffer, cursorIndex, operator, motionTarget);
	return applyOperatorRange(adapter, operator, range);
}

export function executeFind(adapter: EditorAdapter, spec: FindSpec): FindExecutionResult {
	const buffer = adapter.getText();
	const cursorIndex = adapter.getCursorIndex();
	const target = resolveFindTarget(buffer, cursorIndex, spec);
	if (target === null) return { applied: false };

	adapter.setCursorIndex(target);
	return { applied: true, usedSpec: spec };
}

export function executeRepeatFind(adapter: EditorAdapter, lastFind: FindSpec | null, reverse: boolean): FindExecutionResult {
	if (!lastFind) return { applied: false };
	const spec = reverse ? reverseFindSpec(lastFind) : lastFind;
	return executeFind(adapter, spec);
}

export function executeOperatorFind(adapter: EditorAdapter, operator: VimOperator, spec: FindSpec): OperatorExecutionResult {
	const buffer = adapter.getText();
	const cursorIndex = adapter.getCursorIndex();
	const target = resolveFindTarget(buffer, cursorIndex, spec);
	if (target === null) return { applied: false, nextMode: null };

	const range = resolveOperatorFindRange(cursorIndex, target, spec);
	return applyOperatorRange(adapter, operator, range);
}

export function executeOperatorRepeatFind(
	adapter: EditorAdapter,
	operator: VimOperator,
	lastFind: FindSpec | null,
	reverse: boolean,
): { result: OperatorExecutionResult; usedSpec?: FindSpec } {
	if (!lastFind) return { result: { applied: false, nextMode: null } };
	const spec = reverse ? reverseFindSpec(lastFind) : lastFind;
	return { result: executeOperatorFind(adapter, operator, spec), usedSpec: spec };
}

export function executeOperatorTextObject(
	adapter: EditorAdapter,
	operator: VimOperator,
	object: TextObjectKind,
): OperatorExecutionResult {
	const buffer = adapter.getText();
	const cursorIndex = adapter.getCursorIndex();
	const range = resolveTextObjectRange(buffer, cursorIndex, object);
	return applyOperatorRange(adapter, operator, range);
}
