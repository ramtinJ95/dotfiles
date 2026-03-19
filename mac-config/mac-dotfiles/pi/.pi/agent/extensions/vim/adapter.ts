import type { CustomEditor } from "@mariozechner/pi-coding-agent";

interface UnsafeEditorState {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
}

interface UnsafeCustomEditor {
	state?: UnsafeEditorState;
	setCursorCol?: (col: number) => void;
	preferredVisualCol?: number | null;
	invalidate?: () => void;
}

export class EditorAdapter {
	constructor(private readonly editor: CustomEditor) {}

	getText(): string {
		return this.editor.getText();
	}

	getCursorIndex(): number {
		const lines = this.editor.getLines();
		const cursor = this.editor.getCursor();
		return lineColToIndex(lines, cursor.line, cursor.col);
	}

	setCursorIndex(cursorIndex: number): void {
		const text = this.getText();
		this.setCursorFromIndex(text, cursorIndex);
	}

	replaceRange(start: number, endExclusive: number, replacement: string, cursorAfter: number): void {
		const text = this.getText();
		const safeStart = clampToLength(text.length, start);
		const safeEnd = clampToLength(text.length, endExclusive);
		const newText = text.slice(0, safeStart) + replacement + text.slice(safeEnd);
		this.editor.setText(newText);
		this.setCursorFromIndex(newText, cursorAfter);
	}

	private setCursorFromIndex(text: string, cursorIndex: number): void {
		const unsafe = this.editor as unknown as UnsafeCustomEditor;
		if (!unsafe.state) return;

		const clampedCursorIndex = clampToLength(text.length, cursorIndex);
		const position = indexToLineCol(text, clampedCursorIndex);

		unsafe.state.cursorLine = position.line;
		if (typeof unsafe.setCursorCol === "function") {
			unsafe.setCursorCol(position.col);
		} else {
			unsafe.state.cursorCol = position.col;
		}
		unsafe.preferredVisualCol = null;
		unsafe.invalidate?.();
	}
}

function clampToLength(length: number, value: number): number {
	if (value <= 0) return 0;
	if (value >= length) return length;
	return value;
}

function clampToMax(maxInclusive: number, value: number): number {
	if (value <= 0) return 0;
	if (value >= maxInclusive) return maxInclusive;
	return value;
}

function lineColToIndex(lines: string[], line: number, col: number): number {
	if (lines.length === 0) return 0;
	const safeLine = clampToMax(lines.length - 1, line);
	let index = 0;
	for (let i = 0; i < safeLine; i++) {
		index += (lines[i] ?? "").length + 1;
	}
	const safeCol = clampToMax((lines[safeLine] ?? "").length, col);
	return index + safeCol;
}

function indexToLineCol(text: string, index: number): { line: number; col: number } {
	let line = 0;
	let col = 0;
	for (let i = 0; i < index; i++) {
		const char = text[i];
		if (char === "\n") {
			line++;
			col = 0;
		} else {
			col++;
		}
	}
	return { line, col };
}
