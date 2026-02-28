export type VimMode = "normal" | "insert";
export type PendingPrefix = "g";
export type PendingTextObjectPrefix = "inside";

export type VimOperator = "delete" | "change";
export type VimMotion = "wordForward";

export type FindDirection = "forward" | "backward";

export interface PendingFind {
	direction: FindDirection;
	till: boolean;
}

export interface FindSpec extends PendingFind {
	char: string;
}

export type TextObjectKind =
	| { type: "innerWord" }
	| { type: "insideQuotes"; quote: '"' | "'" | "`" }
	| { type: "insidePair"; open: "(" | "[" | "{"; close: ")" | "]" | "}" };

export interface VimState {
	mode: VimMode;
	pendingOperator: VimOperator | null;
	pendingPrefix: PendingPrefix | null;
	pendingFind: PendingFind | null;
	pendingTextObject: PendingTextObjectPrefix | null;
	lastFind: FindSpec | null;
}

export type MoveCommand =
	| "left"
	| "down"
	| "up"
	| "right"
	| "wordForward"
	| "wordBackward"
	| "lineStart"
	| "lineEnd"
	| "bufferEnd";

export type EditCommand = "undo" | "deleteChar";

export type NormalCommand =
	| { type: "setPendingOperator"; operator: VimOperator }
	| { type: "setPendingPrefix"; prefix: PendingPrefix }
	| { type: "setPendingFind"; spec: PendingFind }
	| { type: "setPendingTextObject"; prefix: PendingTextObjectPrefix }
	| { type: "operatorMotion"; operator: VimOperator; motion: VimMotion }
	| { type: "operatorFindChar"; operator: VimOperator; spec: FindSpec }
	| { type: "operatorRepeatFind"; operator: VimOperator; reverse: boolean }
	| { type: "operatorTextObject"; operator: VimOperator; object: TextObjectKind }
	| { type: "findChar"; spec: FindSpec }
	| { type: "repeatFind"; reverse: boolean }
	| { type: "deleteLine" }
	| { type: "gotoBufferStart" }
	| { type: "move"; move: MoveCommand }
	| { type: "edit"; edit: EditCommand }
	| { type: "switchMode"; mode: "insert" }
	| { type: "appendInsert" }
	| { type: "insertLineStart" }
	| { type: "insertLineEnd" }
	| { type: "openBelow" }
	| { type: "openAbove" }
	| { type: "clearPending" }
	| { type: "noop" };
