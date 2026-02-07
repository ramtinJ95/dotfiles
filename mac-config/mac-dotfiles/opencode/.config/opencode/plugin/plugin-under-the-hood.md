# Token Analyzer Plugin: Under the Hood 🔍

**An Educational Guide for Junior Software Engineers**

Welcome! This document will walk you through the entire Token Analyzer plugin codebase, explaining how it works, why it's structured the way it is, and how you can modify it for your own needs.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Architecture & Design Patterns](#architecture--design-patterns)
3. [Deep Dive: Type System](#deep-dive-type-system)
4. [Deep Dive: Each Class](#deep-dive-each-class)
5. [Data Flow: From Start to Finish](#data-flow-from-start-to-finish)
6. [How to Add New Features](#how-to-add-new-features)
7. [Common Pitfalls & Best Practices](#common-pitfalls--best-practices)

---

## High-Level Overview

### What Does This Plugin Do?

The Token Analyzer plugin analyzes how many tokens are used in an OpenCode AI session. It:

1. **Collects** all messages from a session (user messages, assistant responses, tool outputs, etc.)
2. **Counts** tokens for each type of content using actual tokenizers
3. **Categorizes** tokens into meaningful groups (SYSTEM, USER, ASSISTANT, TOOLS, REASONING)
4. **Calculates** the cost of the session based on the model used
5. **Formats** everything into a beautiful visual report

### Why Does This Matter?

Understanding token usage is crucial because:
- AI models charge based on tokens (not characters!)
- Different types of tokens cost different amounts (input vs output)
- Cache usage can significantly reduce costs
- Identifying token-heavy operations helps optimize performance

### The Big Picture

```
User runs /tokens command
         ↓
Plugin fetches session messages
         ↓
Determine which model/tokenizer to use
         ↓
Extract content from messages (system prompts, user text, tool outputs, etc.)
         ↓
Count tokens for each piece of content
         ↓
Adjust counts based on actual API telemetry
         ↓
Calculate costs
         ↓
Format beautiful report
         ↓
Save to file
```

---

## Architecture & Design Patterns

### Design Principle: Separation of Concerns

The plugin follows a **modular class-based architecture** where each class has ONE specific job:

| Class | Responsibility | Analogy |
|-------|---------------|---------|
| `TokenizerManager` | Loads and manages tokenizers | A librarian who fetches the right dictionary |
| `ModelResolver` | Figures out which tokenizer to use | A detective identifying what tool we need |
| `ContentCollector` | Extracts content from messages | A sorter organizing mail by type |
| `TokenAnalysisEngine` | Orchestrates the counting process | A project manager coordinating teams |
| `CostCalculator` | Calculates costs | An accountant running the numbers |
| `OutputFormatter` | Creates the visual report | A graphic designer making it pretty |

### Why This Structure?

✅ **Testability**: Each class can be tested independently  
✅ **Maintainability**: Bug in formatting? Only touch `OutputFormatter`  
✅ **Extensibility**: Want to add a new tokenizer? Only modify `TokenizerManager`  
✅ **Readability**: Clear names make it obvious what each part does

### Design Pattern: Dependency Injection

Look at the plugin initialization (lines 1088-1094):

```typescript
const tokenizerManager = new TokenizerManager()
const modelResolver = new ModelResolver()
const contentCollector = new ContentCollector()
const analysisEngine = new TokenAnalysisEngine(tokenizerManager, contentCollector)
const costCalculator = new CostCalculator()
const formatter = new OutputFormatter(costCalculator)
```

Notice how `TokenAnalysisEngine` receives `tokenizerManager` and `contentCollector` in its constructor? This is **dependency injection**. 

**Why?**
- Classes don't create their own dependencies (tightly coupled ❌)
- Dependencies are "injected" from outside (loosely coupled ✅)
- Makes testing easier (you can inject mock objects)

---

## Deep Dive: Type System

### Understanding TypeScript Types

Types are like contracts - they define what shape data must have. Let's break down the key types:

#### 1. SessionMessage (lines 15-18)

```typescript
interface SessionMessage {
  info: SessionMessageInfo
  parts: SessionMessagePart[]
}
```

**What is it?** A single message in an AI conversation.

**Structure:**
- `info`: Metadata about the message (who sent it, which model, token counts)
- `parts`: The actual content (could be text, reasoning, tool calls)

**Real-world analogy:** An email where `info` is the header (from, to, subject) and `parts` is the body (which could have text, attachments, etc.)

#### 2. SessionMessagePart (lines 39-43)

```typescript
type SessionMessagePart =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; state: ToolState }
  | { type: string; [key: string]: unknown }
```

**What is it?** A discriminated union type - one of several possible shapes.

**Key concept: Discriminated Union**
The `type` field is the "discriminator". It tells us which shape we have:
- If `type === "text"`, it MUST have a `text` field
- If `type === "tool"`, it MUST have a `tool` and `state` field

**Why the last option?** The catch-all `{ type: string; [key: string]: unknown }` handles any unknown types gracefully.

#### 3. Type Guards (lines 46-56)

```typescript
function isToolPart(part: SessionMessagePart): part is { type: "tool"; tool: string; state: ToolState } {
  return part.type === "tool"
}
```

**What is this magic?** A type guard that narrows the type.

**Before type guard:**
```typescript
if (part.type === "tool") {
  // TypeScript doesn't know part.tool exists yet
  const toolName = part.tool // ❌ Error!
}
```

**After type guard:**
```typescript
if (isToolPart(part)) {
  // TypeScript KNOWS it's a tool part now
  const toolName = part.tool // ✅ Works!
}
```

**The key:** `part is { type: "tool"; ... }` tells TypeScript: "If this function returns true, narrow the type to this specific shape."

#### 4. TokenizerSpec (lines 99-102)

```typescript
type TokenizerSpec = 
  | { kind: "tiktoken"; model: string }
  | { kind: "transformers"; hub: string }
  | { kind: "approx" }
```

**What is it?** Defines which tokenization strategy to use.

**Three strategies:**
1. **tiktoken**: OpenAI's tokenizer (needs model name like "gpt-4o")
2. **transformers**: Hugging Face tokenizer (needs hub ID like "Xenova/claude-tokenizer")
3. **approx**: Fallback approximation (divide characters by 4)

---

## Deep Dive: Each Class

### 1. TokenizerManager (lines 225-350)

**Purpose:** Manage tokenizer loading and token counting.

#### Key Concepts

**Caching:** 
```typescript
private tiktokenCache = new Map<string, any>()
private transformerCache = new Map<string, any>()
```

Why? Loading tokenizers is expensive (can take seconds). Once loaded, we cache them so subsequent calls are instant.

**Lazy Loading:**
```typescript
private tiktokenModule?: Promise<any>
```

The tokenizer modules aren't loaded until needed. The `?` means it starts as `undefined`.

#### Main Method: `countTokens` (lines 231-247)

```typescript
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
```

**Flow:**
1. Check if content is empty (optimization - no work needed)
2. Use a switch on `model.spec.kind` to pick the right strategy
3. If anything goes wrong, fall back to approximation (defensive programming)

**Why async?** Loading tokenizers requires file I/O which is asynchronous.

#### importFromVendor (lines 333-349)

```typescript
private async importFromVendor(pkg: string) {
  const pkgJsonPath = path.join(VENDOR_ROOT, pkg, "package.json")
  let data: string
  try {
    data = await fs.readFile(pkgJsonPath, "utf8")
  } catch {
    throw new Error(
      `Token analyzer dependencies missing. Run the install.sh script...`
    )
  }

  const manifest = JSON.parse(data)
  const entry = manifest.module ?? manifest.main ?? "index.js"
  const entryPath = path.join(VENDOR_ROOT, pkg, entry)
  return import(pathToFileURL(entryPath).href)
}
```

**What's happening?**
1. Look for the package's `package.json` in vendor directory
2. If not found, throw helpful error message
3. Parse the JSON to find the entry point (could be `module`, `main`, or default to `index.js`)
4. Dynamically import the module

**Why dynamic import?** We only load tokenizers when needed, not at plugin startup.

**Why pathToFileURL?** ESM imports need URLs, not file paths.

---

### 2. ModelResolver (lines 356-425)

**Purpose:** Figure out which tokenizer to use based on model and provider information.

#### Main Method: `resolveTokenModel` (lines 357-370)

```typescript
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
```

**Strategy:**
1. Iterate through messages in **reverse** (most recent first)
2. Try to match as an OpenAI model
3. If not, try to match as a transformer model
4. If nothing matches, fall back to approximation

**Why reverse?** The most recent message has the most accurate model information.

**Why `[...messages]`?** `.reverse()` mutates the array. The spread operator creates a copy so we don't modify the original.

#### canonicalize (lines 422-424)

```typescript
private canonicalize(value?: string): string | undefined {
  return value?.split("/").pop()?.toLowerCase().trim()
}
```

**What does this do?**

```typescript
canonicalize("anthropic/claude-3.5-sonnet")  // → "claude-3.5-sonnet"
canonicalize("CLAUDE-OPUS-4")                // → "claude-opus-4"
canonicalize(undefined)                      // → undefined
```

**Why?**
- Handles provider-prefixed IDs like "anthropic/claude-3.5-sonnet"
- Normalizes case (so "GPT-4O" matches "gpt-4o")
- Optional chaining (`?.`) safely handles undefined values

---

### 3. ContentCollector (lines 431-586)

**Purpose:** Extract different types of content from messages.

#### collectSystemPrompts (lines 432-449)

```typescript
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
```

**Key insight:** Uses a `Map` to deduplicate prompts.

**Why?** System prompts are repeated in every assistant message. We only want to count each unique prompt once.

**Map as a Set trick:**
```typescript
prompts.set(trimmed, trimmed)
```
Both key and value are the same. This is effectively using Map as a Set for deduplication.

#### identifySystemPrompt (lines 540-580)

```typescript
private identifySystemPrompt(content: string, index: number): string {
  const lower = content.toLowerCase()

  // Specific identification patterns
  if (lower.includes("opencode") && lower.includes("cli") && content.length > 500) {
    return "System#MainPrompt"
  }
  if (lower.includes("opencode") && lower.includes("cli") && content.length <= 500) {
    return "System#ShortPrompt"
  }
  // ... more patterns
  
  // Fallback numbering
  return `System#${index}`
}
```

**What's this doing?** Pattern matching to give meaningful labels to system prompts.

**Why not just number them?** "System#MainPrompt" is way more useful than "System#1" in reports.

**How to add new patterns?** Just add another if statement:
```typescript
if (lower.includes("your-keyword") && lower.includes("another-keyword")) {
  return "System#YourCustomLabel"
}
```

#### collectToolCallCounts (lines 491-506)

```typescript
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
```

**Pattern:** Increment counter in a Map.

**The trick:**
```typescript
toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1)
```

If the tool doesn't exist in the Map yet, `get()` returns `undefined`. The `|| 0` provides a default value.

#### collectAllToolsCalled (lines 508-510)

```typescript
collectAllToolsCalled(messages: SessionMessage[]): string[] {
  return Array.from(this.collectToolCallCounts(messages).keys()).sort()
}
```

**DRY principle in action!** Instead of duplicating iteration logic, we reuse `collectToolCallCounts` and just extract the keys.

**Before refactoring:** This was 15+ lines of duplicated code.  
**After refactoring:** 1 line that's impossible to get wrong.

---

### 4. TokenAnalysisEngine (lines 592-789)

**Purpose:** Orchestrate the token counting process and adjust based on API telemetry.

#### Main Method: `analyze` (lines 598-637)

```typescript
async analyze(
  sessionID: string,
  messages: SessionMessage[],
  tokenModel: TokenModel,
  entryLimit: number
): Promise<TokenAnalysis> {
  // 1. Collect all content
  const systemPrompts = this.contentCollector.collectSystemPrompts(messages)
  const userTexts = this.contentCollector.collectMessageTexts(messages, "user")
  const assistantTexts = this.contentCollector.collectMessageTexts(messages, "assistant")
  const toolOutputs = this.contentCollector.collectToolOutputs(messages)
  const reasoningTraces = this.contentCollector.collectReasoningTexts(messages)
  const allToolsCalled = this.contentCollector.collectAllToolsCalled(messages)
  const toolCallCounts = this.contentCollector.collectToolCallCounts(messages)

  // 2. Count tokens in parallel
  const [system, user, assistant, tools, reasoning] = await Promise.all([
    this.buildCategory("system", systemPrompts, tokenModel, entryLimit),
    this.buildCategory("user", userTexts, tokenModel, entryLimit),
    this.buildCategory("assistant", assistantTexts, tokenModel, entryLimit),
    this.buildCategory("tools", toolOutputs, tokenModel, entryLimit),
    this.buildCategory("reasoning", reasoningTraces, tokenModel, entryLimit),
  ])

  // 3. Build initial analysis
  const analysis: TokenAnalysis = {
    sessionID,
    model: tokenModel,
    categories: { system, user, assistant, tools, reasoning },
    totalTokens: system.totalTokens + user.totalTokens + assistant.totalTokens + tools.totalTokens + reasoning.totalTokens,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    allToolsCalled,
    toolCallCounts,
  }

  // 4. Adjust based on actual API telemetry
  this.applyTelemetryAdjustments(analysis, messages)

  return analysis
}
```

**Key insight: Promise.all**

```typescript
await Promise.all([
  this.buildCategory("system", ...),
  this.buildCategory("user", ...),
  this.buildCategory("assistant", ...),
  this.buildCategory("tools", ...),
  this.buildCategory("reasoning", ...),
])
```

All five categories are counted **in parallel**, not sequentially. This is much faster!

**Sequential (slow):**
```
system   → 2 seconds
user     → 1 second
assistant → 1 second
tools    → 0.5 seconds
reasoning → 0.5 seconds
Total: 5 seconds
```

**Parallel (fast):**
```
All run simultaneously
Total: 2 seconds (the slowest one)
```

#### buildCategory (lines 639-659)

```typescript
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
```

**What's happening:**
1. Count tokens for each source
2. Filter out zero-token entries
3. Sort by token count (highest first)
4. Limit to top N entries for display
5. Keep all entries for later analysis

**Why keep both `entries` and `allEntries`?**
- `entries`: Top 3 for display (configurable via `entryLimit`)
- `allEntries`: All entries for accurate totals and top contributors

#### applyTelemetryAdjustments (lines 661-701)

This is the most complex method. Let's break it down:

```typescript
private applyTelemetryAdjustments(analysis: TokenAnalysis, messages: SessionMessage[]) {
  // 1. Find assistant messages with token data
  const assistantMessages = messages
    .filter((m) => m.info.role === "assistant" && m.info.tokens)
    .map((m) => ({ message: m, tokens: m.info.tokens! }))

  // 2. Get most recent message with non-zero usage
  const recentMessage = assistantMessages
    .reverse()
    .find((item) => this.hasNonZeroUsage(item.tokens)) 
    ?? assistantMessages[assistantMessages.length - 1]

  if (!recentMessage) return

  // 3. Extract actual token counts from API
  const tokens = recentMessage.tokens
  const inputTokens = Number(tokens.input) || 0
  const cacheReadTokens = Number(tokens.cache?.read) || 0
  const cacheWriteTokens = Number(tokens.cache?.write) || 0
  const promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens
  const assistantTokens = Number(tokens.output) || 0
  const reasoningTokens = Number(tokens.reasoning) || 0

  // 4. Calculate how many tokens we measured vs what the API says
  const promptMeasured =
    analysis.categories.system.totalTokens +
    analysis.categories.user.totalTokens +
    analysis.categories.tools.totalTokens

  // 5. Scale our counts to match API reality
  this.scalePromptCategories(analysis, promptTokens, promptMeasured)
  this.scaleCategory(analysis.categories.assistant, assistantTokens, "Assistant output")
  this.scaleCategory(analysis.categories.reasoning, reasoningTokens, "Reasoning")

  // 6. Store actual telemetry values
  analysis.inputTokens = inputTokens
  analysis.outputTokens = assistantTokens + reasoningTokens
  analysis.cacheReadTokens = cacheReadTokens
  analysis.cacheWriteTokens = cacheWriteTokens

  // 7. Recalculate total
  analysis.totalTokens =
    analysis.categories.system.totalTokens +
    analysis.categories.user.totalTokens +
    analysis.categories.assistant.totalTokens +
    analysis.categories.tools.totalTokens +
    analysis.categories.reasoning.totalTokens
}
```

**Why is this needed?**

The tokenizers we use locally might count slightly differently than the API. The API's count is the **source of truth** because that's what you get billed for.

**Strategy:**
1. Count tokens locally to understand the breakdown
2. Get actual counts from the API
3. Scale our breakdown proportionally to match the API totals

**Example:**

```
Local count:  System: 1000, User: 500, Tools: 500  = 2000 total
API says:     Input tokens = 2100

Scaling factor: 2100 / 2000 = 1.05

Scaled counts: System: 1050, User: 525, Tools: 525 = 2100 total
```

#### scalePromptCategories (lines 713-753)

This handles three edge cases:

**Case 1: API says 0 tokens**
```typescript
if (actual <= 0) {
  for (const category of categories) {
    category.totalTokens = 0
    for (const entry of category.entries) entry.tokens = 0
  }
  return
}
```
Set everything to zero.

**Case 2: We measured 0 but API says there are tokens**
```typescript
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
```
Split tokens evenly across categories.

**Case 3: Normal scaling**
```typescript
const factor = actual / measured
let accumulated = 0

for (const category of categories) {
  const scaled = this.scaleEntries(category.entries, factor)
  category.totalTokens = scaled
  accumulated += scaled
}

// Handle rounding errors
const diff = actual - accumulated
if (Math.abs(diff) > 1e-6 && categories.length) {
  categories[0].totalTokens += Math.round(diff)
  if (categories[0].entries.length) {
    categories[0].entries[0].tokens += Math.round(diff)
  }
}
```

Scale proportionally, then fix rounding errors by adding the difference to the first category.

---

### 5. CostCalculator (lines 795-835)

**Purpose:** Calculate costs based on token usage and model pricing.

#### calculateCost (lines 796-815)

```typescript
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
```

**Formula:** `(tokens / 1,000,000) * price_per_million`

**Example:**
```
10,000 input tokens on Claude Sonnet 4
= (10,000 / 1,000,000) * $3
= 0.01 * $3
= $0.03
```

**Why `?? 0`?** Some models don't support caching, so `cacheRead` might be undefined.

#### getPricing (lines 817-834)

```typescript
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
```

**Strategy:**
1. Try exact match: "claude-3.5-sonnet" → pricing
2. Try prefix match: "claude-3.5-sonnet-20241022" starts with "claude-3.5-sonnet" → pricing
3. Fallback: Use default pricing

**Why prefix matching?** Models often have date suffixes like "claude-3.5-sonnet-20241022" but we want to match the base model.

---

### 6. OutputFormatter (lines 841-1082)

**Purpose:** Create beautiful visual output.

#### Class Constants (lines 842-846)

```typescript
private readonly BAR_WIDTH = 30
private readonly TOKEN_SPACING = 11
private readonly CATEGORY_LABEL_WIDTH = 9
private readonly TOOL_LABEL_WIDTH = 20
private readonly TOP_CONTRIBUTOR_LABEL_WIDTH = 30
```

**Why constants?** Changing these values in one place updates the entire output format.

**Before (magic numbers):**
```typescript
const bar = "█".repeat(30)  // What does 30 mean?
const label = text.padEnd(9)  // Why 9?
```

**After (named constants):**
```typescript
const bar = "█".repeat(this.BAR_WIDTH)  // Ah, it's the bar width!
const label = text.padEnd(this.CATEGORY_LABEL_WIDTH)  // Label width!
```

#### formatCategoryBar (lines 858-883)

This is the **key refactoring** that eliminated 50+ lines of duplicate code.

```typescript
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
```

**How the bar works:**

```
Input: label="SYSTEM", tokens=1000, total=2000
Percentage: 50%
Bar width: 50% of 30 = 15 characters
Bar: "███████████████░░░░░░░░░░░░░░░"
      ^15 filled    ^15 empty
Output: "SYSTEM    ███████████████░░░░░░░░░░░░░░░      50.0% (1,000)"
```

**Why the spacing math?**
```typescript
const tokensPart = `(${formattedTokens})`
const spacesNeeded = Math.max(1, this.TOKEN_SPACING - tokensPart.length)
```

This ensures alignment:
```
SYSTEM    █████  50.0% (1,000)   ← tokensPart is 7 chars, need 4 spaces
USER      █████  50.0%   (500)   ← tokensPart is 5 chars, need 6 spaces
```

#### format (lines 885-933)

This is the main entry point that builds the full report.

**Structure:**
```typescript
format(analysis: TokenAnalysis): string {
  // 1. Prepare data
  const inputCategories = [...]
  const outputCategories = [...]
  const topEntries = this.collectTopEntries(analysis, 5)
  const toolStats = ... // merge tool tokens with call counts
  const costEstimate = this.costCalculator.calculateCost(analysis)

  // 2. Delegate to formatting method
  return this.formatVisualOutput(
    sessionID,
    modelName,
    totalTokens,
    // ... all the data
  )
}
```

**Separation of concerns:**
- `format()`: Prepares data
- `formatVisualOutput()`: Creates visual output

#### formatVisualOutput (lines 935-1063)

This is where the report actually gets built. It's a long method, but it's straightforward - just building strings line by line.

**Pattern:**
```typescript
const lines: string[] = []

lines.push(`═══════════════════════════════════════════════════════════════════════════`)
lines.push(`Token Analysis: Session ${sessionID}`)
// ... more lines

return lines.join("\n")
```

**Why an array?** More efficient than string concatenation:

```typescript
// ❌ Slow - creates new string each time
let output = ""
output += "line 1\n"
output += "line 2\n"
output += "line 3\n"

// ✅ Fast - array operations are cheap
const lines = []
lines.push("line 1")
lines.push("line 2")
lines.push("line 3")
const output = lines.join("\n")
```

---

## Data Flow: From Start to Finish

Let's trace what happens when a user runs `/tokens`:

### Step 1: Plugin Initialization (lines 1088-1094)

```typescript
export const TokenAnalyzerPlugin: Plugin = async ({ client }) => {
  const tokenizerManager = new TokenizerManager()
  const modelResolver = new ModelResolver()
  const contentCollector = new ContentCollector()
  const analysisEngine = new TokenAnalysisEngine(tokenizerManager, contentCollector)
  const costCalculator = new CostCalculator()
  const formatter = new OutputFormatter(costCalculator)
```

All classes are instantiated and wired together.

### Step 2: Tool Execution (lines 1106-1134)

```typescript
async execute(args, context) {
  // 2.1: Get session ID
  const sessionID = args.sessionID ?? context.sessionID
  if (!sessionID) {
    throw new Error("No session ID available for token analysis")
  }

  // 2.2: Fetch messages from API
  const response = await client.session.messages({ path: { id: sessionID } })
  const messages: SessionMessage[] = ((response as any)?.data ?? response ?? []) as SessionMessage[]

  if (!Array.isArray(messages) || messages.length === 0) {
    return `Session ${sessionID} has no messages yet.`
  }

  // 2.3: Determine tokenizer model
  const tokenModel = modelResolver.resolveTokenModel(messages)
  
  // 2.4: Run analysis
  const analysis = await analysisEngine.analyze(
    sessionID,
    messages,
    tokenModel,
    args.limitMessages ?? DEFAULT_ENTRY_LIMIT
  )

  // 2.5: Format output
  const output = formatter.format(analysis)
  
  // 2.6: Write to file
  const outputPath = path.join(process.cwd(), 'token-usage-output.txt')
  await fs.writeFile(outputPath, output, 'utf8')

  // 2.7: Return message to user
  return `Token analysis complete! Full report saved to: ${outputPath}...`
}
```

### Step 3: Analysis Deep Dive

When `analysisEngine.analyze()` runs:

```
1. ContentCollector extracts all content
   ├─ System prompts from assistant messages
   ├─ User text from user messages
   ├─ Assistant text from assistant messages
   ├─ Tool outputs from completed tool calls
   └─ Reasoning traces from reasoning parts

2. TokenizerManager counts tokens
   ├─ Load appropriate tokenizer (cached after first use)
   ├─ Count tokens for each piece of content
   └─ Build CategorySummary for each category

3. Telemetry adjustment
   ├─ Extract actual token counts from API response
   ├─ Calculate scaling factors
   └─ Adjust our counts to match API reality

4. Return TokenAnalysis object
```

### Step 4: Formatting

When `formatter.format()` runs:

```
1. Prepare data structures
   ├─ Group into input/output categories
   ├─ Calculate top contributors
   ├─ Merge tool stats
   └─ Calculate costs

2. Build visual output
   ├─ Header with session ID and model
   ├─ Input tokens section with bars
   ├─ Output tokens section with bars
   ├─ Total and cost estimation
   ├─ Tool usage breakdown
   └─ Top contributors

3. Return formatted string
```

---

## How to Add New Features

### Example 1: Add Support for a New Model

**Scenario:** You want to add support for "gemini-pro-2".

**Step 1:** Add pricing (lines 125-163)

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  // ... existing entries
  "gemini-pro-2": { input: 1.25, output: 5 },  // ← Add this
}
```

**Step 2:** Add tokenizer mapping (lines 184-211)

```typescript
const TRANSFORMERS_MODEL_MAP: Record<string, string> = {
  // ... existing entries
  "gemini-pro-2": "google/gemma-2-9b-it",  // ← Add this
}
```

**Done!** The plugin will now recognize and properly handle "gemini-pro-2".

### Example 2: Add a New Category

**Scenario:** You want to track image tokens separately.

**Step 1:** Update TokenAnalysis interface (lines 75-92)

```typescript
interface TokenAnalysis {
  // ... existing fields
  categories: {
    system: CategorySummary
    user: CategorySummary
    assistant: CategorySummary
    tools: CategorySummary
    reasoning: CategorySummary
    images: CategorySummary  // ← Add this
  }
}
```

**Step 2:** Add collection method to ContentCollector

```typescript
collectImages(messages: SessionMessage[]): CategoryEntrySource[] {
  const results: CategoryEntrySource[] = []
  let index = 0

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "image") continue  // Assuming there's an image type

      index += 1
      // Approximate tokens: images are typically ~85 tokens per tile
      const estimatedTokens = "1000"  // Replace with actual calculation
      results.push({ 
        label: `Image#${index}`, 
        content: estimatedTokens 
      })
    }
  }

  return results
}
```

**Step 3:** Update TokenAnalysisEngine.analyze() (lines 598-637)

```typescript
async analyze(...): Promise<TokenAnalysis> {
  // ... existing collection code
  const images = this.contentCollector.collectImages(messages)

  const [system, user, assistant, tools, reasoning, images] = await Promise.all([
    // ... existing buildCategory calls
    this.buildCategory("images", images, tokenModel, entryLimit),
  ])

  const analysis: TokenAnalysis = {
    // ... existing fields
    categories: { system, user, assistant, tools, reasoning, images },
    totalTokens: system.totalTokens + user.totalTokens + assistant.totalTokens + 
                 tools.totalTokens + reasoning.totalTokens + images.totalTokens,
  }
}
```

**Step 4:** Update OutputFormatter to display the new category

```typescript
format(analysis: TokenAnalysis): string {
  const inputCategories = [
    { label: "SYSTEM", tokens: analysis.categories.system.totalTokens },
    { label: "USER", tokens: analysis.categories.user.totalTokens },
    { label: "TOOLS", tokens: analysis.categories.tools.totalTokens },
    { label: "IMAGES", tokens: analysis.categories.images.totalTokens },  // ← Add this
  ]
  // ... rest of the method
}
```

### Example 3: Add JSON Export

**Scenario:** You want to export the analysis as JSON in addition to the text report.

**Step 1:** Add new method to OutputFormatter

```typescript
formatJSON(analysis: TokenAnalysis): string {
  return JSON.stringify({
    sessionID: analysis.sessionID,
    model: analysis.model.name,
    totalTokens: analysis.totalTokens,
    categories: {
      system: {
        tokens: analysis.categories.system.totalTokens,
        entries: analysis.categories.system.allEntries,
      },
      user: {
        tokens: analysis.categories.user.totalTokens,
        entries: analysis.categories.user.allEntries,
      },
      assistant: {
        tokens: analysis.categories.assistant.totalTokens,
        entries: analysis.categories.assistant.allEntries,
      },
      tools: {
        tokens: analysis.categories.tools.totalTokens,
        entries: analysis.categories.tools.allEntries,
      },
      reasoning: {
        tokens: analysis.categories.reasoning.totalTokens,
        entries: analysis.categories.reasoning.allEntries,
      },
    },
    costs: this.costCalculator.calculateCost(analysis),
  }, null, 2)
}
```

**Step 2:** Update tool execution to write both formats

```typescript
async execute(args, context) {
  // ... existing code
  
  const textOutput = formatter.format(analysis)
  const jsonOutput = formatter.formatJSON(analysis)
  
  const textPath = path.join(process.cwd(), 'token-usage-output.txt')
  const jsonPath = path.join(process.cwd(), 'token-usage-output.json')
  
  await Promise.all([
    fs.writeFile(textPath, textOutput, 'utf8'),
    fs.writeFile(jsonPath, jsonOutput, 'utf8'),
  ])

  return `Token analysis complete! Reports saved to:\n- ${textPath}\n- ${jsonPath}`
}
```

---

## Common Pitfalls & Best Practices

### Pitfall 1: Forgetting to Cache

**❌ Bad:**
```typescript
async countTokens(content: string, model: TokenModel): Promise<number> {
  const tokenizer = await loadTokenizer(model)  // Loads every time!
  return tokenizer.encode(content).length
}
```

**✅ Good:**
```typescript
async countTokens(content: string, model: TokenModel): Promise<number> {
  if (!this.cache.has(model.name)) {
    this.cache.set(model.name, await loadTokenizer(model))
  }
  const tokenizer = this.cache.get(model.name)
  return tokenizer.encode(content).length
}
```

### Pitfall 2: Not Handling Edge Cases

**❌ Bad:**
```typescript
const percentage = (tokens / total) * 100
```

What if `total` is 0? Division by zero!

**✅ Good:**
```typescript
const percentage = total > 0 ? ((tokens / total) * 100).toFixed(1) : "0.0"
```

### Pitfall 3: Mutating Arrays

**❌ Bad:**
```typescript
messages.reverse()  // Mutates the original array!
```

**✅ Good:**
```typescript
[...messages].reverse()  // Creates a copy first
```

### Pitfall 4: Not Using Type Guards

**❌ Bad:**
```typescript
if (part.type === "tool") {
  const toolName = (part as any).tool  // Loses type safety
}
```

**✅ Good:**
```typescript
if (isToolPart(part)) {
  const toolName = part.tool  // Type-safe!
}
```

### Pitfall 5: String Concatenation in Loops

**❌ Bad:**
```typescript
let output = ""
for (const line of lines) {
  output += line + "\n"  // Creates new string each iteration
}
```

**✅ Good:**
```typescript
const lines: string[] = []
for (const item of items) {
  lines.push(item)
}
const output = lines.join("\n")  // Single concatenation at the end
```

### Best Practice 1: Descriptive Variable Names

**❌ Bad:**
```typescript
const t = await tm.ct(c, m)
```

**✅ Good:**
```typescript
const tokens = await tokenizerManager.countTokens(content, model)
```

### Best Practice 2: Early Returns

**❌ Bad:**
```typescript
function process(data: string) {
  if (data) {
    if (data.length > 0) {
      if (validate(data)) {
        // deeply nested logic
      }
    }
  }
}
```

**✅ Good:**
```typescript
function process(data: string) {
  if (!data) return
  if (data.length === 0) return
  if (!validate(data)) return
  
  // logic at the top level
}
```

### Best Practice 3: Separate Data and Presentation

**❌ Bad:**
```typescript
class Analyzer {
  analyze() {
    const tokens = this.countTokens()
    console.log(`Tokens: ${tokens}`)  // Mixing concerns!
    return tokens
  }
}
```

**✅ Good:**
```typescript
class Analyzer {
  analyze() {
    const tokens = this.countTokens()
    return tokens  // Just return data
  }
}

// Formatting happens elsewhere
const tokens = analyzer.analyze()
console.log(`Tokens: ${tokens}`)
```

### Best Practice 4: Use Constants for Magic Numbers

**❌ Bad:**
```typescript
const bar = "█".repeat(30)
const spacing = 11
```

**✅ Good:**
```typescript
private readonly BAR_WIDTH = 30
private readonly TOKEN_SPACING = 11

const bar = "█".repeat(this.BAR_WIDTH)
const spacing = this.TOKEN_SPACING
```

### Best Practice 5: Document Complex Logic

**❌ Bad:**
```typescript
const factor = actual / measured
for (const cat of cats) {
  cat.tokens = Math.round(cat.tokens * factor)
}
```

**✅ Good:**
```typescript
// Scale our local counts to match API telemetry
// Example: Local = 1000, API = 1050 → factor = 1.05
const factor = actual / measured
for (const category of categories) {
  category.tokens = Math.round(category.tokens * factor)
}
```

---

## Testing Your Changes

### Manual Testing Checklist

When you modify the code, test these scenarios:

1. **Happy path:** Run `/tokens` in a normal session
2. **Empty session:** Run in a brand new session with no messages
3. **Multiple models:** Switch models mid-session
4. **Heavy tool usage:** Run multiple tools and verify counts
5. **Caching:** Run twice - second should be faster
6. **New model:** Add a new model and verify it's recognized
7. **Edge cases:** Very long messages, special characters, empty content

### Debugging Tips

**Enable console logging:**
```typescript
console.log('Debug:', { variable1, variable2 })
```

**Inspect intermediate results:**
```typescript
const analysis = await analysisEngine.analyze(...)
console.log('Analysis:', JSON.stringify(analysis, null, 2))
```

**Check tokenizer loading:**
```typescript
console.log('Loading tokenizer for model:', model.name)
console.log('Tokenizer spec:', model.spec)
```

---

## Glossary

**Token:** A unit of text that AI models process. Could be a word, part of a word, or punctuation.

**Tokenizer:** A tool that converts text into tokens. Different models use different tokenizers.

**Discriminated Union:** A TypeScript type that can be one of several shapes, distinguished by a common field.

**Type Guard:** A function that narrows a type based on runtime checks.

**Dependency Injection:** Passing dependencies to a class instead of creating them inside the class.

**Caching:** Storing computed results to avoid recomputing them.

**Lazy Loading:** Only loading resources when they're actually needed.

**Telemetry:** Usage data reported by the API.

**Promise.all:** Run multiple async operations in parallel.

**Defensive Programming:** Writing code that handles unexpected situations gracefully.

---

## Next Steps

Now that you understand how the plugin works:

1. **Read the code** - Open `token-analyzer.ts` and read through it with this guide
2. **Make a small change** - Try adding a new model or modifying the output format
3. **Test it** - Run `/tokens` and verify your changes work
4. **Experiment** - Try adding the features suggested in "How to Add New Features"
5. **Share** - If you add something useful, consider contributing it back!

**Remember:** The best way to learn is by doing. Don't be afraid to break things - that's how you learn what works and what doesn't!

---

## Additional Resources

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/handbook/intro.html
- **OpenCode Plugin API:** Check the OpenCode documentation
- **js-tiktoken:** https://github.com/dqbd/tiktoken
- **Hugging Face Transformers:** https://huggingface.co/docs/transformers.js

---

**Happy coding! 🚀**
