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
import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import {
  FETCH_DEFAULT_TIMEOUT_MS,
  FETCH_MAX_TIMEOUT_MS,
  MAX_FETCH_RESPONSE_BYTES,
  abortAfterAny,
  extractMimeType,
  isAbortError,
} from "./shared";

const WEBFETCH_DESCRIPTION = `- Fetches content from a specified URL
- Takes a URL and optional format as input
- Fetches the URL content, converts to requested format (markdown by default)
- Returns the content in the specified format
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: if another tool is present that offers better web fetching capabilities, is more targeted to the task, or has fewer restrictions, prefer using that tool instead of this one.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - Format options: "markdown" (default), "text", or "html"
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large`;

type FetchFormat = "text" | "markdown" | "html";

function truncateMiddle(value: string, maxLength = 120): string {
  if (value.length <= maxLength) return value;
  const keep = Math.max(8, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function createWebFetchToolDefinition() {
  return {
    name: "webfetch",
    label: "Web Fetch",
    description: WEBFETCH_DESCRIPTION,
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch content from" }),
      format: Type.Optional(
        StringEnum(["text", "markdown", "html"] as const, {
          description:
            "The format to return the content in (text, markdown, or html). Defaults to markdown.",
          default: "markdown",
        }),
      ),
      timeout: Type.Optional(Type.Number({ description: "Optional timeout in seconds (max 120)" })),
    }),
    renderResult(result, options, theme) {
      const details = (result.details ?? {}) as {
        url?: string;
        contentType?: string;
        format?: FetchFormat;
        image?: boolean;
        truncated?: boolean;
        statusCode?: number;
        responseBytes?: number;
      };

      const textBlock = result.content.find((item) => item.type === "text");
      const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
      const lineCount = text.length === 0 ? 0 : text.split("\n").length;

      if (!options.expanded) {
        const method = theme.fg("toolOutput", "GET");
        const target = details.url
          ? theme.fg("accent", truncateMiddle(details.url))
          : theme.fg("muted", "(no URL)");
        const title = `${method} ${target}`;

        const bits: string[] = [];
        if (typeof details.statusCode === "number") bits.push(`status ${details.statusCode}`);
        if (details.contentType) bits.push(details.contentType);
        if (details.format) bits.push(`as ${details.format}`);
        if (typeof details.responseBytes === "number") bits.push(formatSize(details.responseBytes));
        if (details.image) bits.push("image attachment");
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
      // Validate URL
      if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
        throw new Error("URL must start with http:// or https://");
      }

      onUpdate?.({ content: [{ type: "text", text: "Fetching URL..." }] });

      const format: FetchFormat = params.format ?? "markdown";
      const timeoutMs = Math.min((params.timeout ?? FETCH_DEFAULT_TIMEOUT_MS / 1000) * 1000, FETCH_MAX_TIMEOUT_MS);
      const { signal: requestSignal, clearTimeout } = abortAfterAny(timeoutMs, signal);

      // Build Accept header based on requested format with q parameters for fallbacks
      let acceptHeader = "*/*";
      switch (format) {
        case "markdown":
          acceptHeader =
            "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
          break;
        case "text":
          acceptHeader = "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
          break;
        case "html":
          acceptHeader =
            "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
          break;
        default:
          acceptHeader =
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
      }

      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: acceptHeader,
        "Accept-Language": "en-US,en;q=0.9",
      };

      try {
        const initial = await fetch(params.url, { signal: requestSignal, headers });

        // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
        const response =
          initial.status === 403 && initial.headers.get("cf-mitigated") === "challenge"
            ? await fetch(params.url, {
                signal: requestSignal,
                headers: { ...headers, "User-Agent": "opencode" },
              })
            : initial;

        if (!response.ok) {
          throw new Error(`Request failed with status code: ${response.status}`);
        }

        // Check content length
        const contentLength = response.headers.get("content-length");
        if (contentLength && Number.parseInt(contentLength, 10) > MAX_FETCH_RESPONSE_BYTES) {
          throw new Error("Response too large (exceeds 5MB limit)");
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_FETCH_RESPONSE_BYTES) {
          throw new Error("Response too large (exceeds 5MB limit)");
        }

        const contentType = response.headers.get("content-type") || "";
        const mime = extractMimeType(contentType);

        // Check if response is an image
        const isImage = mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet";
        if (isImage) {
          const base64Content = Buffer.from(arrayBuffer).toString("base64");
          return {
            content: [
              { type: "text", text: "Image fetched successfully" },
              { type: "image", data: base64Content, mimeType: mime },
            ],
            details: {
              url: params.url,
              contentType,
              format,
              image: true,
              truncated: false,
              statusCode: response.status,
              responseBytes: arrayBuffer.byteLength,
            },
          };
        }

        const rawContent = new TextDecoder().decode(arrayBuffer);

        // Handle content based on requested format and actual content type
        let output = rawContent;
        switch (format) {
          case "markdown":
            if (contentType.includes("text/html")) {
              output = convertHTMLToMarkdown(rawContent);
            }
            break;
          case "text":
            if (contentType.includes("text/html")) {
              output = await extractTextFromHTML(rawContent);
            }
            break;
          case "html":
            output = rawContent;
            break;
        }

        const truncation = truncateHead(output, {
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
            url: params.url,
            contentType,
            format,
            image: false,
            truncated: truncation.truncated,
            statusCode: response.status,
            responseBytes: arrayBuffer.byteLength,
          },
        };
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw new Error("Request timed out or was cancelled");
        }
        throw error;
      } finally {
        clearTimeout();
      }
    },
  };
}

export default function registerWebFetchTool(pi: ExtensionAPI) {
  pi.registerTool(createWebFetchToolDefinition());
}

async function extractTextFromHTML(html: string): Promise<string> {
  const { document } = parseHTML(html);
  document
    .querySelectorAll("script,style,noscript,iframe,object,embed")
    .forEach((node) => node.remove());

  const text = document.body?.textContent ?? document.documentElement?.textContent ?? "";
  return text.trim();
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndownService.remove(["script", "style", "meta", "link"]);
  return turndownService.turndown(html);
}
