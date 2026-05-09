import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatTokens(count: number): string {
	if (!Number.isFinite(count) || count < 0) return "?";
	if (count < 1_000) return `${count}`;
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}K`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}K`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatPercent(percent: number): string {
	const s = percent.toFixed(1);
	return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubBranch,
				invalidate() {},
				render(width: number): string[] {
					// Line 1: cwd + git branch + optional session name (matches default behavior)
					let pwd = process.cwd();
					const home = process.env.HOME || process.env.USERPROFILE;
					if (home && pwd.startsWith(home)) {
						pwd = `~${pwd.slice(home.length)}`;
					}
					const branch = footerData.getGitBranch();
					if (branch) pwd = `${pwd} (${branch})`;
					const sessionName = pi.getSessionName();
					if (sessionName) pwd = `${pwd} • ${sessionName}`;

					// Line 2 left side: usage stats + custom context format
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						const msg = entry.message as AssistantMessage;
						totalInput += msg.usage?.input ?? 0;
						totalOutput += msg.usage?.output ?? 0;
						totalCacheRead += msg.usage?.cacheRead ?? 0;
						totalCacheWrite += msg.usage?.cacheWrite ?? 0;
						totalCost += msg.usage?.cost?.total ?? 0;
					}

					const parts: string[] = [];
					if (totalInput) parts.push(theme.fg("dim", `↑${formatTokens(totalInput)}`));
					if (totalOutput) parts.push(theme.fg("dim", `↓${formatTokens(totalOutput)}`));
					if (totalCacheRead) parts.push(theme.fg("dim", `R${formatTokens(totalCacheRead)}`));
					if (totalCacheWrite) parts.push(theme.fg("dim", `W${formatTokens(totalCacheWrite)}`));

					const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					if (totalCost || usingSubscription) {
						parts.push(theme.fg("dim", `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`));
					}

					const usage = ctx.getContextUsage();
					const used = usage?.tokens ?? null;
					const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const percent = usage?.percent ?? null;

					let contextText =
						used === null || contextWindow <= 0
							? `?/${formatTokens(contextWindow)} ?%`
							: `${formatTokens(used)}/${formatTokens(contextWindow)} ${formatPercent(percent ?? 0)}%`;

					if (percent !== null && percent > 90) {
						contextText = theme.fg("error", contextText);
					} else if (percent !== null && percent > 70) {
						contextText = theme.fg("warning", contextText);
					} else {
						contextText = theme.fg("dim", contextText);
					}
					parts.push(contextText);

					const left = parts.join(" ");

					// Line 2 right side: model + thinking level (+ provider when multiple providers)
					const model = ctx.model;
					let rightWithoutProvider = model?.id || "no-model";
					if (model?.reasoning) {
						const thinking = pi.getThinkingLevel();
						rightWithoutProvider =
							thinking === "off"
								? `${rightWithoutProvider} • thinking off`
								: `${rightWithoutProvider} • ${thinking}`;
					}

					let right = rightWithoutProvider;
					if (model && footerData.getAvailableProviderCount() > 1) {
						const withProvider = `(${model.provider}) ${rightWithoutProvider}`;
						if (visibleWidth(left) + 2 + visibleWidth(withProvider) <= width) {
							right = withProvider;
						}
					}
					right = theme.fg("dim", right);

					const pad = " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(right)));
					const statsLine = truncateToWidth(left + pad + right, width);

					const lines = [
						theme.fg("dim", truncateToWidth(pwd, width, "")),
						statsLine,
					];

					// Line 3: extension statuses (same behavior as built-in footer)
					const statuses = footerData.getExtensionStatuses();
					if (statuses.size > 0) {
						const statusLine = Array.from(statuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text))
							.join(" ");
						lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
					}

					return lines;
				},
			};
		});
	});
}
