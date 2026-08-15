import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadExaConfig } from "./exa-deep-research.ts";

const TOOL_NAME = "web_search";
const ENABLED_PROVIDER = "claude-bridge";
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_NUM_RESULTS = 5;
const TEXT_MAX_CHARACTERS = 800;

interface ExaResult {
	title?: string;
	url?: string;
	publishedDate?: string;
	author?: string;
	text?: string;
	highlights?: string[];
}

const parameters = Type.Object({
	query: Type.String({ description: "search query" }),
	numResults: Type.Optional(Type.Number({ minimum: 1, maximum: 25, description: "default 5" })),
	includeDomains: Type.Optional(Type.Array(Type.String())),
	excludeDomains: Type.Optional(Type.Array(Type.String())),
	startPublishedDate: Type.Optional(Type.String({ description: "ISO date; only newer results" })),
});

function formatResults(results: ExaResult[]): string {
	if (results.length === 0) return "No results.";

	return results
		.map((result, index) => {
			const lines = [`${index + 1}. ${result.title?.trim() || "(untitled)"}`, `   ${result.url ?? ""}`];
			if (result.publishedDate) lines.push(`   published: ${result.publishedDate}`);

			const snippet = result.highlights?.length ? result.highlights.join(" … ") : result.text?.trim();
			if (snippet) lines.push(`   ${snippet.replace(/\s+/g, " ").slice(0, TEXT_MAX_CHARACTERS)}`);

			return lines.join("\n");
		})
		.join("\n\n");
}

const webSearchTool = defineTool({
	name: TOOL_NAME,
	label: "Web search",
	description:
		"Search the web and return ranked results with titles, URLs, and snippets. Use for current events, documentation lookups, and fact-checking. For multi-source synthesis use deep_research instead.",
	promptSnippet: "web_search: fast web search returning URLs and snippets",
	parameters,
	async execute(_toolCallId, params, signal) {
		const query = params.query.trim();
		if (!query) throw new Error("query must not be empty.");

		const config = await loadExaConfig(signal);
		const requestSignal = signal
			? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
			: AbortSignal.timeout(REQUEST_TIMEOUT_MS);

		const response = await fetch(config.baseUrl, {
			method: "POST",
			headers: { "content-type": "application/json", "x-api-key": config.apiKey },
			body: JSON.stringify({
				query,
				type: "auto",
				numResults: params.numResults ?? DEFAULT_NUM_RESULTS,
				includeDomains: params.includeDomains,
				excludeDomains: params.excludeDomains,
				startPublishedDate: params.startPublishedDate,
				contents: {
					text: { maxCharacters: TEXT_MAX_CHARACTERS },
					highlights: { query, numSentences: 3, highlightsPerUrl: 2 },
				},
			}),
			signal: requestSignal,
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Exa search failed (${response.status} ${response.statusText}). ${body.slice(0, 500)}`);
		}

		const parsed = (await response.json()) as { results?: ExaResult[]; requestId?: string; costDollars?: unknown };
		const results = parsed.results ?? [];

		return {
			content: [{ type: "text" as const, text: formatResults(results) }],
			details: {
				query,
				resultCount: results.length,
				requestId: parsed.requestId ?? null,
				costDollars: parsed.costDollars ?? null,
			},
		};
	},
});

export default function exaWebSearchExtension(pi: ExtensionAPI) {
	pi.registerTool(webSearchTool);

	// Registered tools start active, so this must also deactivate on non-matching
	// providers, not just activate on matching ones.
	const syncActivation = (_event: unknown, ctx: ExtensionContext) => {
		const active = pi.getActiveTools();
		const shouldBeActive = ctx.model?.provider === ENABLED_PROVIDER;
		if (shouldBeActive === active.includes(TOOL_NAME)) return;

		pi.setActiveTools(shouldBeActive ? [...active, TOOL_NAME] : active.filter((name) => name !== TOOL_NAME));
	};

	pi.on("session_start", syncActivation);
	pi.on("model_select", syncActivation);
}
