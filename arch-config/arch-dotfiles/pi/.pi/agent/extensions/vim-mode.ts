import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// Common escape sequences
const SEQ_NEWLINE = "\x1b[13;2u"; // Standard Shift+Enter sequence
const SEQ_HOME = "\x01";          // Ctrl+A
const SEQ_END = "\x05";           // Ctrl+E
const SEQ_KILL_LINE = "\x0b";     // Ctrl+K
const SEQ_DELETE = "\x1b[3~";     // Delete key
const SEQ_UNDO = "\x1f";           // Ctrl+_

class VimEditor extends CustomEditor {
    private mode: "normal" | "insert" = "insert";
    private pendingKey: string = "";

    handleInput(data: string): void {
        // --- Global Handling ---
        if (matchesKey(data, "escape")) {
            if (this.mode === "insert") {
                this.mode = "normal";
                this.pendingKey = "";
                return;
            }
            super.handleInput(data);
            return;
        }

        // --- Insert Mode ---
        if (this.mode === "insert") {
            super.handleInput(data);
            return;
        }

        // --- Normal Mode ---
        
        // Multi-key command handling (dd, gg)
        if (this.pendingKey === "d") {
            if (data === "d") {
                super.handleInput(SEQ_HOME);
                super.handleInput(SEQ_KILL_LINE);
                super.handleInput(SEQ_DELETE); // Pull the line below up
            }
            this.pendingKey = "";
            return;
        }
        if (this.pendingKey === "g") {
            if (data === "g") {
                super.handleInput("\x1b[1;5H"); // Ctrl+Home
            }
            this.pendingKey = "";
            return;
        }

        // Movements
        if (data === "h") { super.handleInput("\x1b[D"); return; }
        if (data === "j") { super.handleInput("\x1b[B"); return; }
        if (data === "k") { super.handleInput("\x1b[A"); return; }
        if (data === "l") { super.handleInput("\x1b[C"); return; }
        if (data === "w") { super.handleInput("\x1bf"); return; } 
        if (data === "b") { super.handleInput("\x1bb"); return; }
        if (data === "0") { super.handleInput(SEQ_HOME); return; }
        if (data === "$") { super.handleInput(SEQ_END); return; }
        if (data === "G") { super.handleInput("\x1b[1;5F"); return; } // Ctrl+End
        if (data === "g") { this.pendingKey = "g"; return; }

        // Editing
        if (data === "u") { super.handleInput(SEQ_UNDO); return; }
        if (data === "x") { super.handleInput(SEQ_DELETE); return; }
        if (data === "d") { this.pendingKey = "d"; return; }

        // Mode switches
        if (data === "i") { this.mode = "insert"; return; }
        if (data === "a") { super.handleInput("\x1b[C"); this.mode = "insert"; return; }
        if (data === "I") { super.handleInput(SEQ_HOME); this.mode = "insert"; return; }
        if (data === "A") { super.handleInput(SEQ_END); this.mode = "insert"; return; }

        // Line Creation (o, O)
        if (data === "o") {
            super.handleInput(SEQ_END);
            super.handleInput(SEQ_NEWLINE);
            this.mode = "insert";
            return;
        }
        if (data === "O") {
            super.handleInput(SEQ_HOME);
            super.handleInput(SEQ_NEWLINE);
            super.handleInput("\x1b[A"); // Move back up
            this.mode = "insert";
            return;
        }

        // Ignore other printable characters in Normal mode
        if (data.length === 1 && data.charCodeAt(0) >= 32) return;
        super.handleInput(data);
    }

    render(width: number): string[] {
        const lines = super.render(width);
        if (lines.length === 0) return lines;
        const label = this.mode === "normal" ? (this.pendingKey ? ` -- ${this.pendingKey}... -- ` : " -- NORMAL -- ") : " -- INSERT -- ";
        const last = lines.length - 1;
        if (visibleWidth(lines[last]!) >= label.length) {
            lines[last] = truncateToWidth(lines[last]!, width - label.length, "") + label;
        }
        return lines;
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => {
        ctx.ui.setEditorComponent((tui, theme, kb) => new VimEditor(tui, theme, kb));
    });
}
