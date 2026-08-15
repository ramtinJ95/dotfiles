import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	defineTool,
	formatSize,
	truncateHead,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONFIG_PATH = join(homedir(), ".pi", "agent", "exa-deep-research.json");
const DEFAULT_KEYCHAIN_SERVICE = "pi-exa-deep-research";
const DEFAULT_KEYCHAIN_ACCOUNT = getDefaultKeychainAccount();
const DEFAULT_NUM_RESULTS = 10;
const DEFAULT_HIGHLIGHT_MAX_CHARACTERS = 2000;
const MAX_SOURCE_COUNT = 8;
const MAX_GROUNDING_FIELDS = 20;
const MAX_CITATIONS_PER_FIELD = 3;
const KEYCHAIN_LOOKUP_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 90_000;
const execFileAsync = promisify(execFile);

const categories = [
	"company",
	"research paper",
	"news",
	"personal site",
	"people",
	"financial report",
] as const;

const researchModes = ["deep", "deep-reasoning"] as const;

const sharedParameters = Type.Object({
	query: Type.String(),
	mode: Type.Optional(
		StringEnum(researchModes, {
			default: "deep",
			description: "default deep; deep-reasoning for requested reasoning, ambiguity/conflicts/high stakes",
		}),
	),
	numResults: Type.Optional(
		Type.Number({
			minimum: 1,
			maximum: 100,
			description: "default 10",
		}),
	),
	category: Type.Optional(StringEnum(categories)),
	includeDomains: Type.Optional(Type.Array(Type.String())),
	excludeDomains: Type.Optional(Type.Array(Type.String())),
	startPublishedDate: Type.Optional(Type.String()),
	endPublishedDate: Type.Optional(Type.String()),
	maxAgeHours: Type.Optional(
		Type.Number({
			description: "0 live; -1 cache",
		}),
	),
	additionalQueries: Type.Optional(Type.Array(Type.String())),
	systemPrompt: Type.Optional(Type.String()),
	outputSchema: Type.Optional(
		Type.Object(
			{},
			{
				additionalProperties: true,
			},
		),
	),
	textMaxCharacters: Type.Optional(
		Type.Number({
			minimum: 1,
			description: "max page text chars/result",
		}),
	),
	highlightMaxCharacters: Type.Optional(
		Type.Number({
			minimum: 1,
			description: "max highlight chars/result",
		}),
	),
	subpages: Type.Optional(
		Type.Number({
			minimum: 0,
			description: "subpages/result",
		}),
	),
	subpageTarget: Type.Optional(
		Type.Array(Type.String(), {
			description: "subpage keywords",
		}),
	),
	userLocation: Type.Optional(
		Type.String({
			minLength: 2,
			maxLength: 2,
			description: "2-letter country code",
		}),
	),
	moderation: Type.Optional(Type.Boolean()),
});

type DeepResearchParams = Static<typeof sharedParameters>;
type DeepResearchMode = "deep" | "deep-reasoning";

interface ToolConfig {
	name: string;
	label: string;
	description: string;
	promptSnippet: string;
	promptGuidelines: string[];
}

interface ModeConfig {
	mode: DeepResearchMode;
	defaultOutputDescription: string;
	extraSystemPrompt: string;
}

export interface ExaConfig {
	apiKey: string;
	baseUrl: string;
	keychainService: string;
	keychainAccount: string;
	apiKeySource: "env" | "keychain";
}

interface ExaFileConfig {
	baseUrl?: string;
	keychainService?: string;
	keychainAccount?: string;
}

interface ExaSearchResponse {
	requestId?: string;
	searchType?: string;
	results?: ExaSearchResult[];
	output?: {
		content?: unknown;
		grounding?: ExaGroundingField[];
	};
	costDollars?: unknown;
	error?: string;
}

interface ExaSearchResult {
	title?: string;
	url?: string;
	publishedDate?: string | null;
	author?: string | null;
	highlights?: string[];
	text?: string;
	summary?: string;
}

interface ExaGroundingField {
	field?: string;
	citations?: Array<{
		url?: string;
		title?: string;
	}>;
	confidence?: string;
}

const toolConfig: ToolConfig = {
	name: "deep_research",
	label: "Deep Research",
	description: "Run Exa deep research.",
	promptSnippet: "Run grounded multi-source research.",
	promptGuidelines: [
		"deep_research: Use deep-reasoning for user-requested deep reasoning, ambiguity, conflicts, high stakes, or judgment-heavy tradeoffs.",
	],
};

const modeConfigs: Record<DeepResearchMode, ModeConfig> = {
	deep: {
		mode: "deep",
		defaultOutputDescription:
			"Return a grounded research synthesis with key findings, caveats, notable disagreements, and the most important implications.",
		extraSystemPrompt:
			"Aim for thorough coverage while staying grounded and avoiding unnecessary repetition.",
	},
	"deep-reasoning": {
		mode: "deep-reasoning",
		defaultOutputDescription:
			"Return a grounded research analysis that resolves ambiguity where possible, weighs conflicting evidence, and states the best-supported conclusion with uncertainty.",
		extraSystemPrompt:
			"Spend extra effort reconciling ambiguity, conflicting reporting, and edge cases before reaching a conclusion.",
	},
};

function getDefaultKeychainAccount(): string {
	try {
		return userInfo().username || "default";
	} catch {
		return "default";
	}
}

function dedupeStrings(values?: string[]): string[] | undefined {
	if (!values) return undefined;
	const deduped = new Set<string>();
	for (const value of values) {
		const normalized = value.trim();
		if (normalized) deduped.add(normalized);
	}
	return deduped.size > 0 ? Array.from(deduped) : undefined;
}

function normalizeDomains(domains?: string[]): string[] | undefined {
	const normalized = dedupeStrings(domains)?.map((domain) => domain.toLowerCase());
	return normalized && normalized.length > 0 ? normalized : undefined;
}

function clipText(value: string | undefined | null, maxCharacters: number): string | undefined {
	if (!value) return undefined;
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) return undefined;
	return normalized.length <= maxCharacters ? normalized : `${normalized.slice(0, maxCharacters - 1)}…`;
}

function defaultOutputSchema(config: ModeConfig): Record<string, string> {
	return {
		type: "text",
		description: config.defaultOutputDescription,
	};
}

function buildSystemPrompt(config: ModeConfig, userSystemPrompt?: string): string {
	return [
		"Perform grounded web research using the retrieved evidence.",
		"Prefer primary, official, and first-hand sources when they exist, then high-quality secondary sources.",
		"Deduplicate repetitive coverage and call out uncertainty or conflicts explicitly.",
		config.extraSystemPrompt,
		userSystemPrompt?.trim(),
	]
		.filter((value): value is string => Boolean(value && value.trim()))
		.join("\n\n");
}

function validateParams(params: DeepResearchParams): void {
	const issues: string[] = [];
	const category = params.category;

	if ((category === "company" || category === "people") && params.excludeDomains?.length) {
		issues.push(`excludeDomains is not supported with category ${category}`);
	}

	if ((category === "company" || category === "people") && (params.startPublishedDate || params.endPublishedDate)) {
		issues.push(`startPublishedDate/endPublishedDate are not supported with category ${category}`);
	}

	if (category === "people" && params.includeDomains?.some((domain) => !domain.toLowerCase().includes("linkedin"))) {
		issues.push("category people only supports LinkedIn domains in includeDomains");
	}

	if (issues.length > 0) {
		throw new Error(issues.join(". "));
	}
}

async function loadExaFileConfig(): Promise<ExaFileConfig | undefined> {
	try {
		const raw = await readFile(EXA_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") {
			throw new Error(`Expected a JSON object in ${EXA_CONFIG_PATH}.`);
		}
		return parsed as ExaFileConfig;
	} catch (error) {
		const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
		if (code === "ENOENT") return undefined;
		if (error instanceof Error && error.message.startsWith("Expected a JSON object")) throw error;
		throw new Error(
			`Failed to read ${EXA_CONFIG_PATH}. Ensure it is valid JSON, for example {\"keychainService\":\"${DEFAULT_KEYCHAIN_SERVICE}\",\"keychainAccount\":\"${DEFAULT_KEYCHAIN_ACCOUNT}\"}.`,
		);
	}
}

function isMissingKeychainItem(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = "code" in error ? (error as { code?: unknown }).code : undefined;
	const stderr = "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
	const message = error instanceof Error ? error.message : String(error);
	return code === 44 || stderr.includes("could not be found") || message.includes("could not be found");
}

async function loadMacOsKeychainApiKey(
	service: string,
	account: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync(
			"security",
			["find-generic-password", "-a", account, "-s", service, "-w"],
			{
				signal,
				timeout: KEYCHAIN_LOOKUP_TIMEOUT_MS,
			},
		);
		const apiKey = stdout.trim();
		return apiKey || undefined;
	} catch (error) {
		if (isMissingKeychainItem(error)) return undefined;
		if (error instanceof Error && error.name === "AbortError") throw error;
		const stderr =
			typeof error === "object" && error !== null && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
		const message = stderr.trim() || (error instanceof Error ? error.message : String(error));
		throw new Error(
			`Failed to read Exa API key from macOS Keychain for service ${JSON.stringify(service)} and account ${JSON.stringify(account)} (${message}).`,
		);
	}
}

function isMissingSecretServiceItem(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = "code" in error ? (error as { code?: unknown }).code : undefined;
	const stderr = "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
	return code === 1 && !stderr.trim();
}

async function loadLinuxSecretServiceApiKey(
	service: string,
	account: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync("secret-tool", ["lookup", "service", service, "account", account], {
			signal,
			timeout: KEYCHAIN_LOOKUP_TIMEOUT_MS,
		});
		const apiKey = stdout.trim();
		return apiKey || undefined;
	} catch (error) {
		if (isMissingSecretServiceItem(error)) return undefined;
		if (error instanceof Error && error.name === "AbortError") throw error;
		const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
		if (code === "ENOENT") return undefined;
		const stderr =
			typeof error === "object" && error !== null && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
		const message = stderr.trim() || (error instanceof Error ? error.message : String(error));
		throw new Error(
			`Failed to read Exa API key from Linux Secret Service for service ${JSON.stringify(service)} and account ${JSON.stringify(account)} (${message}).`,
		);
	}
}

function buildMissingApiKeyMessage(service: string, account: string): string {
	const fallback = `Alternatively set EXA_API_KEY before launching pi. ${EXA_CONFIG_PATH} may still be used for non-secret settings like baseUrl, keychainService, and keychainAccount.`;
	if (process.platform === "linux") {
		return [
			"Exa API key not configured.",
			`On Linux, store it securely in Secret Service with: secret-tool store --label='Pi Exa Deep Research API Key' service ${JSON.stringify(service)} account ${JSON.stringify(account)}`,
			"That command prompts for the secret without echoing it.",
			fallback,
		].join(" ");
	}

	if (process.platform !== "darwin") {
		return `Exa API key not configured. ${fallback}`;
	}

	return [
		"Exa API key not configured.",
		`On macOS, store it securely in Keychain with: security add-generic-password -a ${JSON.stringify(account)} -s ${JSON.stringify(service)} -U -w`,
		"That command prompts for the secret without echoing it.",
		fallback,
	].join(" ");
}

export async function loadExaConfig(signal?: AbortSignal): Promise<ExaConfig> {
	const fileConfig = await loadExaFileConfig();
	const envApiKey = process.env.EXA_API_KEY?.trim() || process.env.EXA_DEEP_RESEARCH_API_KEY?.trim();
	const keychainService =
		process.env.EXA_DEEP_RESEARCH_KEYCHAIN_SERVICE?.trim() || fileConfig?.keychainService?.trim() || DEFAULT_KEYCHAIN_SERVICE;
	const keychainAccount =
		process.env.EXA_DEEP_RESEARCH_KEYCHAIN_ACCOUNT?.trim() || fileConfig?.keychainAccount?.trim() || DEFAULT_KEYCHAIN_ACCOUNT;
	const keychainApiKey =
		!envApiKey && process.platform === "darwin"
			? await loadMacOsKeychainApiKey(keychainService, keychainAccount, signal)
			: !envApiKey && process.platform === "linux"
				? await loadLinuxSecretServiceApiKey(keychainService, keychainAccount, signal)
			: undefined;
	const apiKey = envApiKey || keychainApiKey;
	const baseUrl = fileConfig?.baseUrl?.trim() || EXA_SEARCH_URL;
	const apiKeySource = envApiKey ? "env" : "keychain";

	if (!apiKey) {
		throw new Error(buildMissingApiKeyMessage(keychainService, keychainAccount));
	}

	return { apiKey, baseUrl, keychainService, keychainAccount, apiKeySource };
}

function createRequestSignal(parentSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(new Error(`Exa request timed out after ${REQUEST_TIMEOUT_MS}ms.`)), REQUEST_TIMEOUT_MS);
	const onAbort = () => controller.abort(parentSignal?.reason ?? new Error("Exa request aborted."));

	if (parentSignal) {
		if (parentSignal.aborted) {
			onAbort();
		} else {
			parentSignal.addEventListener("abort", onAbort, { once: true });
		}
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timeoutId);
			if (parentSignal) parentSignal.removeEventListener("abort", onAbort);
		},
	};
}

function formatErrorMessage(status: number, body: unknown, fallbackText: string): string {
	const errorFromObject =
		typeof body === "object" && body && "error" in body && typeof (body as { error?: unknown }).error === "string"
			? (body as { error: string }).error
			: undefined;
	const detail = errorFromObject || clipText(fallbackText, 600) || `HTTP ${status}`;

	if (status === 401) {
		return `Exa authentication failed (${detail}). Check your API key.`;
	}
	if (status === 429) {
		return `Exa rate limited the request (${detail}). Try again later or use a different API key.`;
	}
	if (status >= 400 && status < 500) {
		return `Exa rejected the request (${detail}). Check category/filter compatibility and schema constraints.`;
	}
	return `Exa request failed (${detail}).`;
}

async function writeTruncatedOutputFile(toolName: string, content: string): Promise<string> {
	const filePath = join(tmpdir(), `${toolName}-${Date.now()}-${randomUUID()}.json`);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function normalizeSources(results: ExaSearchResult[]): { sources: Array<Record<string, unknown>>; warnings: string[] } {
	const visibleResults = results.slice(0, MAX_SOURCE_COUNT);
	const sources = visibleResults.map((result) => ({
		title: result.title || "Untitled",
		url: result.url || null,
		publishedDate: result.publishedDate || null,
		author: result.author || null,
		highlights:
			result.highlights?.map((highlight) => clipText(highlight, 320)).filter((highlight): highlight is string => Boolean(highlight)).slice(0, 2) ||
			[],
		textExcerpt: clipText(result.text, 320) || null,
		summary: clipText(result.summary, 320) || null,
	}));
	const warnings: string[] = [];

	if (results.length > visibleResults.length) {
		warnings.push(
			`Only the first ${visibleResults.length} of ${results.length} results are included in the returned source list to keep context compact.`,
		);
	}

	return { sources, warnings };
}

function normalizeGrounding(
	grounding: ExaGroundingField[] | undefined,
): { grounding: Array<Record<string, unknown>>; warnings: string[] } {
	if (!grounding || grounding.length === 0) {
		return { grounding: [], warnings: [] };
	}

	const visibleGrounding = grounding.slice(0, MAX_GROUNDING_FIELDS);
	const normalized = visibleGrounding.map((entry) => ({
		field: entry.field || "content",
		confidence: entry.confidence || null,
		citations:
			entry.citations
				?.slice(0, MAX_CITATIONS_PER_FIELD)
				.map((citation) => ({ url: citation.url || null, title: citation.title || null })) || [],
	}));
	const warnings: string[] = [];

	if (grounding.length > visibleGrounding.length) {
		warnings.push(
			`Only the first ${visibleGrounding.length} of ${grounding.length} grounding entries are included in the tool output to keep context compact.`,
		);
	}

	if (
		grounding.some(
			(entry) =>
				(entry.citations?.length || 0) > MAX_CITATIONS_PER_FIELD,
		)
	) {
		warnings.push(`Grounding citations are capped at ${MAX_CITATIONS_PER_FIELD} citations per field in the tool output.`);
	}

	return { grounding: normalized, warnings };
}

async function runDeepResearch(
	config: ToolConfig,
	params: DeepResearchParams,
	signal?: AbortSignal,
	onUpdate?: (update: { content?: Array<{ type: "text"; text: string }>; details?: Record<string, unknown> }) => void,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
	const query = params.query.trim();
	if (!query) throw new Error("query must not be empty.");
	const modeConfig = modeConfigs[params.mode ?? "deep"];

	const includeDomains = normalizeDomains(params.includeDomains);
	const excludeDomains = normalizeDomains(params.excludeDomains);
	const additionalQueries = dedupeStrings(params.additionalQueries)?.filter((value) => value !== query);
	const subpageTarget = dedupeStrings(params.subpageTarget);
	const userLocation = params.userLocation?.trim().toUpperCase();

	validateParams({
		...params,
		includeDomains,
		excludeDomains,
		additionalQueries,
		subpageTarget,
		userLocation,
	});

	onUpdate?.({
		content: [{ type: "text", text: `Running Exa ${modeConfig.mode} research...` }],
		details: { phase: "requesting", mode: modeConfig.mode },
	});

	const exaConfig = await loadExaConfig(signal);
	const requestBody: Record<string, unknown> = {
		query,
		type: modeConfig.mode,
		numResults: params.numResults ?? DEFAULT_NUM_RESULTS,
		systemPrompt: buildSystemPrompt(modeConfig, params.systemPrompt),
		outputSchema: (params.outputSchema as Record<string, unknown> | undefined) ?? defaultOutputSchema(modeConfig),
		contents: {
			highlights: {
				maxCharacters: params.highlightMaxCharacters ?? DEFAULT_HIGHLIGHT_MAX_CHARACTERS,
				query,
			},
		},
	};

	if (params.category) requestBody.category = params.category;
	if (includeDomains) requestBody.includeDomains = includeDomains;
	if (excludeDomains) requestBody.excludeDomains = excludeDomains;
	if (params.startPublishedDate) requestBody.startPublishedDate = params.startPublishedDate;
	if (params.endPublishedDate) requestBody.endPublishedDate = params.endPublishedDate;
	if (additionalQueries) requestBody.additionalQueries = additionalQueries;
	if (params.moderation !== undefined) requestBody.moderation = params.moderation;
	if (userLocation) requestBody.userLocation = userLocation;

	const contents = requestBody.contents as Record<string, unknown>;
	if (params.textMaxCharacters) {
		contents.text = { maxCharacters: params.textMaxCharacters };
	}
	if (params.maxAgeHours !== undefined) {
		contents.maxAgeHours = params.maxAgeHours;
	}
	if (params.subpages !== undefined) {
		contents.subpages = params.subpages;
	}
	if (subpageTarget) {
		contents.subpageTarget = subpageTarget;
	}

	const { signal: requestSignal, cleanup } = createRequestSignal(signal);

	try {
		const response = await fetch(exaConfig.baseUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": exaConfig.apiKey,
			},
			body: JSON.stringify(requestBody),
			signal: requestSignal,
		});

		const rawText = await response.text();
		let parsedBody: ExaSearchResponse | undefined;

		if (rawText) {
			try {
				parsedBody = JSON.parse(rawText) as ExaSearchResponse;
			} catch {
				parsedBody = undefined;
			}
		}

		if (!response.ok) {
			throw new Error(formatErrorMessage(response.status, parsedBody, rawText));
		}

		if (!parsedBody) {
			throw new Error("Exa returned an empty or non-JSON response.");
		}

		const results = Array.isArray(parsedBody.results) ? parsedBody.results : [];
		const { sources, warnings: sourceWarnings } = normalizeSources(results);
		const { grounding, warnings: groundingWarnings } = normalizeGrounding(parsedBody.output?.grounding);
		const warnings = [...sourceWarnings, ...groundingWarnings];

		if (parsedBody.output?.content === undefined) {
			warnings.push("Exa did not return synthesized output. Inspect the returned sources for raw evidence.");
		}

		const normalizedOutput = {
			tool: config.name,
			mode: modeConfig.mode,
			requestId: parsedBody.requestId ?? null,
			searchType: parsedBody.searchType ?? modeConfig.mode,
			query,
			synthesizedOutput: parsedBody.output?.content ?? null,
			grounding,
			sources,
			costDollars: parsedBody.costDollars ?? null,
			warnings,
		};

		const fullContent = JSON.stringify(normalizedOutput, null, 2);
		const truncation = truncateHead(fullContent, {
			maxBytes: DEFAULT_MAX_BYTES,
			maxLines: DEFAULT_MAX_LINES,
		});
		let content = truncation.content;
		let fullOutputPath: string | undefined;

		if (truncation.truncated) {
			fullOutputPath = await writeTruncatedOutputFile(config.name, fullContent);
			content += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
				truncation.outputBytes,
			)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${fullOutputPath}]`;
		}

		return {
			content: [{ type: "text", text: content }],
			details: {
				mode: modeConfig.mode,
				requestId: parsedBody.requestId ?? null,
				searchType: parsedBody.searchType ?? modeConfig.mode,
				query,
				request: requestBody,
				resultCount: results.length,
				groundingCount: Array.isArray(parsedBody.output?.grounding) ? parsedBody.output?.grounding.length : 0,
				costDollars: parsedBody.costDollars ?? null,
				apiKeySource: exaConfig.apiKeySource,
				keychainService: exaConfig.keychainService,
				keychainAccount: exaConfig.keychainAccount,
				fullOutputPath,
			},
		};
	} catch (error) {
		const isAbortError =
			typeof error === "object" &&
			error !== null &&
			("name" in error || "message" in error) &&
			((error as { name?: string }).name === "AbortError" || requestSignal.aborted);

		if (isAbortError) {
			const reason = requestSignal.reason;
			if (reason instanceof Error && reason.message) throw reason;
			throw new Error("Exa request aborted.");
		}

		if (error instanceof Error) throw error;
		throw new Error(String(error));
	} finally {
		cleanup();
	}
}

function createDeepResearchTool(config: ToolConfig) {
	return defineTool({
		name: config.name,
		label: config.label,
		description: config.description,
		promptSnippet: config.promptSnippet,
		promptGuidelines: config.promptGuidelines,
		parameters: sharedParameters,
		async execute(_toolCallId, params, signal, onUpdate) {
			return runDeepResearch(config, params, signal, onUpdate);
		},
	});
}

export default function exaDeepResearchExtension(pi: ExtensionAPI) {
	pi.registerTool(createDeepResearchTool(toolConfig));
}
