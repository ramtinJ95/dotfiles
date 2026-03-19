import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { EditorAdapter } from "./vim/adapter";
import {
	executeFind,
	executeOperatorFind,
	executeOperatorMotion,
	executeOperatorRepeatFind,
	executeOperatorTextObject,
	executeRepeatFind,
} from "./vim/execute";
import { parseNormalKey } from "./vim/parser";
import { clearPending, createInitialState, hasPending, pendingLabel } from "./vim/state";
import type { MoveCommand, NormalCommand, VimState } from "./vim/types";

// Common escape sequences
const SEQ_NEWLINE = "\x1b[13;2u"; // Standard Shift+Enter sequence
const SEQ_HOME = "\x01"; // Ctrl+A
const SEQ_END = "\x05"; // Ctrl+E
const SEQ_KILL_LINE = "\x0b"; // Ctrl+K
const SEQ_DELETE = "\x1b[3~"; // Delete key
const SEQ_UNDO = "\x1f"; // Ctrl+_
const SEQ_BUFFER_HOME = "\x1b[1;5H"; // Ctrl+Home
const SEQ_BUFFER_END = "\x1b[1;5F"; // Ctrl+End

function isPrintable(data: string): boolean {
	return data.length === 1 && data.charCodeAt(0) >= 32;
}

class VimEditor extends CustomEditor {
	private readonly vimState: VimState = createInitialState();
	private adapter?: EditorAdapter;

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.vimState.mode === "insert") {
				this.vimState.mode = "normal";
				clearPending(this.vimState);
				return;
			}
			if (hasPending(this.vimState)) {
				clearPending(this.vimState);
				return;
			}
			super.handleInput(data);
			return;
		}

		if (this.vimState.mode === "insert") {
			super.handleInput(data);
			return;
		}

		if (!isPrintable(data)) {
			super.handleInput(data);
			return;
		}

		const command = parseNormalKey(data, this.vimState);
		this.executeNormalCommand(command);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) return lines;

		let label = " -- INSERT -- ";
		if (this.vimState.mode === "normal") {
			const pending = pendingLabel(this.vimState);
			label = pending ? ` -- NORMAL (${pending}) -- ` : " -- NORMAL -- ";
		}

		const last = lines.length - 1;
		if (visibleWidth(lines[last]!) >= label.length) {
			lines[last] = truncateToWidth(lines[last]!, width - label.length, "") + label;
		}
		return lines;
	}

	private getAdapter(): EditorAdapter {
		if (!this.adapter) this.adapter = new EditorAdapter(this);
		return this.adapter;
	}

	private executeNormalCommand(command: NormalCommand): void {
		switch (command.type) {
			case "setPendingOperator":
				this.vimState.pendingOperator = command.operator;
				this.vimState.pendingPrefix = null;
				this.vimState.pendingFind = null;
				this.vimState.pendingTextObject = null;
				return;
			case "setPendingPrefix":
				this.vimState.pendingPrefix = command.prefix;
				this.vimState.pendingOperator = null;
				this.vimState.pendingFind = null;
				this.vimState.pendingTextObject = null;
				return;
			case "setPendingFind":
				this.vimState.pendingFind = command.spec;
				return;
			case "setPendingTextObject":
				this.vimState.pendingTextObject = command.prefix;
				return;
			case "clearPending":
				clearPending(this.vimState);
				return;
			case "operatorMotion": {
				const result = executeOperatorMotion(this.getAdapter(), command.operator, command.motion);
				clearPending(this.vimState);
				if (result.nextMode) {
					this.vimState.mode = result.nextMode;
				}
				return;
			}
			case "operatorFindChar": {
				const result = executeOperatorFind(this.getAdapter(), command.operator, command.spec);
				clearPending(this.vimState);
				if (result.nextMode) {
					this.vimState.mode = result.nextMode;
				}
				if (result.applied) {
					this.vimState.lastFind = command.spec;
				}
				return;
			}
			case "operatorRepeatFind": {
				const { result, usedSpec } = executeOperatorRepeatFind(
					this.getAdapter(),
					command.operator,
					this.vimState.lastFind,
					command.reverse,
				);
				clearPending(this.vimState);
				if (result.nextMode) {
					this.vimState.mode = result.nextMode;
				}
				if (result.applied && usedSpec) {
					this.vimState.lastFind = usedSpec;
				}
				return;
			}
			case "operatorTextObject": {
				const result = executeOperatorTextObject(this.getAdapter(), command.operator, command.object);
				clearPending(this.vimState);
				if (result.nextMode) {
					this.vimState.mode = result.nextMode;
				}
				return;
			}
			case "findChar": {
				const result = executeFind(this.getAdapter(), command.spec);
				clearPending(this.vimState);
				if (result.applied) {
					this.vimState.lastFind = command.spec;
				}
				return;
			}
			case "repeatFind": {
				const result = executeRepeatFind(this.getAdapter(), this.vimState.lastFind, command.reverse);
				if (result.applied && result.usedSpec) {
					this.vimState.lastFind = result.usedSpec;
				}
				return;
			}
			case "deleteLine":
				clearPending(this.vimState);
				super.handleInput(SEQ_HOME);
				super.handleInput(SEQ_KILL_LINE);
				super.handleInput(SEQ_DELETE); // pull next line up
				return;
			case "gotoBufferStart":
				clearPending(this.vimState);
				super.handleInput(SEQ_BUFFER_HOME);
				return;
			case "move":
				clearPending(this.vimState);
				this.executeMove(command.move);
				return;
			case "edit":
				clearPending(this.vimState);
				if (command.edit === "undo") {
					super.handleInput(SEQ_UNDO);
				} else {
					super.handleInput(SEQ_DELETE);
				}
				return;
			case "switchMode":
				clearPending(this.vimState);
				this.vimState.mode = command.mode;
				return;
			case "appendInsert":
				clearPending(this.vimState);
				super.handleInput("\x1b[C");
				this.vimState.mode = "insert";
				return;
			case "insertLineStart":
				clearPending(this.vimState);
				super.handleInput(SEQ_HOME);
				this.vimState.mode = "insert";
				return;
			case "insertLineEnd":
				clearPending(this.vimState);
				super.handleInput(SEQ_END);
				this.vimState.mode = "insert";
				return;
			case "openBelow":
				clearPending(this.vimState);
				super.handleInput(SEQ_END);
				super.handleInput(SEQ_NEWLINE);
				this.vimState.mode = "insert";
				return;
			case "openAbove":
				clearPending(this.vimState);
				super.handleInput(SEQ_HOME);
				super.handleInput(SEQ_NEWLINE);
				super.handleInput("\x1b[A");
				this.vimState.mode = "insert";
				return;
			case "noop":
				return;
		}
	}

	private executeMove(move: MoveCommand): void {
		switch (move) {
			case "left":
				super.handleInput("\x1b[D");
				return;
			case "down":
				super.handleInput("\x1b[B");
				return;
			case "up":
				super.handleInput("\x1b[A");
				return;
			case "right":
				super.handleInput("\x1b[C");
				return;
			case "wordForward":
				super.handleInput("\x1bf");
				return;
			case "wordBackward":
				super.handleInput("\x1bb");
				return;
			case "lineStart":
				super.handleInput(SEQ_HOME);
				return;
			case "lineEnd":
				super.handleInput(SEQ_END);
				return;
			case "bufferEnd":
				super.handleInput(SEQ_BUFFER_END);
				return;
		}
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => new VimEditor(tui, theme, kb));
	});
}
