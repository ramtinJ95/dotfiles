import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  keyHint,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { abortAfterAny, isAbortError } from "./shared";

const API_CONFIG = {
  BASE_URL: "https://mcp.exa.ai",
  ENDPOINTS: {
    SEARCH: "/mcp",
  },
  DEFAULT_NUM_RESULTS: 8,
} as const;

const WEBSEARCH_DESCRIPTION_TEMPLATE = `- Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs
- Provides up-to-date information for current events and recent data
- Supports configurable result counts and returns the content from the most relevant websites
- Use this tool for accessing information beyond knowledge cutoff
- Searches are performed automatically within a single API call

Usage notes:
  - Supports live crawling modes: 'fallback' (backup if cached unavailable) or 'preferred' (prioritize live crawling)
  - Search types: 'auto' (balanced), 'fast' (quick results), 'deep' (comprehensive search)
  - Configurable context length for optimal LLM integration
  - Domain filtering and advanced search options available

The current year is {{year}}. You MUST use this year when searching for recent information or current events
- Example: If the current year is 2026 and the user asks for "latest AI news", search for "AI news 2026", NOT "AI news 2025"`;

interface McpSearchRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: {
      query: string;
      numResults?: number;
      livecrawl?: "fallback" | "preferred";
      type?: "auto" | "fast" | "deep";
      contextMaxCharacters?: number;
    };
  };
}

interface McpSearchResponse {
  jsonrpc: string;
  result?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
}

function truncateMiddle(value: string, maxLength = 100): string {
  if (value.length <= maxLength) return value;
  const keep = Math.max(8, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>"']+/g) ?? [];
  return Array.from(new Set(matches));
}

function extractTopDomains(urls: string[], max = 3): string[] {
  const domains: string[] = [];
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (!domains.includes(hostname)) domains.push(hostname);
      if (domains.length >= max) break;
    } catch {
      // Ignore malformed URLs
    }
  }
  return domains;
}

export function createWebSearchToolDefinition() {
  const description = WEBSEARCH_DESCRIPTION_TEMPLATE.replace("{{year}}", String(new Date().getFullYear()));

  return {
    name: "websearch",
    label: "Web Search",
    description,
    parameters: Type.Object({
      query: Type.String({ description: "Websearch query" }),
      numResults: Type.Optional(
        Type.Number({ description: "Number of search results to return (default: 8)" }),
      ),
      livecrawl: Type.Optional(
        StringEnum(["fallback", "preferred"] as const, {
          description:
            "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
        }),
      ),
      type: Type.Optional(
        StringEnum(["auto", "fast", "deep"] as const, {
          description:
            "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
        }),
      ),
      contextMaxCharacters: Type.Optional(
        Type.Number({
          description: "Maximum characters for context string optimized for LLMs (default: 10000)",
        }),
      ),
    }),
    renderResult(result, options, theme) {
      const details = (result.details ?? {}) as {
        query?: string;
        truncated?: boolean;
        requestedResults?: number;
        urlMentions?: number;
        topDomains?: string[];
      };

      const textBlock = result.content.find((item) => item.type === "text");
      const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
      const lineCount = text.length === 0 ? 0 : text.split("\n").length;

      if (!options.expanded) {
        const title = details.query
          ? `${theme.fg("toolOutput", "SEARCH")} ${theme.fg("accent", truncateMiddle(details.query))}`
          : `${theme.fg("toolOutput", "SEARCH")} ${theme.fg("muted", "(no query)")}`;
        const bits: string[] = [];
        if (typeof details.requestedResults === "number") bits.push(`requested ${details.requestedResults}`);
        if (typeof details.urlMentions === "number") bits.push(`${details.urlMentions} links`);
        if (Array.isArray(details.topDomains) && details.topDomains.length > 0) {
          bits.push(`domains: ${details.topDomains.join(", ")}`);
        }
        bits.push(`${lineCount} lines`);
        if (details.truncated) bits.push("truncated");

        return new Text(
          `${title}\n${theme.fg("muted", `(${bits.join(", ")}, ${keyHint("expandTools", "to expand output")})`)}`,
          0,
          0,
        );
      }

      return new Text(text.split("\n").map((line) => theme.fg("toolOutput", line)).join("\n"), 0, 0);
    },
    async execute(_toolCallId, params, signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "Searching..." }] });

      const searchRequest: McpSearchRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: {
            query: params.query,
            type: params.type || "auto",
            numResults: params.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
            livecrawl: params.livecrawl || "fallback",
            contextMaxCharacters: params.contextMaxCharacters,
          },
        },
      };

      const { signal: requestSignal, clearTimeout } = abortAfterAny(25_000, signal);

      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`, {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify(searchRequest),
          signal: requestSignal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Search error (${response.status}): ${errorText}`);
        }

        const responseText = await response.text();

        // Parse SSE response
        const lines = responseText.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6)) as McpSearchResponse;
            const text = data.result?.content?.[0]?.text;
            if (!text) continue;

            const urls = extractUrls(text);
            const topDomains = extractTopDomains(urls);

            const truncation = truncateHead(text, {
              maxLines: DEFAULT_MAX_LINES,
              maxBytes: DEFAULT_MAX_BYTES,
            });

            let resultText = truncation.content;
            if (truncation.truncated) {
              resultText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
              resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`;
            }

            return {
              content: [{ type: "text", text: resultText }],
              details: {
                query: params.query,
                truncated: truncation.truncated,
                requestedResults: params.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
                urlMentions: urls.length,
                topDomains,
              },
            };
          } catch {
            // Ignore malformed SSE chunks and continue
          }
        }

        return {
          content: [{ type: "text", text: "No search results found. Please try a different query." }],
          details: {
            query: params.query,
            truncated: false,
            requestedResults: params.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
            urlMentions: 0,
            topDomains: [],
          },
        };
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw new Error("Search request timed out");
        }
        throw error;
      } finally {
        clearTimeout();
      }
    },
  };
}

export default function registerWebSearchTool(pi: ExtensionAPI) {
  pi.registerTool(createWebSearchToolDefinition());
}
