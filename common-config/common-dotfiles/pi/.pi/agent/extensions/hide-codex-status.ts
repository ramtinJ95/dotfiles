import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CODEX_STATUS_KEY = "codex-adapter";
const CODEX_STATUS_TEXT = "\u001b[38;2;0;76;255mCodex adapter\u001b[0m";
const CODEX_ADAPTER_TOOLS = ["exec_command", "write_stdin", "apply_patch"];

function simplifyCodexStatus(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	setTimeout(() => {
		const adapterEnabled = CODEX_ADAPTER_TOOLS.every((toolName) => pi.getActiveTools().includes(toolName));
		ctx.ui.setStatus(CODEX_STATUS_KEY, adapterEnabled ? CODEX_STATUS_TEXT : undefined);
	}, 0);
}

export default function simplifyCodexStatusExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => simplifyCodexStatus(pi, ctx));
	pi.on("model_select", (_event, ctx) => simplifyCodexStatus(pi, ctx));
	pi.on("turn_start", (_event, ctx) => simplifyCodexStatus(pi, ctx));
	pi.on("turn_end", (_event, ctx) => simplifyCodexStatus(pi, ctx));
}
