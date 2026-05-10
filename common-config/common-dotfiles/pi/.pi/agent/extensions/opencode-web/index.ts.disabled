import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { Text } from "@earendil-works/pi-tui"
import TurndownService from "turndown"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MAX_BODY = 5 * 1024 * 1024
const FETCH_TIMEOUT = 30
const FETCH_TIMEOUT_MAX = 120
const SEARCH_TIMEOUT = 25_000
const SEARCH_NUM = 8
const SEARCH_URL = "https://mcp.exa.ai/mcp"
const YEAR = new Date().getFullYear().toString()

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
})

turndown.remove(["script", "style", "meta", "link", "noscript", "iframe", "object", "embed"])

const fetchSchema = Type.Object({
  url: Type.String({ description: "The URL to fetch content from" }),
  format: Type.Optional(
    Type.String({
      description: 'The format to return: "markdown" (default), "text", or "html"',
    }),
  ),
  timeout: Type.Optional(Type.Number({ description: "Optional timeout in seconds (max 120)" })),
})

const searchSchema = Type.Object({
  query: Type.String({ description: "Web search query" }),
  numResults: Type.Optional(Type.Number({ description: "Number of results to return (default: 8)" })),
  livecrawl: Type.Optional(
    Type.String({ description: 'Live crawl mode: "fallback" (default) or "preferred"' }),
  ),
  type: Type.Optional(Type.String({ description: 'Search type: "auto" (default), "fast", or "deep"' })),
  contextMaxCharacters: Type.Optional(
    Type.Number({ description: "Maximum characters for the LLM-optimized context string" }),
  ),
})

function trimUrl(input: string) {
  const url = input.trim().replace(/^http:\/\//i, "https://")
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://")
  return new URL(url).toString()
}

function pickFormat(input?: string) {
  const format = (input ?? "markdown").trim().toLowerCase()
  if (format === "markdown" || format === "text" || format === "html") return format
  throw new Error('format must be one of: "markdown", "text", "html"')
}

function pickLivecrawl(input?: string) {
  if (input === undefined) return "fallback"
  if (input === "fallback" || input === "preferred") return input
  throw new Error('livecrawl must be one of: "fallback", "preferred"')
}

function pickType(input?: string) {
  if (input === undefined) return "auto"
  if (input === "auto" || input === "fast" || input === "deep") return input
  throw new Error('type must be one of: "auto", "fast", "deep"')
}

function pickTimeout(input?: number) {
  const secs = Number.isFinite(input) ? Math.max(1, Math.floor(input!)) : FETCH_TIMEOUT
  return Math.min(secs, FETCH_TIMEOUT_MAX) * 1000
}

function accept(format: string) {
  if (format === "markdown")
    return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
  if (format === "text") return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
  if (format === "html")
    return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
  return "*/*"
}

function trap(signal: AbortSignal | undefined, ms: number) {
  const ctl = new AbortController()
  let timeout = false
  const id = setTimeout(() => {
    timeout = true
    ctl.abort(new Error("Timed out"))
  }, ms)
  const stop = () => {
    clearTimeout(id)
    signal?.removeEventListener("abort", abort)
  }
  const abort = () => ctl.abort(signal?.reason)
  signal?.addEventListener("abort", abort, { once: true })
  return { signal: ctl.signal, timeout: () => timeout, stop }
}

function file(text: string, ext: string) {
  const dir = mkdtempSync(join(tmpdir(), "pi-opencode-web-"))
  const path = join(dir, `output.${ext}`)
  writeFileSync(path, text)
  return path
}

function limit(text: string, ext: string) {
  const truncation = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  })
  if (!truncation.truncated) return { text: truncation.content, truncation }
  const path = file(text, ext)
  const out = [
    truncation.content,
    "",
    `[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${path}]`,
  ].join("\n")
  return { text: out, truncation, path }
}

function decode(text: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, raw: string) => {
    const key = raw.toLowerCase()
    if (key in named) return named[key]
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    }
    return _
  })
}

function text(html: string) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
      .replace(/<object[\s\S]*?<\/object>/gi, " ")
      .replace(/<embed[\s\S]*?<\/embed>/gi, " ")
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/tr|\/h[1-6]|\/blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
}

function markdown(html: string) {
  return turndown.turndown(html)
}

function short(input: string, max: number) {
  if (input.length <= max) return input
  return `${input.slice(0, max - 3)}...`
}

function preview(result: { content: Array<{ type: string; text?: string }> }, max: number) {
  const part = result.content.find((part) => part.type === "text") as { type: "text"; text: string } | undefined
  if (!part?.text?.trim()) return ""
  const lines = part.text.trim().split("\n")
  const head = lines.slice(0, max).join("\n")
  if (lines.length <= max) return head
  return `${head}\n... ${lines.length - max} more lines`
}

async function body(response: Response) {
  const len = response.headers.get("content-length")
  if (len && Number.parseInt(len, 10) > MAX_BODY) {
    throw new Error("Response too large (exceeds 5MB limit)")
  }
  const buf = await response.arrayBuffer()
  if (buf.byteLength > MAX_BODY) {
    throw new Error("Response too large (exceeds 5MB limit)")
  }
  return buf
}

async function webfetch(params: { url: string; format?: string; timeout?: number }, signal?: AbortSignal) {
  const url = trimUrl(params.url)
  const format = pickFormat(params.format)
  const trapper = trap(signal, pickTimeout(params.timeout))
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Accept: accept(format),
    "Accept-Language": "en-US,en;q=0.9",
  }

  try {
    const first = await fetch(url, { signal: trapper.signal, headers })
    const response =
      first.status === 403 && first.headers.get("cf-mitigated") === "challenge"
        ? await fetch(url, {
            signal: trapper.signal,
            headers: { ...headers, "User-Agent": "opencode" },
          })
        : first

    if (!response.ok) {
      throw new Error(`Request failed with status code: ${response.status}`)
    }

    const buf = await body(response)
    const type = response.headers.get("content-type") || "application/octet-stream"
    const mime = type.split(";")[0]?.trim().toLowerCase() || "application/octet-stream"
    const title = `${url} (${type})`

    if (mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet") {
      return {
        content: [
          { type: "text", text: `Fetched image from ${url}` },
          { type: "image", data: Buffer.from(buf).toString("base64"), mimeType: mime },
        ],
        details: { url, format, mime },
      }
    }

    const raw = new TextDecoder().decode(buf)
    const out =
      format === "html" ? raw : format === "text" && type.includes("text/html") ? text(raw) : format === "markdown" && type.includes("text/html") ? markdown(raw) : raw
    const cut = limit(out, format === "html" ? "html" : format === "markdown" ? "md" : "txt")
    return {
      content: [{ type: "text", text: cut.text }],
      details: { url, format, mime, truncation: cut.truncation, fullOutputPath: cut.path, title },
    }
  } catch (err) {
    if (trapper.timeout() && !signal?.aborted) {
      throw new Error(`Request timed out after ${Math.floor(pickTimeout(params.timeout) / 1000)} seconds`)
    }
    throw err
  } finally {
    trapper.stop()
  }
}

async function websearch(
  params: {
    query: string
    numResults?: number
    livecrawl?: string
    type?: string
    contextMaxCharacters?: number
  },
  signal?: AbortSignal,
) {
  const query = params.query.trim()
  if (!query) throw new Error("query is required")
  const numResults = Number.isFinite(params.numResults) ? Math.max(1, Math.floor(params.numResults!)) : SEARCH_NUM
  const livecrawl = pickLivecrawl(params.livecrawl)
  const type = pickType(params.type)
  const trapper = trap(signal, SEARCH_TIMEOUT)

  try {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      signal: trapper.signal,
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: {
            query,
            numResults,
            livecrawl,
            type,
            contextMaxCharacters: params.contextMaxCharacters,
          },
        },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Search error (${response.status}): ${err}`)
    }

    const input = await response.text()
    const hit = input
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => {
        try {
          return JSON.parse(line.slice(6))
        } catch {
          return undefined
        }
      })
      .find((item) => item?.result?.content?.[0]?.text)

    const raw = hit?.result?.content?.[0]?.text ?? "No search results found. Please try a different query."
    const cut = limit(raw, "md")
    return {
      content: [{ type: "text", text: cut.text }],
      details: {
        query,
        numResults,
        livecrawl,
        type,
        contextMaxCharacters: params.contextMaxCharacters,
        provider: "exa",
        truncation: cut.truncation,
        fullOutputPath: cut.path,
      },
    }
  } catch (err) {
    if (trapper.timeout() && !signal?.aborted) {
      throw new Error("Search request timed out")
    }
    throw err
  } finally {
    trapper.stop()
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "webfetch",
    label: "WebFetch",
    description: `Fetch a specific URL and return markdown, text, html, or an inline image. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first); full text is saved to a temp file when truncated.`,
    promptSnippet: "Fetch a known URL as markdown, text, html, or an inline image",
    promptGuidelines: [
      "Use webfetch when the user gives a specific URL or when you already know which page you need.",
      "Prefer format=markdown unless the user explicitly needs plain text or raw HTML.",
      "If the user gives an http URL, you may still use this tool; it upgrades to https automatically.",
    ],
    parameters: fetchSchema,
    async execute(_toolCallId, params, signal) {
      return webfetch(params as { url: string; format?: string; timeout?: number }, signal)
    },
    renderCall(args, theme) {
      const url = short(String(args.url || "..."), 90)
      return new Text(`${theme.fg("toolTitle", theme.bold("% WebFetch "))}${theme.fg("accent", url)}`, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("muted", "Fetching from the web..."), 0, 0)

      const details = (result.details ?? {}) as {
        format?: string
        mime?: string
        truncation?: { truncated?: boolean }
        fullOutputPath?: string
      }

      if (!expanded) {
        let text = details.mime?.startsWith("image/")
          ? theme.fg("muted", "Fetched image")
          : theme.fg("muted", "Fetched web content")
        if (details.truncation?.truncated) text += theme.fg("warning", " [truncated]")
        return new Text(text, 0, 0)
      }

      let text = details.mime?.startsWith("image/")
        ? theme.fg("success", `Fetched image (${details.mime})`)
        : theme.fg("success", `Fetched ${details.format ?? "content"}`)

      const body = preview(result as { content: Array<{ type: string; text?: string }> }, 18)
      if (body) text += `\n${theme.fg("toolOutput", body)}`
      if (details.fullOutputPath) text += `\n${theme.fg("muted", `Full output: ${details.fullOutputPath}`)}`
      return new Text(text, 0, 0)
    },
  })

  pi.registerTool({
    name: "websearch",
    label: "WebSearch",
    description: `Search the web using Exa's hosted MCP endpoint for current information beyond the model cutoff. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first); full text is saved to a temp file when truncated.`,
    promptSnippet: "Search the web via Exa for discovery and current information",
    promptGuidelines: [
      "Use websearch for discovery; use webfetch when you need content from a specific URL.",
      `For recent or current information, include the current year (${YEAR}) in the query when helpful.`,
      "After finding the right page, use webfetch to retrieve the exact URL if deeper inspection is needed.",
    ],
    parameters: searchSchema,
    async execute(_toolCallId, params, signal) {
      return websearch(
        params as {
          query: string
          numResults?: number
          livecrawl?: string
          type?: string
          contextMaxCharacters?: number
        },
        signal,
      )
    },
    renderCall(args, theme) {
      const query = short(String(args.query || "..."), 80)
      const count = args.numResults ? theme.fg("muted", ` (${args.numResults} results)`) : ""
      return new Text(
        `${theme.fg("toolTitle", theme.bold("◈ Exa Web Search \""))}${theme.fg("accent", query)}${theme.fg("toolTitle", theme.bold("\""))}${count}`,
        0,
        0,
      )
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("muted", "Searching web..."), 0, 0)

      const details = (result.details ?? {}) as {
        numResults?: number
        truncation?: { truncated?: boolean }
        fullOutputPath?: string
      }

      if (!expanded) {
        let text = theme.fg("muted", "Search complete")
        if (details.numResults) text += theme.fg("muted", ` (${details.numResults} requested)`)
        if (details.truncation?.truncated) text += theme.fg("warning", " [truncated]")
        return new Text(text, 0, 0)
      }

      let text = theme.fg("success", "Search complete")
      if (details.numResults) text += theme.fg("muted", ` (${details.numResults} requested)`)
      const body = preview(result as { content: Array<{ type: string; text?: string }> }, 18)
      if (body) text += `\n${theme.fg("toolOutput", body)}`
      if (details.fullOutputPath) text += `\n${theme.fg("muted", `Full output: ${details.fullOutputPath}`)}`
      return new Text(text, 0, 0)
    },
  })
}
