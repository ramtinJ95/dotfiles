import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_BASENAME = "pi-better-openai-lite.json";
const STATUS_KEY = "better-openai-usage";
const SERVICE_TIER = "priority";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const SPARK_LIMIT_NAME = "GPT-5.3-Codex-Spark";

const DEFAULT_SUPPORTED_MODELS = [
	"openai/gpt-5.4",
	"openai/gpt-5.5",
	"openai-codex/gpt-5.4",
	"openai-codex/gpt-5.5",
] as const;

type UsageWindow = {
	used_percent?: number | null;
	reset_after_seconds?: number | null;
	reset_at?: number | null;
};

type RateLimitBucket = {
	allowed?: boolean;
	limit_reached?: boolean;
	primary_window?: UsageWindow | null;
	secondary_window?: UsageWindow | null;
};

type CodexUsageResponse = {
	rate_limit?: RateLimitBucket | null;
	additional_rate_limits?: Record<string, unknown> | unknown[] | null;
};

type UsageSnapshot = {
	fiveHourLeftPercent: number | null;
	sevenDayLeftPercent: number | null;
	fiveHourResetInSeconds: number | null;
	sevenDayResetInSeconds: number | null;
	isLimited: boolean;
};

type SupportedModel = {
	provider: string;
	id: string;
};

type UsageConfig = {
	enabled?: boolean;
	refreshIntervalMs?: number;
	showOnlyOnSubscriptionModels?: boolean;
	showResetTimes?: boolean;
};

type ConfigFile = {
	persistState?: boolean;
	active?: boolean;
	desiredActive?: boolean;
	supportedModels?: string[];
	usage?: UsageConfig;
};

type ResolvedConfig = {
	configPath: string;
	projectConfigPath: string;
	globalConfigPath: string;
	projectConfigExists: boolean;
	globalConfigExists: boolean;
	persistState: boolean;
	active: boolean;
	desiredActive: boolean;
	supportedModels: SupportedModel[];
	usage: Required<UsageConfig>;
};

const DEFAULT_USAGE_CONFIG: Required<UsageConfig> = {
	enabled: true,
	refreshIntervalMs: 60_000,
	showOnlyOnSubscriptionModels: true,
	showResetTimes: true,
};

const DEFAULT_CONFIG: ConfigFile = {
	persistState: true,
	active: false,
	desiredActive: false,
	supportedModels: [...DEFAULT_SUPPORTED_MODELS],
	usage: DEFAULT_USAGE_CONFIG,
};

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

function authFile(): string {
	return join(agentDir(), "auth.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function usedToLeftPercent(value: number | null | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) return null;
	return clampPercent(100 - value);
}

function formatPercent(value: number | null): string {
	return typeof value === "number" && !Number.isNaN(value)
		? `${Math.round(clampPercent(value))}%`
		: "--";
}

function formatResetCountdown(seconds: number | null): string | null {
	if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
	const total = Math.max(0, Math.round(seconds));
	const days = Math.floor(total / 86_400);
	const hours = Math.floor((total % 86_400) / 3_600);
	const minutes = Math.floor((total % 3_600) / 60);
	const secs = total % 60;
	if (days > 0) return `${days}d${hours}h`;
	if (hours > 0) return `${hours}h${minutes}m`;
	if (minutes > 0) return `${minutes}m`;
	return `${secs}s`;
}

function formatCompactReset(label: string, seconds: number | null): string | null {
	const countdown = formatResetCountdown(seconds);
	return countdown ? `${label} ↺ ${countdown}` : null;
}

function formatUsageSnapshot(
	snapshot: UsageSnapshot,
	options: { showResetTimes: boolean; fastModeActive?: boolean; fastModeText?: string },
): string {
	const fiveHour = formatPercent(snapshot.fiveHourLeftPercent);
	const sevenDay = formatPercent(snapshot.sevenDayLeftPercent);
	const resets = options.showResetTimes
		? [
				formatCompactReset("5h", snapshot.fiveHourResetInSeconds),
				formatCompactReset("7d", snapshot.sevenDayResetInSeconds),
			].filter((value): value is string => value !== null)
		: [];
	const limited = snapshot.isLimited ? " limited" : "";
	const fastModeText = options.fastModeText ?? (options.fastModeActive ? "Fast mode on" : undefined);
	const fastMode = fastModeText ? ` | ${fastModeText}` : "";
	return `OpenAI Usage${limited}: 5h: ${fiveHour} | 7d: ${sevenDay}${fastMode}${resets.length ? ` | ${resets.join(" | ")}` : ""}`;
}

function configPaths(cwd: string, home = homedir()) {
	return {
		project: join(cwd, ".pi", "extensions", CONFIG_BASENAME),
		global: join(home, ".pi", "agent", "extensions", CONFIG_BASENAME),
	};
}

function parseModelKey(value: string): SupportedModel | undefined {
	const key = value.trim();
	const slash = key.indexOf("/");
	if (slash <= 0 || slash === key.length - 1) return undefined;
	const provider = key.slice(0, slash).trim();
	const id = key.slice(slash + 1).trim();
	return provider && id ? { provider, id } : undefined;
}

function normalizeModelKeys(value: unknown): string[] | undefined {
	if (value === undefined || !Array.isArray(value)) return undefined;
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => parseModelKey(entry))
		.filter((entry): entry is SupportedModel => entry !== undefined)
		.map((entry) => `${entry.provider}/${entry.id}`);
}

function parseModels(value: unknown): SupportedModel[] | undefined {
	const keys = normalizeModelKeys(value);
	if (keys === undefined) return undefined;
	return keys
		.map((key) => parseModelKey(key))
		.filter((entry): entry is SupportedModel => entry !== undefined);
}

function readRawConfig(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function readConfig(path: string): ConfigFile | undefined {
	if (!existsSync(path)) return undefined;
	const parsed = readRawConfig(path);
	const config: ConfigFile = {};
	if (typeof parsed.persistState === "boolean") config.persistState = parsed.persistState;
	if (typeof parsed.active === "boolean") config.active = parsed.active;
	if (typeof parsed.desiredActive === "boolean") config.desiredActive = parsed.desiredActive;
	const supportedModels = normalizeModelKeys(parsed.supportedModels);
	if (supportedModels !== undefined) config.supportedModels = supportedModels;
	if (isRecord(parsed.usage)) {
		config.usage = {};
		if (typeof parsed.usage.enabled === "boolean") config.usage.enabled = parsed.usage.enabled;
		if (typeof parsed.usage.refreshIntervalMs === "number") {
			config.usage.refreshIntervalMs = parsed.usage.refreshIntervalMs;
		}
		if (typeof parsed.usage.showOnlyOnSubscriptionModels === "boolean") {
			config.usage.showOnlyOnSubscriptionModels = parsed.usage.showOnlyOnSubscriptionModels;
		}
		if (typeof parsed.usage.showResetTimes === "boolean") {
			config.usage.showResetTimes = parsed.usage.showResetTimes;
		}
	}
	return config;
}

function writeConfig(path: string, config: ConfigFile | Record<string, unknown>): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveConfig(cwd: string): ResolvedConfig {
	const paths = configPaths(cwd);
	const projectConfigExists = existsSync(paths.project);
	const globalConfigExists = existsSync(paths.global);
	const globalConfig = readConfig(paths.global) ?? {};
	const projectConfig = readConfig(paths.project) ?? {};
	const merged = { ...DEFAULT_CONFIG, ...globalConfig, ...projectConfig };
	const selectedPath = projectConfigExists ? paths.project : paths.global;
	const desiredActive = merged.desiredActive ?? merged.active ?? false;
	const refreshIntervalMs = Math.max(
		15_000,
		Math.min(
			10 * 60_000,
			projectConfig.usage?.refreshIntervalMs ??
				globalConfig.usage?.refreshIntervalMs ??
				DEFAULT_USAGE_CONFIG.refreshIntervalMs,
		),
	);

	return {
		configPath: selectedPath,
		projectConfigPath: paths.project,
		globalConfigPath: paths.global,
		projectConfigExists,
		globalConfigExists,
		persistState: merged.persistState ?? true,
		active: merged.active ?? desiredActive,
		desiredActive,
		supportedModels:
			parseModels(merged.supportedModels) ?? parseModels(DEFAULT_SUPPORTED_MODELS) ?? [],
		usage: {
			...DEFAULT_USAGE_CONFIG,
			...globalConfig.usage,
			...projectConfig.usage,
			refreshIntervalMs,
		},
	};
}

function readCodexAuth(): { accessToken: string; accountId: string } | undefined {
	try {
		const auth = JSON.parse(readFileSync(authFile(), "utf8")) as Record<
			string,
			| {
					type?: string;
					access?: string | null;
					accountId?: string | null;
					account_id?: string | null;
				}
			| undefined
		>;
		const entry = auth["openai-codex"];
		if (entry?.type !== "oauth") return undefined;
		const accessToken = entry.access?.trim();
		const accountId = (entry.accountId ?? entry.account_id)?.trim();
		return accessToken && accountId ? { accessToken, accountId } : undefined;
	} catch {
		return undefined;
	}
}

async function requestCodexUsage(signal?: AbortSignal): Promise<CodexUsageResponse | undefined> {
	const credentials = readCodexAuth();
	if (!credentials) return undefined;
	const response = await fetch(USAGE_URL, {
		headers: {
			accept: "*/*",
			authorization: `Bearer ${credentials.accessToken}`,
			"chatgpt-account-id": credentials.accountId,
		},
		signal,
	});
	if (!response.ok) throw new Error(`Codex usage request failed (${response.status})`);
	return (await response.json()) as CodexUsageResponse;
}

function normalizeRateLimitBucket(value: unknown): RateLimitBucket | null {
	const record = isRecord(value) ? value : null;
	if (!record) return null;
	if (
		!(
			"primary_window" in record ||
			"secondary_window" in record ||
			"limit_reached" in record ||
			"allowed" in record
		)
	) {
		return null;
	}
	return record as RateLimitBucket;
}

function extractSparkRateLimitFromEntry(value: unknown): RateLimitBucket | null {
	const record = isRecord(value) ? value : null;
	if (!record || record.limit_name !== SPARK_LIMIT_NAME) return null;
	return normalizeRateLimitBucket(record.rate_limit);
}

function findSparkRateLimitBucket(data: CodexUsageResponse): RateLimitBucket | null {
	const additional = data.additional_rate_limits;
	if (Array.isArray(additional)) {
		for (const entry of additional) {
			const bucket = extractSparkRateLimitFromEntry(entry);
			if (bucket) return bucket;
		}
		return null;
	}
	const map = isRecord(additional) ? additional : null;
	if (!map) return null;
	for (const value of Object.values(map)) {
		const bucket = extractSparkRateLimitFromEntry(value);
		if (bucket) return bucket;
	}
	return null;
}

function getResetSeconds(window: UsageWindow | null | undefined): number | null {
	if (typeof window?.reset_after_seconds === "number" && !Number.isNaN(window.reset_after_seconds)) {
		return window.reset_after_seconds;
	}
	if (typeof window?.reset_at !== "number" || Number.isNaN(window.reset_at)) return null;
	const resetAtSeconds = window.reset_at > 100_000_000_000 ? window.reset_at / 1000 : window.reset_at;
	return Math.max(0, resetAtSeconds - Date.now() / 1000);
}

function parseUsageSnapshot(data: CodexUsageResponse, modelId: string | undefined): UsageSnapshot {
	const bucket =
		modelId === SPARK_MODEL_ID
			? findSparkRateLimitBucket(data)
			: normalizeRateLimitBucket(data.rate_limit);
	return {
		fiveHourLeftPercent: usedToLeftPercent(bucket?.primary_window?.used_percent),
		sevenDayLeftPercent: usedToLeftPercent(bucket?.secondary_window?.used_percent),
		fiveHourResetInSeconds: getResetSeconds(bucket?.primary_window),
		sevenDayResetInSeconds: getResetSeconds(bucket?.secondary_window),
		isLimited: bucket?.limit_reached === true || bucket?.allowed === false,
	};
}

function currentModelKey(ctx: ExtensionContext): string {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
}

function supportsFast(ctx: ExtensionContext, supportedModels: SupportedModel[]): boolean {
	const current = ctx.model;
	if (!current) return false;
	return supportedModels.some(
		(model) => model.provider === current.provider && model.id === current.id,
	);
}

function modelList(supportedModels: SupportedModel[]): string {
	return supportedModels.length > 0
		? supportedModels.map((model) => `${model.provider}/${model.id}`).join(", ")
		: "none configured";
}

function isOpenAISubscriptionModel(ctx: ExtensionContext, cfg: ResolvedConfig): boolean {
	if (!ctx.model || (ctx.model.provider !== "openai" && ctx.model.provider !== "openai-codex")) {
		return false;
	}
	if (!cfg.usage.showOnlyOnSubscriptionModels) return true;
	return ctx.modelRegistry.isUsingOAuth(ctx.model);
}

function stateText(
	ctx: ExtensionContext,
	desiredActive: boolean,
	active: boolean,
	supportedModels: SupportedModel[],
): string {
	const model = currentModelKey(ctx);
	if (active) return `Fast mode is on for ${model}.`;
	if (desiredActive) {
		return `Fast mode is requested, but inactive for unsupported model ${model}. Supported models: ${modelList(supportedModels)}.`;
	}
	return `Fast mode is off. Current model: ${model}.`;
}

function formatUsageStatus(
	ctx: ExtensionContext,
	cfg: ResolvedConfig,
	usageSnapshot: UsageSnapshot | undefined,
	usageUpdatedAt: number | undefined,
	usageError: string | undefined,
	fastModeActive = false,
): string {
	if (!cfg.usage.enabled) return "OpenAI usage display is disabled.";
	if (!isOpenAISubscriptionModel(ctx, cfg)) {
		return "OpenAI usage hidden: current model is not an OpenAI subscription model.";
	}
	if (!usageSnapshot) return `OpenAI usage unavailable${usageError ? `: ${usageError}` : "."}`;
	const stale =
		usageUpdatedAt && Date.now() - usageUpdatedAt > cfg.usage.refreshIntervalMs * 2
			? ` | stale ${formatResetCountdown((Date.now() - usageUpdatedAt) / 1000)}`
			: "";
	return `${formatUsageSnapshot(usageSnapshot, { ...cfg.usage, fastModeActive })}${stale}`;
}

function writeSetting(ctx: ExtensionContext, id: string, rawValue: string): ResolvedConfig {
	const cfg = resolveConfig(ctx.cwd || process.cwd());
	const current = readRawConfig(cfg.configPath);
	const bool = rawValue === "true";
	const num = Number(rawValue);
	if (id === "fast.enabled") {
		current.active = bool;
		current.desiredActive = bool;
	} else if (id === "persistState") {
		current.persistState = bool;
	} else if (id === "supportedModels") {
		current.supportedModels = normalizeModelKeys(
			rawValue
				.split(/[\n,]+/)
				.map((value) => value.trim())
				.filter(Boolean),
		);
	} else if (id.startsWith("usage.")) {
		const usage = isRecord(current.usage) ? current.usage : {};
		const key = id.slice("usage.".length);
		usage[key] = key === "refreshIntervalMs" ? num : bool;
		current.usage = usage;
	}
	writeConfig(cfg.configPath, current);
	return resolveConfig(ctx.cwd || process.cwd());
}

export default function betterOpenAILite(pi: ExtensionAPI): void {
	let desiredActive = false;
	let active = false;
	let cachedConfig: ResolvedConfig | undefined;
	let usageSnapshot: UsageSnapshot | undefined;
	let usageUpdatedAt: number | undefined;
	let usageError: string | undefined;
	let usageLastFetchAt: number | undefined;
	let usageTimer: ReturnType<typeof setInterval> | undefined;
	let usageRefreshInFlight = false;
	let queuedUsageRefresh: { ctx: ExtensionContext; modelId?: string; notify?: boolean } | undefined;
	let usageAbortController: AbortController | undefined;
	let statusInstalled = false;
	let shuttingDown = false;

	function refresh(ctx: ExtensionContext): ResolvedConfig {
		cachedConfig = resolveConfig(ctx.cwd || process.cwd());
		return cachedConfig;
	}

	function config(ctx: ExtensionContext): ResolvedConfig {
		return cachedConfig ?? refresh(ctx);
	}

	function applyDesiredFastState(ctx: ExtensionContext, cfg = config(ctx)): void {
		active = desiredActive && supportsFast(ctx, cfg.supportedModels);
	}

	function persistFastState(ctx: ExtensionContext, cfg = config(ctx)): void {
		if (!cfg.persistState) return;
		const current = readRawConfig(cfg.configPath);
		writeConfig(cfg.configPath, { ...current, active, desiredActive });
		cachedConfig = resolveConfig(ctx.cwd || process.cwd());
	}

	function setUsageStatus(ctx: ExtensionContext, text: string | undefined): void {
		if (!ctx.hasUI) return;
		if (!text && !statusInstalled) return;
		ctx.ui.setStatus(STATUS_KEY, text);
		statusInstalled = text !== undefined;
	}

	function updateFooterStatus(ctx: ExtensionContext): void {
		const cfg = config(ctx);
		if (!cfg.usage.enabled || !isOpenAISubscriptionModel(ctx, cfg) || !usageSnapshot) {
			setUsageStatus(ctx, undefined);
			return;
		}
		const fastModePlaceholder = "__PI_BETTER_OPENAI_FAST_MODE_ON__";
		const usageText = formatUsageSnapshot(usageSnapshot, {
			...cfg.usage,
			fastModeText: active ? fastModePlaceholder : undefined,
		});
		const styledUsageText = active
			? usageText
					.split(fastModePlaceholder)
					.map((part) => ctx.ui.theme.fg("dim", part))
					.join(ctx.ui.theme.fg("success", "Fast mode on"))
			: ctx.ui.theme.fg("dim", usageText);
		setUsageStatus(ctx, styledUsageText);
	}

	async function refreshUsage(
		ctx: ExtensionContext,
		modelId = ctx.model?.id,
		options?: { notify?: boolean },
	): Promise<void> {
		if (shuttingDown) return;
		if (usageRefreshInFlight) {
			queuedUsageRefresh = { ctx, modelId, notify: queuedUsageRefresh?.notify || options?.notify };
			return;
		}
		usageRefreshInFlight = true;
		const cfg = config(ctx);
		try {
			if (!cfg.usage.enabled) {
				usageSnapshot = undefined;
				usageError = "Usage display is disabled.";
				updateFooterStatus(ctx);
				return;
			}
			if (!isOpenAISubscriptionModel(ctx, cfg)) {
				updateFooterStatus(ctx);
				return;
			}
			usageAbortController = new AbortController();
			const timeoutSignal = AbortSignal.timeout(10_000);
			const signal = ctx.signal
				? AbortSignal.any([ctx.signal, timeoutSignal, usageAbortController.signal])
				: AbortSignal.any([timeoutSignal, usageAbortController.signal]);
			const data = await requestCodexUsage(signal);
			usageLastFetchAt = Date.now();
			usageSnapshot = data ? parseUsageSnapshot(data, modelId) : undefined;
			usageUpdatedAt = usageSnapshot ? Date.now() : undefined;
			usageError = data ? undefined : `Missing openai-codex OAuth credentials in ${authFile()}.`;
			updateFooterStatus(ctx);
			if (options?.notify) {
				ctx.ui.notify(
					formatUsageStatus(ctx, cfg, usageSnapshot, usageUpdatedAt, usageError, active),
					usageSnapshot ? "info" : "warning",
				);
			}
		} catch (error) {
			if (shuttingDown) return;
			usageError = error instanceof Error ? error.message : String(error);
			updateFooterStatus(ctx);
			if (options?.notify) {
				ctx.ui.notify(formatUsageStatus(ctx, cfg, usageSnapshot, usageUpdatedAt, usageError, active), "warning");
			}
		} finally {
			usageAbortController = undefined;
			usageRefreshInFlight = false;
			const next = queuedUsageRefresh;
			queuedUsageRefresh = undefined;
			if (next && !shuttingDown) {
				void refreshUsage(next.ctx, next.modelId, { notify: next.notify });
			}
		}
	}

	function startUsageRefresh(ctx: ExtensionContext): void {
		if (usageTimer) clearInterval(usageTimer);
		usageTimer = undefined;
		const cfg = config(ctx);
		if (!ctx.hasUI || !cfg.usage.enabled) {
			updateFooterStatus(ctx);
			return;
		}
		void refreshUsage(ctx);
		usageTimer = setInterval(() => void refreshUsage(ctx), cfg.usage.refreshIntervalMs);
		usageTimer.unref?.();
	}

	function setActive(ctx: ExtensionContext, next: boolean): void {
		const nextConfig = refresh(ctx);
		desiredActive = next;
		applyDesiredFastState(ctx, nextConfig);
		persistFastState(ctx, nextConfig);
		updateFooterStatus(ctx);
		ctx.ui.notify(stateText(ctx, desiredActive, active, nextConfig.supportedModels), active ? "info" : next ? "warning" : "info");
	}

	async function showUsage(ctx: ExtensionCommandContext): Promise<void> {
		await refreshUsage(ctx, ctx.model?.id);
		const text = formatUsageStatus(ctx, config(ctx), usageSnapshot, usageUpdatedAt, usageError, active);
		if (ctx.hasUI) {
			ctx.ui.notify(text, usageSnapshot ? "info" : "warning");
			return;
		}
		pi.sendMessage({ customType: "openai-usage", content: text, display: true }, { triggerTurn: false });
	}

	async function showSettings(ctx: ExtensionCommandContext): Promise<void> {
		if (!ctx.hasUI) {
			const cfg = config(ctx);
			pi.sendMessage(
				{
					customType: "openai-settings",
					content: `OpenAI settings: ${cfg.configPath}`,
					display: true,
				},
				{ triggerTurn: false },
			);
			return;
		}

		while (true) {
			const cfg = refresh(ctx);
			applyDesiredFastState(ctx, cfg);
			const choice = await ctx.ui.select("OpenAI settings", [
				`Fast mode: ${desiredActive ? "on" : "off"}`,
				`Persist fast state: ${cfg.persistState}`,
				`Usage display: ${cfg.usage.enabled}`,
				`Usage refresh: ${Math.round(cfg.usage.refreshIntervalMs / 1000)}s`,
				`Usage only on OAuth: ${cfg.usage.showOnlyOnSubscriptionModels}`,
				`Usage reset times: ${cfg.usage.showResetTimes}`,
				`Supported fast models: ${modelList(cfg.supportedModels)}`,
				`Config path: ${cfg.configPath}`,
				"Close",
			]);
			if (!choice || choice === "Close") return;

			if (choice.startsWith("Fast mode:")) {
				setActive(ctx, !desiredActive);
			} else if (choice.startsWith("Persist fast state:")) {
				cachedConfig = writeSetting(ctx, "persistState", String(!cfg.persistState));
			} else if (choice.startsWith("Usage display:")) {
				cachedConfig = writeSetting(ctx, "usage.enabled", String(!cfg.usage.enabled));
				startUsageRefresh(ctx);
			} else if (choice.startsWith("Usage refresh:")) {
				const selected = await ctx.ui.select("Usage refresh interval", ["15s", "30s", "60s", "120s", "300s", "600s"]);
				if (selected) {
					cachedConfig = writeSetting(ctx, "usage.refreshIntervalMs", String(Number(selected.slice(0, -1)) * 1000));
					startUsageRefresh(ctx);
				}
			} else if (choice.startsWith("Usage only on OAuth:")) {
				cachedConfig = writeSetting(
					ctx,
					"usage.showOnlyOnSubscriptionModels",
					String(!cfg.usage.showOnlyOnSubscriptionModels),
				);
				startUsageRefresh(ctx);
			} else if (choice.startsWith("Usage reset times:")) {
				cachedConfig = writeSetting(ctx, "usage.showResetTimes", String(!cfg.usage.showResetTimes));
				updateFooterStatus(ctx);
			} else if (choice.startsWith("Supported fast models:")) {
				const edited = await ctx.ui.editor(
					"Supported fast models (one provider/model per line)",
					cfg.supportedModels.map((model) => `${model.provider}/${model.id}`).join("\n"),
				);
				if (edited !== undefined) {
					cachedConfig = writeSetting(ctx, "supportedModels", edited);
					applyDesiredFastState(ctx, cachedConfig);
					persistFastState(ctx, cachedConfig);
				}
			} else if (choice.startsWith("Config path:")) {
				ctx.ui.notify(
					[
						`Active config: ${cfg.configPath}`,
						`Project config: ${cfg.projectConfigPath}${cfg.projectConfigExists ? " (exists)" : ""}`,
						`Global config: ${cfg.globalConfigPath}${cfg.globalConfigExists ? " (exists)" : ""}`,
						`Last usage fetch: ${usageLastFetchAt ? new Date(usageLastFetchAt).toLocaleTimeString() : "never"}`,
						`Last usage error: ${usageError ?? "none"}`,
					].join("\n"),
					"info",
				);
			}
		}
	}

	pi.registerCommand("fast", {
		description: "Toggle OpenAI fast mode",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /fast", "error");
				return;
			}
			setActive(ctx, !desiredActive);
		},
	});

	pi.registerCommand("openai-usage", {
		description: "Show OpenAI subscription usage status",
		handler: async (_args, ctx) => {
			await showUsage(ctx);
		},
	});

	pi.registerCommand("openai-settings", {
		description: "Open Better OpenAI Lite settings",
		handler: async (_args, ctx) => {
			await showSettings(ctx);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		shuttingDown = false;
		const cfg = refresh(ctx);
		desiredActive = cfg.persistState ? cfg.desiredActive : false;
		applyDesiredFastState(ctx, cfg);
		if (desiredActive !== cfg.desiredActive || active !== cfg.active) persistFastState(ctx, cfg);
		if (desiredActive && !active && ctx.hasUI) {
			ctx.ui.notify(
				`Fast mode requested, but ${currentModelKey(ctx)} is unsupported. It will activate automatically when you switch to a supported model: ${modelList(cfg.supportedModels)}.`,
				"warning",
			);
		}
		updateFooterStatus(ctx);
		startUsageRefresh(ctx);
	});

	pi.on("turn_end", (_event, ctx) => {
		updateFooterStatus(ctx);
		void refreshUsage(ctx);
	});

	pi.on("model_select", (event, ctx) => {
		const cfg = config(ctx);
		const wasActive = active;
		applyDesiredFastState(ctx, cfg);
		if (active !== wasActive) {
			persistFastState(ctx, cfg);
			if (ctx.hasUI) {
				ctx.ui.notify(
					active
						? stateText(ctx, desiredActive, active, cfg.supportedModels)
						: `Fast mode inactive for unsupported model ${currentModelKey(ctx)}.`,
					active ? "info" : "warning",
				);
			}
		}
		updateFooterStatus(ctx);
		void refreshUsage(ctx, event.model.id);
	});

	pi.on("session_shutdown", () => {
		shuttingDown = true;
		queuedUsageRefresh = undefined;
		usageAbortController?.abort();
		usageAbortController = undefined;
		if (usageTimer) clearInterval(usageTimer);
		usageTimer = undefined;
		statusInstalled = false;
	});

	pi.on("before_provider_request", (event, ctx) => {
		const cfg = config(ctx);
		if (!active || !supportsFast(ctx, cfg.supportedModels) || !isRecord(event.payload)) return;
		return { ...event.payload, service_tier: SERVICE_TIER };
	});
}
