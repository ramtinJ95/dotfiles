import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath, pathToFileURL } from "url"

// Configuration
const DEFAULT_ENTRY_LIMIT = 3
const VENDOR_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "vendor", "node_modules")

// ============================================================================
// Type Definitions
// ============================================================================

interface SessionMessage {
  info: SessionMessageInfo
  parts: SessionMessagePart[]
}

interface SessionMessageInfo {
  id: string
  role: string
  modelID?: string
  providerID?: string
  system?: string[]
  tokens?: TokenUsage
}

interface TokenUsage {
  input?: number
  output?: number
  reasoning?: number
  cache?: {
    read?: number
    write?: number
  }
}

type SessionMessagePart =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; state: ToolState }
  | { type: string; [key: string]: unknown }

// Type guard functions
function isToolPart(part: SessionMessagePart): part is { type: "tool"; tool: string; state: ToolState } {
  return part.type === "tool"
}

function isReasoningPart(part: SessionMessagePart): part is { type: "reasoning"; text: string } {
  return part.type === "reasoning"
}

function isTextPart(part: SessionMessagePart): part is { type: "text"; text: string; synthetic?: boolean } {
  return part.type === "text"
}

interface ToolState {
  status: "pending" | "running" | "completed" | "error"
  output?: string
}

interface CategoryEntry {
  label: string
  tokens: number
}

interface CategorySummary {
  label: string
  totalTokens: number
  entries: CategoryEntry[]
  allEntries: CategoryEntry[]
}

interface TokenAnalysis {
  sessionID: string
  model: TokenModel
  categories: {
    system: CategorySummary
    user: CategorySummary
    assistant: CategorySummary
    tools: CategorySummary
    reasoning: CategorySummary
  }
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  allToolsCalled: string[]
  toolCallCounts: Map<string, number>
}

interface TokenModel {
  name: string
  spec: TokenizerSpec
}

type TokenizerSpec = 
  | { kind: "tiktoken"; model: string }
  | { kind: "transformers"; hub: string }
  | { kind: "approx" }

interface CategoryEntrySource {
  label: string
  content: string
}

interface CostEstimate {
  inputCost: number
  outputCost: number
  cacheCost: number
  totalCost: number
  pricePerMillionInput: number
  pricePerMillionOutput: number
  pricePerMillionCacheRead: number
  pricePerMillionCacheWrite: number
}

// ============================================================================
// Model Configuration
// ============================================================================

// Pricing per 1M tokens (input / output / cache_read / cache_write)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  // Claude models
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.7-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.5-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.5-haiku": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  "claude-3-opus": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-3-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3-haiku": { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
  
  // OpenAI models
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o1-pro": { input: 15, output: 60 },
  
  // DeepSeek models
  "deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek-v3": { input: 0.27, output: 1.1 },
  "deepseek-v2": { input: 0.14, output: 0.28 },
  
  // Llama models (typical via providers)
  "llama-3.3": { input: 0.06, output: 0.06 },
  "llama-3.2": { input: 0.055, output: 0.055 },
  "llama-3.1": { input: 0.06, output: 0.06 },
  
  // Mistral models
  "mistral-large": { input: 2, output: 6 },
  "mistral-small": { input: 0.2, output: 0.6 },
  
  // Default fallback
  "default": { input: 1, output: 3 },
}

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-5": "gpt-4o",
  "o4-mini": "gpt-4o",
  "o3": "gpt-4o",
  "o3-mini": "gpt-4o",
  "o1": "gpt-4o",
  "o1-pro": "gpt-4o",
  "gpt-4.1": "gpt-4o",
  "gpt-4.1-mini": "gpt-4o",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4",
  "gpt-4": "gpt-4",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "text-embedding-3-large": "text-embedding-3-large",
  "text-embedding-3-small": "text-embedding-3-small",
  "text-embedding-ada-002": "text-embedding-ada-002",
}

const TRANSFORMERS_MODEL_MAP: Record<string, string> = {
  "claude-opus-4": "Xenova/claude-tokenizer",
  "claude-sonnet-4": "Xenova/claude-tokenizer",
  "claude-3.7-sonnet": "Xenova/claude-tokenizer",
  "claude-3.5-sonnet": "Xenova/claude-tokenizer",
  "claude-3.5-haiku": "Xenova/claude-tokenizer",
  "claude-3-opus": "Xenova/claude-tokenizer",
  "claude-3-sonnet": "Xenova/claude-tokenizer",
  "claude-3-haiku": "Xenova/claude-tokenizer",
  "claude-2.1": "Xenova/claude-tokenizer",
  "claude-2.0": "Xenova/claude-tokenizer",
  "claude-instant-1.2": "Xenova/claude-tokenizer",
  "llama-4": "Xenova/llama4-tokenizer",
  "llama-3.3": "unsloth/Llama-3.3-70B-Instruct",
  "llama-3.2": "Xenova/Llama-3.2-Tokenizer",
  "llama-3.1": "Xenova/Meta-Llama-3.1-Tokenizer",
  "llama-3": "Xenova/llama3-tokenizer-new",
  "llama-2": "Xenova/llama2-tokenizer",
  "code-llama": "Xenova/llama-code-tokenizer",
  "deepseek-r1": "deepseek-ai/DeepSeek-R1",
  "deepseek-v3": "deepseek-ai/DeepSeek-V3",
  "deepseek-v2": "deepseek-ai/DeepSeek-V2",
  "mistral-large": "Xenova/mistral-tokenizer-v3",
  "mistral-small": "Xenova/mistral-tokenizer-v3",
  "mistral-nemo": "Xenova/Mistral-Nemo-Instruct-Tokenizer",
  "devstral-small": "Xenova/Mistral-Nemo-Instruct-Tokenizer",
  "codestral": "Xenova/mistral-tokenizer-v3",
}

const PROVIDER_DEFAULTS: Record<string, TokenizerSpec> = {
  anthropic: { kind: "transformers", hub: "Xenova/claude-tokenizer" },
  meta: { kind: "transformers", hub: "Xenova/Meta-Llama-3.1-Tokenizer" },
  mistral: { kind: "transformers", hub: "Xenova/mistral-tokenizer-v3" },
  deepseek: { kind: "transformers", hub: "deepseek-ai/DeepSeek-V3" },
  google: { kind: "transformers", hub: "google/gemma-2-9b-it" },
}

// ============================================================================
// Tokenizer Management
// ============================================================================

class TokenizerManager {
  private tiktokenCache = new Map<string, any>()
  private transformerCache = new Map<string, any>()
  private tiktokenModule?: Promise<any>
  private transformersModule?: Promise<any>

  async countTokens(content: string, model: TokenModel): Promise<number> {
    if (!content.trim()) return 0

    try {
      switch (model.spec.kind) {
        case "approx":
          return this.approximateTokenCount(content)
        case "tiktoken":
          return await this.countWithTiktoken(content, model.spec.model)
        case "transformers":
          return await this.countWithTransformers(content, model.spec.hub)
      }
    } catch (error) {
      console.error(`Token counting error for ${model.name}:`, error)
      return this.approximateTokenCount(content)
    }
  }

  private approximateTokenCount(content: string): number {
    return Math.ceil(content.length / 4)
  }

  private async countWithTiktoken(content: string, model: string): Promise<number> {
    const encoder = await this.loadTiktokenEncoder(model)
    try {
      return encoder.encode(content).length
    } catch {
      return this.approximateTokenCount(content)
    }
  }

  private async countWithTransformers(content: string, hub: string): Promise<number> {
    const tokenizer = await this.loadTransformersTokenizer(hub)
    if (!tokenizer || typeof tokenizer.encode !== "function") {
      return this.approximateTokenCount(content)
    }

    try {
      const encoding = await tokenizer.encode(content)
      return Array.isArray(encoding) ? encoding.length : (encoding?.length ?? this.approximateTokenCount(content))
    } catch {
      return this.approximateTokenCount(content)
    }
  }

  private async loadTiktokenEncoder(model: string) {
    if (this.tiktokenCache.has(model)) {
      return this.tiktokenCache.get(model)
    }

    const mod = await this.loadTiktokenModule()
    
    // js-tiktoken uses camelCase, not snake_case
    const encodingForModel = mod.encodingForModel ?? mod.default?.encodingForModel
    const getEncoding = mod.getEncoding ?? mod.default?.getEncoding

    if (typeof getEncoding !== "function") {
      // Fall back to approximation if module not properly loaded
      return { encode: (text: string) => ({ length: Math.ceil(text.length / 4) }) }
    }

    let encoder
    try {
      encoder = encodingForModel(model)
    } catch {
      encoder = getEncoding("cl100k_base")
    }

    this.tiktokenCache.set(model, encoder)
    return encoder
  }

  private async loadTiktokenModule() {
    if (!this.tiktokenModule) {
      this.tiktokenModule = this.importFromVendor("js-tiktoken")
    }
    return this.tiktokenModule
  }

  private async loadTransformersTokenizer(hub: string) {
    if (this.transformerCache.has(hub)) {
      return this.transformerCache.get(hub)
    }

    try {
      const { AutoTokenizer } = await this.loadTransformersModule()
      const tokenizer = await AutoTokenizer.from_pretrained(hub)
      this.transformerCache.set(hub, tokenizer)
      return tokenizer
    } catch {
      this.transformerCache.set(hub, null)
      return null
    }
  }

  private async loadTransformersModule() {
    if (!this.transformersModule) {
      this.transformersModule = this.importFromVendor("@huggingface/transformers")
    }
    return this.transformersModule
  }

  private async importFromVendor(pkg: string) {
    const pkgJsonPath = path.join(VENDOR_ROOT, pkg, "package.json")
    let data: string
    try {
      data = await fs.readFile(pkgJsonPath, "utf8")
    } catch {
      throw new Error(
        `Token analyzer dependencies missing. Run the install.sh script to install vendor tokenizers.\n` +
        `Expected path: ${pkgJsonPath}`
      )
    }

    const manifest = JSON.parse(data)
    const entry = manifest.module ?? manifest.main ?? "index.js"
    const entryPath = path.join(VENDOR_ROOT, pkg, entry)
    return import(pathToFileURL(entryPath).href)
  }
}

// ============================================================================
// Model Resolution
// ============================================================================

class ModelResolver {
  resolveTokenModel(messages: SessionMessage[]): TokenModel {
    for (const message of [...messages].reverse()) {
      const modelID = this.canonicalize(message.info.modelID)
      const providerID = this.canonicalize(message.info.providerID)

      const openaiModel = this.resolveOpenAIModel(modelID, providerID)
      if (openaiModel) return openaiModel

      const transformerModel = this.resolveTransformersModel(modelID, providerID)
      if (transformerModel) return transformerModel
    }

    return { name: "approx", spec: { kind: "approx" } }
  }

  private resolveOpenAIModel(modelID?: string, providerID?: string): TokenModel | undefined {
    if (providerID === "openai" || providerID === "opencode" || providerID === "azure") {
      const mapped = this.mapOpenAI(modelID)
      return { name: modelID ?? mapped, spec: { kind: "tiktoken", model: mapped } }
    }

    if (modelID && OPENAI_MODEL_MAP[modelID]) {
      return { name: modelID, spec: { kind: "tiktoken", model: OPENAI_MODEL_MAP[modelID] } }
    }

    return undefined
  }

  private resolveTransformersModel(modelID?: string, providerID?: string): TokenModel | undefined {
    if (modelID && TRANSFORMERS_MODEL_MAP[modelID]) {
      return { name: modelID, spec: { kind: "transformers", hub: TRANSFORMERS_MODEL_MAP[modelID] } }
    }

    if (providerID && PROVIDER_DEFAULTS[providerID]) {
      return { name: modelID ?? providerID, spec: PROVIDER_DEFAULTS[providerID] }
    }

    // Prefix-based fallbacks
    if (modelID?.startsWith("claude")) {
      return { name: modelID, spec: { kind: "transformers", hub: "Xenova/claude-tokenizer" } }
    }

    if (modelID?.startsWith("llama")) {
      return {
        name: modelID,
        spec: { kind: "transformers", hub: TRANSFORMERS_MODEL_MAP[modelID] ?? "Xenova/Meta-Llama-3.1-Tokenizer" },
      }
    }

    if (modelID?.startsWith("mistral")) {
      return { name: modelID, spec: { kind: "transformers", hub: "Xenova/mistral-tokenizer-v3" } }
    }

    if (modelID?.startsWith("deepseek")) {
      return { name: modelID, spec: { kind: "transformers", hub: "deepseek-ai/DeepSeek-V3" } }
    }

    return undefined
  }

  private mapOpenAI(modelID?: string): string {
    if (!modelID) return "cl100k_base"
    return OPENAI_MODEL_MAP[modelID] ?? modelID
  }

  private canonicalize(value?: string): string | undefined {
    return value?.split("/").pop()?.toLowerCase().trim()
  }
}

// ============================================================================
// Content Collectors
// ============================================================================

class ContentCollector {
  collectSystemPrompts(messages: SessionMessage[]): CategoryEntrySource[] {
    const prompts = new Map<string, string>()

    for (const message of messages) {
      if (message.info.role !== "assistant") continue

      for (const prompt of message.info.system ?? []) {
        const trimmed = (prompt ?? "").trim()
        if (!trimmed) continue
        prompts.set(trimmed, trimmed)
      }
    }

    return Array.from(prompts.values()).map((content, index) => ({
      label: this.identifySystemPrompt(content, index + 1),
      content,
    }))
  }

  collectMessageTexts(messages: SessionMessage[], role: "user" | "assistant"): CategoryEntrySource[] {
    const results: CategoryEntrySource[] = []
    let index = 0

    for (const message of messages) {
      if (message.info.role !== role) continue
      const content = this.extractText(message.parts)
      if (!content) continue

      index += 1
      results.push({ label: `${this.capitalize(role)}#${index}`, content })
    }

    return results
  }

  collectToolOutputs(messages: SessionMessage[]): CategoryEntrySource[] {
    const toolOutputs = new Map<string, string>()

    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolPart(part)) continue

        if (part.state.status !== "completed") continue

        const output = (part.state.output ?? "").toString().trim()
        if (!output) continue

        const toolName = part.tool || "tool"
        const existing = toolOutputs.get(toolName) || ""
        toolOutputs.set(toolName, existing + (existing ? "\n\n" : "") + output)
      }
    }

    return Array.from(toolOutputs.entries()).map(([toolName, content]) => ({
      label: toolName,
      content,
    }))
  }

  collectToolCallCounts(messages: SessionMessage[]): Map<string, number> {
    const toolCounts = new Map<string, number>()

    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolPart(part)) continue

        const toolName = part.tool || "tool"
        if (toolName) {
          toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1)
        }
      }
    }

    return toolCounts
  }

  collectAllToolsCalled(messages: SessionMessage[]): string[] {
    return Array.from(this.collectToolCallCounts(messages).keys()).sort()
  }

  collectReasoningTexts(messages: SessionMessage[]): CategoryEntrySource[] {
    const results: CategoryEntrySource[] = []
    let index = 0

    for (const message of messages) {
      for (const part of message.parts) {
        if (!isReasoningPart(part)) continue

        const text = (part.text ?? "").toString().trim()
        if (!text) continue

        index += 1
        results.push({ label: `Reasoning#${index}`, content: text })
      }
    }

    return results
  }

  private extractText(parts: SessionMessagePart[]): string {
    return parts
      .filter(isTextPart)
      .map((part) => part.text ?? "")
      .map((text) => text.trim())
      .filter(Boolean)
      .join("\n\n")
  }

  private identifySystemPrompt(content: string, index: number): string {
    const lower = content.toLowerCase()

    // Specific identification patterns
    if (lower.includes("opencode") && lower.includes("cli") && content.length > 500) {
      return "System#MainPrompt"
    }
    if (lower.includes("opencode") && lower.includes("cli") && content.length <= 500) {
      return "System#ShortPrompt"
    }
    if (lower.includes("agent") && lower.includes("mode")) {
      return "System#AgentMode"
    }
    if (lower.includes("permission") || lower.includes("allowed") || lower.includes("deny")) {
      return "System#Permissions"
    }
    if (lower.includes("tool") && (lower.includes("rule") || lower.includes("guideline"))) {
      return "System#ToolRules"
    }
    if (lower.includes("format") || lower.includes("style") || lower.includes("concise")) {
      return "System#Formatting"
    }
    if (lower.includes("project") || lower.includes("repository") || lower.includes("codebase")) {
      return "System#ProjectContext"
    }
    if (lower.includes("session") || lower.includes("context") || lower.includes("memory")) {
      return "System#SessionMgmt"
    }
    if (content.includes("@") && (content.includes(".md") || content.includes(".txt"))) {
      return "System#FileRefs"
    }
    if (content.includes("name:") && content.includes("description:")) {
      return "System#AgentDef"
    }
    if (lower.includes("code") && (lower.includes("convention") || lower.includes("standard"))) {
      return "System#CodeGuidelines"
    }

    // Fallback numbering
    return `System#${index}`
  }

  private capitalize(value: string): string {
    if (!value) return value
    return value[0].toUpperCase() + value.slice(1)
  }
}

// ============================================================================
// Token Analysis Engine
// ============================================================================

class TokenAnalysisEngine {
  constructor(
    private tokenizerManager: TokenizerManager,
    private contentCollector: ContentCollector
  ) {}

  async analyze(
    sessionID: string,
    messages: SessionMessage[],
    tokenModel: TokenModel,
    entryLimit: number
  ): Promise<TokenAnalysis> {
    const systemPrompts = this.contentCollector.collectSystemPrompts(messages)
    const userTexts = this.contentCollector.collectMessageTexts(messages, "user")
    const assistantTexts = this.contentCollector.collectMessageTexts(messages, "assistant")
    const toolOutputs = this.contentCollector.collectToolOutputs(messages)
    const reasoningTraces = this.contentCollector.collectReasoningTexts(messages)
    const allToolsCalled = this.contentCollector.collectAllToolsCalled(messages)
    const toolCallCounts = this.contentCollector.collectToolCallCounts(messages)

    const [system, user, assistant, tools, reasoning] = await Promise.all([
      this.buildCategory("system", systemPrompts, tokenModel, entryLimit),
      this.buildCategory("user", userTexts, tokenModel, entryLimit),
      this.buildCategory("assistant", assistantTexts, tokenModel, entryLimit),
      this.buildCategory("tools", toolOutputs, tokenModel, entryLimit),
      this.buildCategory("reasoning", reasoningTraces, tokenModel, entryLimit),
    ])

    const analysis: TokenAnalysis = {
      sessionID,
      model: tokenModel,
      categories: { system, user, assistant, tools, reasoning },
      totalTokens:
        system.totalTokens + user.totalTokens + assistant.totalTokens + tools.totalTokens + reasoning.totalTokens,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      allToolsCalled,
      toolCallCounts,
    }

    this.applyTelemetryAdjustments(analysis, messages)

    return analysis
  }

  private async buildCategory(
    label: string,
    sources: CategoryEntrySource[],
    model: TokenModel,
    entryLimit: number
  ): Promise<CategorySummary> {
    const entries: CategoryEntry[] = []

    for (const source of sources) {
      const tokens = await this.tokenizerManager.countTokens(source.content, model)
      if (tokens > 0) {
        entries.push({ label: source.label, tokens })
      }
    }

    entries.sort((a, b) => b.tokens - a.tokens)
    const limited = entries.slice(0, entryLimit)
    const totalTokens = entries.reduce((sum, entry) => sum + entry.tokens, 0)

    return { label, totalTokens, entries: limited, allEntries: entries }
  }

  private applyTelemetryAdjustments(analysis: TokenAnalysis, messages: SessionMessage[]) {
    const assistantMessages = messages
      .filter((m) => m.info.role === "assistant" && m.info.tokens)
      .map((m) => ({ message: m, tokens: m.info.tokens! }))

    const recentMessage = assistantMessages
      .reverse()
      .find((item) => this.hasNonZeroUsage(item.tokens)) ?? assistantMessages[assistantMessages.length - 1]

    if (!recentMessage) return

    const tokens = recentMessage.tokens
    const inputTokens = Number(tokens.input) || 0
    const cacheReadTokens = Number(tokens.cache?.read) || 0
    const cacheWriteTokens = Number(tokens.cache?.write) || 0
    const promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens
    const assistantTokens = Number(tokens.output) || 0
    const reasoningTokens = Number(tokens.reasoning) || 0

    const promptMeasured =
      analysis.categories.system.totalTokens +
      analysis.categories.user.totalTokens +
      analysis.categories.tools.totalTokens

    this.scalePromptCategories(analysis, promptTokens, promptMeasured)
    this.scaleCategory(analysis.categories.assistant, assistantTokens, "Assistant output")
    this.scaleCategory(analysis.categories.reasoning, reasoningTokens, "Reasoning")

    // Store the actual telemetry values
    analysis.inputTokens = inputTokens
    analysis.outputTokens = assistantTokens + reasoningTokens
    analysis.cacheReadTokens = cacheReadTokens
    analysis.cacheWriteTokens = cacheWriteTokens

    analysis.totalTokens =
      analysis.categories.system.totalTokens +
      analysis.categories.user.totalTokens +
      analysis.categories.assistant.totalTokens +
      analysis.categories.tools.totalTokens +
      analysis.categories.reasoning.totalTokens
  }

  private hasNonZeroUsage(tokens: TokenUsage): boolean {
    return (
      (Number(tokens.input) || 0) +
      (Number(tokens.output) || 0) +
      (Number(tokens.reasoning) || 0) +
      (Number(tokens.cache?.read) || 0) +
      (Number(tokens.cache?.write) || 0) > 0
    )
  }

  private scalePromptCategories(analysis: TokenAnalysis, actual: number, measured: number) {
    const categories = [analysis.categories.system, analysis.categories.user, analysis.categories.tools]

    if (actual <= 0) {
      for (const category of categories) {
        category.totalTokens = 0
        for (const entry of category.entries) entry.tokens = 0
      }
      return
    }

    if (measured <= 0) {
      const share = actual / categories.length
      for (const category of categories) {
        if (category.entries.length === 0) {
          category.entries.push({ label: category.label, tokens: share })
        } else {
          category.entries = [{ label: category.entries[0].label, tokens: share }]
        }
        category.totalTokens = share
      }
      return
    }

    const factor = actual / measured
    let accumulated = 0

    for (const category of categories) {
      const scaled = this.scaleEntries(category.entries, factor)
      category.totalTokens = scaled
      accumulated += scaled
    }

    const diff = actual - accumulated
    if (Math.abs(diff) > 1e-6 && categories.length) {
      categories[0].totalTokens += Math.round(diff)
      if (categories[0].entries.length) {
        categories[0].entries[0].tokens += Math.round(diff)
      }
    }
  }

  private scaleCategory(category: CategorySummary, actual: number, fallbackLabel: string) {
    if (actual <= 0) {
      category.totalTokens = 0
      category.entries = []
      return
    }

    const measured = category.totalTokens

    if (measured <= 0) {
      category.entries = [{ label: fallbackLabel, tokens: actual }]
      category.totalTokens = actual
      return
    }

    const factor = actual / measured
    const scaled = this.scaleEntries(category.entries, factor)
    category.totalTokens = scaled

    const diff = actual - scaled
    if (Math.abs(diff) > 1e-6 && category.entries.length) {
      category.entries[0].tokens += Math.round(diff)
      category.totalTokens += Math.round(diff)
    }
  }

  private scaleEntries(entries: CategoryEntry[], factor: number): number {
    let total = 0
    for (const entry of entries) {
      entry.tokens = Math.round(entry.tokens * factor)
      total += entry.tokens
    }
    return total
  }
}

// ============================================================================
// Cost Calculator
// ============================================================================

class CostCalculator {
  calculateCost(analysis: TokenAnalysis): CostEstimate {
    const pricing = this.getPricing(analysis.model.name)
    
    const inputCost = (analysis.inputTokens / 1_000_000) * pricing.input
    const outputCost = (analysis.outputTokens / 1_000_000) * pricing.output
    const cacheReadCost = (analysis.cacheReadTokens / 1_000_000) * (pricing.cacheRead ?? 0)
    const cacheWriteCost = (analysis.cacheWriteTokens / 1_000_000) * (pricing.cacheWrite ?? 0)
    const cacheCost = cacheReadCost + cacheWriteCost
    
    return {
      inputCost,
      outputCost,
      cacheCost,
      totalCost: inputCost + outputCost + cacheCost,
      pricePerMillionInput: pricing.input,
      pricePerMillionOutput: pricing.output,
      pricePerMillionCacheRead: pricing.cacheRead ?? 0,
      pricePerMillionCacheWrite: pricing.cacheWrite ?? 0,
    }
  }
  
  private getPricing(modelName: string): { input: number; output: number; cacheRead?: number; cacheWrite?: number } {
    // Try exact match
    if (MODEL_PRICING[modelName]) {
      return MODEL_PRICING[modelName]
    }
    
    // Try prefix matching for model families
    const lowerModel = modelName.toLowerCase()
    
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (lowerModel.startsWith(key.toLowerCase())) {
        return pricing
      }
    }
    
    // Fallback to default
    return MODEL_PRICING["default"]
  }
}

// ============================================================================
// Output Formatter
// ============================================================================

class OutputFormatter {
  private readonly BAR_WIDTH = 30
  private readonly TOKEN_SPACING = 11
  private readonly CATEGORY_LABEL_WIDTH = 9
  private readonly TOOL_LABEL_WIDTH = 20
  private readonly TOP_CONTRIBUTOR_LABEL_WIDTH = 30

  constructor(private costCalculator: CostCalculator) {}

  /**
   * Formats a category bar for visual token display
   * @param label - Category label (e.g., "SYSTEM", "USER")
   * @param tokens - Number of tokens for this category
   * @param total - Total tokens for percentage calculation
   * @param labelWidth - Width to pad the label to (default: CATEGORY_LABEL_WIDTH)
   * @returns Formatted bar string or empty string if tokens is 0
   */
  private formatCategoryBar(
    label: string,
    tokens: number,
    total: number,
    labelWidth: number = this.CATEGORY_LABEL_WIDTH
  ): string {
    if (tokens === 0) return ""

    const percentage = total > 0 ? ((tokens / total) * 100).toFixed(1) : "0.0"
    const percentageNum = parseFloat(percentage)
    const barWidth = Math.round((percentageNum / 100) * this.BAR_WIDTH)
    const bar = "█".repeat(barWidth) + "░".repeat(Math.max(0, this.BAR_WIDTH - barWidth))
    const labelPadded = label.padEnd(labelWidth)
    const formattedTokens = this.formatNumber(tokens)

    let pct = percentage
    if (percentageNum < 10) {
      pct = " " + pct
    }

    const tokensPart = `(${formattedTokens})`
    const spacesNeeded = Math.max(1, this.TOKEN_SPACING - tokensPart.length)
    const spacing = " ".repeat(spacesNeeded)

    return `${labelPadded} ${bar} ${spacing}${pct}% ${tokensPart}`
  }

  format(analysis: TokenAnalysis): string {
    const inputCategories = [
      { label: "SYSTEM", tokens: analysis.categories.system.totalTokens },
      { label: "USER", tokens: analysis.categories.user.totalTokens },
      { label: "TOOLS", tokens: analysis.categories.tools.totalTokens },
    ]

    const outputCategories = [
      { label: "ASSISTANT", tokens: analysis.categories.assistant.totalTokens },
      { label: "REASONING", tokens: analysis.categories.reasoning.totalTokens },
    ]

    const topEntries = this.collectTopEntries(analysis, 5)
    
    // Merge tool output tokens with call counts
    const toolStats = new Map<string, { tokens: number; calls: number }>()
    
    // Add all tools that were called
    for (const [toolName, calls] of analysis.toolCallCounts.entries()) {
      toolStats.set(toolName, { tokens: 0, calls })
    }
    
    // Add token counts from tool outputs
    for (const entry of analysis.categories.tools.allEntries) {
      const existing = toolStats.get(entry.label) || { tokens: 0, calls: 0 }
      toolStats.set(entry.label, { ...existing, tokens: entry.tokens })
    }
    
    const toolEntries = Array.from(toolStats.entries())
      .map(([label, stats]) => ({ label, tokens: stats.tokens, calls: stats.calls }))
      .sort((a, b) => b.tokens - a.tokens)

    const costEstimate = this.costCalculator.calculateCost(analysis)

    return this.formatVisualOutput(
      analysis.sessionID,
      analysis.model.name,
      analysis.totalTokens,
      analysis.inputTokens,
      analysis.outputTokens,
      analysis.cacheReadTokens,
      analysis.cacheWriteTokens,
      inputCategories,
      outputCategories,
      topEntries,
      toolEntries,
      costEstimate
    )
  }

  private formatVisualOutput(
    sessionID: string,
    modelName: string,
    totalTokens: number,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number,
    inputCategories: Array<{ label: string; tokens: number }>,
    outputCategories: Array<{ label: string; tokens: number }>,
    topEntries: CategoryEntry[],
    toolEntries: Array<{ label: string; tokens: number; calls: number }>,
    cost: CostEstimate
  ): string {
    const lines: string[] = []

    lines.push(`═══════════════════════════════════════════════════════════════════════════`)
    lines.push(`Token Analysis: Session ${sessionID}`)
    lines.push(`Model: ${modelName}`)
    lines.push(`═══════════════════════════════════════════════════════════════════════════`)
    lines.push(``)

    // INPUT TOKENS Section
    const inputTotal = inputCategories.reduce((sum, cat) => sum + cat.tokens, 0)
    lines.push(`📥 INPUT TOKENS (Context sent to model)`)
    lines.push(`─────────────────────────────────────────────────────────────────────────`)

    for (const category of inputCategories) {
      const barLine = this.formatCategoryBar(category.label, category.tokens, inputTotal)
      if (barLine) {
        lines.push(barLine)
      }
    }

    if (cacheReadTokens > 0 || cacheWriteTokens > 0) {
      lines.push(``)
      if (cacheReadTokens > 0) {
        lines.push(`  Cache Read:  ${this.formatNumber(cacheReadTokens)} tokens`)
      }
      if (cacheWriteTokens > 0) {
        lines.push(`  Cache Write: ${this.formatNumber(cacheWriteTokens)} tokens`)
      }
    }

    lines.push(``)
    lines.push(`Subtotal: ${this.formatNumber(inputTotal)} input tokens`)
    lines.push(``)

    // OUTPUT TOKENS Section
    const outputTotal = outputCategories.reduce((sum, cat) => sum + cat.tokens, 0)
    lines.push(`📤 OUTPUT TOKENS (Generated by model)`)
    lines.push(`─────────────────────────────────────────────────────────────────────────`)

    for (const category of outputCategories) {
      const barLine = this.formatCategoryBar(category.label, category.tokens, outputTotal)
      if (barLine) {
        lines.push(barLine)
      }
    }

    lines.push(``)
    lines.push(`Subtotal: ${this.formatNumber(outputTotal)} output tokens`)
    lines.push(``)

    // Total
    lines.push(`═══════════════════════════════════════════════════════════════════════════`)
    lines.push(`TOTAL: ${this.formatNumber(totalTokens)} tokens`)
    lines.push(`═══════════════════════════════════════════════════════════════════════════`)

    // Cost Estimation
    lines.push(``)
    lines.push(`💰 COST ESTIMATION`)
    lines.push(`─────────────────────────────────────────────────────────────────────────`)
    lines.push(`Input tokens:    ${this.formatNumber(inputTokens).padStart(10)} × $${cost.pricePerMillionInput.toFixed(2)}/M  = $${cost.inputCost.toFixed(4)}`)
    lines.push(`Output tokens:   ${this.formatNumber(outputTokens).padStart(10)} × $${cost.pricePerMillionOutput.toFixed(2)}/M  = $${cost.outputCost.toFixed(4)}`)
    
    if (cost.cacheCost > 0) {
      if (cacheReadTokens > 0) {
        const cacheReadCost = (cacheReadTokens / 1_000_000) * cost.pricePerMillionCacheRead
        lines.push(`Cache read:      ${this.formatNumber(cacheReadTokens).padStart(10)} × $${cost.pricePerMillionCacheRead.toFixed(2)}/M  = $${cacheReadCost.toFixed(4)}`)
      }
      if (cacheWriteTokens > 0) {
        const cacheWriteCost = (cacheWriteTokens / 1_000_000) * cost.pricePerMillionCacheWrite
        lines.push(`Cache write:     ${this.formatNumber(cacheWriteTokens).padStart(10)} × $${cost.pricePerMillionCacheWrite.toFixed(2)}/M  = $${cacheWriteCost.toFixed(4)}`)
      }
      lines.push(`─────────────────────────────────────────────────────────────────────────`)
      lines.push(`TOTAL COST: $${cost.totalCost.toFixed(4)}`)
    } else {
      lines.push(`─────────────────────────────────────────────────────────────────────────`)
      lines.push(`TOTAL COST: $${cost.totalCost.toFixed(4)}`)
    }

    // Tool Usage Breakdown
    if (toolEntries.length > 0) {
      const toolsTotalTokens = inputCategories.find(c => c.label === "TOOLS")?.tokens || 0
      
      lines.push(``)
      lines.push(`🔧 TOOL USAGE BREAKDOWN`)
      lines.push(`─────────────────────────────────────────────────────────────────────────`)

      for (const tool of toolEntries) {
        const barLine = this.formatCategoryBar(tool.label, tool.tokens, toolsTotalTokens, this.TOOL_LABEL_WIDTH)
        if (barLine) {
          const calls = `${tool.calls}x`.padStart(5)
          lines.push(`${barLine} ${calls}`)
        }
      }
    }

    // Top Contributors
    if (topEntries.length > 0) {
      lines.push(``)
      lines.push(`⭐ TOP CONTRIBUTORS`)
      lines.push(`─────────────────────────────────────────────────────────────────────────`)

      for (const entry of topEntries) {
        const percentage = ((entry.tokens / totalTokens) * 100).toFixed(1)
        const label = `• ${entry.label}`.padEnd(this.TOP_CONTRIBUTOR_LABEL_WIDTH)
        const formattedTokens = this.formatNumber(entry.tokens)
        const tokens = `${formattedTokens} tokens (${percentage}%)`
        lines.push(`${label} ${tokens}`)
      }
    }

    lines.push(``)
    lines.push(`═══════════════════════════════════════════════════════════════════════════`)

    return lines.join("\n")
  }

  private collectTopEntries(analysis: TokenAnalysis, limit: number): CategoryEntry[] {
    const pool = [
      ...analysis.categories.system.allEntries,
      ...analysis.categories.user.allEntries,
      ...analysis.categories.assistant.allEntries,
      ...analysis.categories.tools.allEntries,
      ...analysis.categories.reasoning.allEntries,
    ]
      .filter((entry) => entry.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)

    return pool.slice(0, limit)
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat("en-US").format(value)
  }
}

// ============================================================================
// Plugin Export
// ============================================================================

export const TokenAnalyzerPlugin: Plugin = async ({ client }) => {
  const tokenizerManager = new TokenizerManager()
  const modelResolver = new ModelResolver()
  const contentCollector = new ContentCollector()
  const analysisEngine = new TokenAnalysisEngine(tokenizerManager, contentCollector)
  const costCalculator = new CostCalculator()
  const formatter = new OutputFormatter(costCalculator)

  return {
    tool: {
      token_usage: tool({
        description:
          "Analyze token usage across the current session with detailed breakdowns by category (system, user, assistant, tools, reasoning). " +
          "Provides visual charts and identifies top token consumers.",
        args: {
          sessionID: tool.schema.string().optional(),
          limitMessages: tool.schema.number().int().min(1).max(10).optional(),
        },
        async execute(args, context) {
          const sessionID = args.sessionID ?? context.sessionID
          if (!sessionID) {
            throw new Error("No session ID available for token analysis")
          }

          const response = await client.session.messages({ path: { id: sessionID } })
          const messages: SessionMessage[] = ((response as any)?.data ?? response ?? []) as SessionMessage[]

          if (!Array.isArray(messages) || messages.length === 0) {
            return `Session ${sessionID} has no messages yet.`
          }

          const tokenModel = modelResolver.resolveTokenModel(messages)
          const analysis = await analysisEngine.analyze(
            sessionID,
            messages,
            tokenModel,
            args.limitMessages ?? DEFAULT_ENTRY_LIMIT
          )

          const output = formatter.format(analysis)
          // Write output to file
          const outputPath = path.join(process.cwd(), 'token-usage-output.txt')
          await fs.writeFile(outputPath, output, 'utf8')

          // Return short message telling user to read the file
          return `Token analysis complete! Full report saved to: ${outputPath}\n\nUse: cat token-usage-output.txt (or read the file) to view the complete analysis.`
        },
      }),
    },
  }
}
