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
	return `${percent.toFixed(1)}%`;
}

function truecolor(text: string, red: number, green: number, blue: number): string {
	return `\u001b[38;2;${red};${green};${blue}m${text}\u001b[0m`;
}

function colorContextText(text: string, percent: number | null, dim: (text: string) => string): string {
	if (percent === null || percent <= 55) return dim(text);

	const colors: Array<[number, number, number]> = [
		[255, 220, 0],
		[255, 190, 0],
		[255, 150, 0],
		[255, 110, 0],
		[255, 70, 0],
		[255, 0, 0],
	];
	const index = Math.min(colors.length - 1, Math.max(0, Math.ceil((percent - 55) / 5) - 1));
	const [red, green, blue] = colors[index];
	return truecolor(text, red, green, blue);
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

					// Line 2 left side: estimated API cost + context usage
					let totalCost = 0;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type !== "message" || entry.message.role !== "assistant") continue;
						const msg = entry.message as AssistantMessage;
						totalCost += msg.usage?.cost?.total ?? 0;
					}

					const parts: string[] = [];
					const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					if (totalCost || usingSubscription) {
						parts.push(theme.fg("dim", `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`));
					}

					const usage = ctx.getContextUsage();
					const used = usage?.tokens ?? null;
					const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const percent = usage?.percent ?? null;

					let contextText =
						used === null || contextWindow <= 0 || percent === null
							? `?% ?/${formatTokens(contextWindow)}`
							: `${formatPercent(percent)} ${formatTokens(used)}/${formatTokens(contextWindow)}`;

					contextText = colorContextText(contextText, percent, (text) => theme.fg("dim", text));
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
