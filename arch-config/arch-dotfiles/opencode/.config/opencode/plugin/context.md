# Token Analyzer Plugin - Developer Context

## Overview

A comprehensive OpenCode plugin that analyzes token usage across sessions, providing detailed breakdowns by category, cost estimation, and visual reports.

**Location**: `~/.config/opencode/plugin/token-analyzer.ts`

## Recent Updates (2025-11-10)

### Major Changes in This Session

1. **File Overwriting Fixed**: Added explicit file deletion and write flags to ensure `token-usage-output.txt` is properly overwritten on each run
2. **Dual Token Tracking**: Separated "Current Context" (TUI match) from "Session Total" (billing)
3. **System Prompt Inference**: Implemented inference from API telemetry since system prompts aren't exposed in session messages
4. **Most Recent Message Selection**: Fixed to use `.reverse().find()` with non-zero check instead of blind last-message approach
5. **Removed Scaling Logic**: Replaced proportional scaling with direct system token inference
6. **Cleaned Up Code**: Removed unused scaling methods (~88 lines)

### Key Architectural Decisions

#### Why Two Token Totals?

**Current Context (TUI Match)**:
- Uses **most recent API call** telemetry
- Matches what OpenCode TUI displays (~34K in testing)
- Shows what's in the current context window
- Expected to be ~2K less than TUI when `/tokens` is called (plugin analyzes before its own response)

**Session Total (Billing)**:
- Aggregates **all API calls** in the session
- Used for accurate cost calculation
- Shows cumulative token usage across all turns
- Much higher than current context (e.g., 492K session vs 34K current)

#### System Prompt Inference Problem

**The Issue**: OpenCode doesn't expose system prompts in `message.info.system` or as separate system role messages.

**Discovery Process**:
1. Initially tried collecting from `message.info.system` → always empty
2. Wrote debug output to `token-debug.json` to inspect message structure
3. Found that messages only have keys: `id, sessionID, role, time, parentID, modelID, providerID, mode, path, cost, tokens`
4. System prompts are sent to API but not returned in session messages

**Solution**: Infer system tokens from API telemetry:
```typescript
const recentApiInputTotal = mostRecentInput + mostRecentCacheRead
const localUserAndTools = userTokens + toolsTokens
const inferredSystemTokens = Math.max(0, recentApiInputTotal - localUserAndTools)
```

**Formula**: `System = (Input + CacheRead) - (User + Tools)`

This works because:
- API input includes system prompts + user messages + tool outputs
- We count user and tools locally
- The difference must be system prompts

#### Most Recent Message with Non-Zero Tokens

**The Problem**: Last message in array might have zero tokens (e.g., tool-only message, streaming incomplete).

**Wrong Approach** (what we had initially):
```typescript
for (const message of messages) {
  if (message.info.role === "assistant" && message.info.tokens) {
    // Keep overwriting mostRecent variables
    mostRecentInput = tokens.input
    // ... etc
  }
}
// End up with LAST message, even if it has zero tokens
```

**Correct Approach** (inspired by [IgorWarzocha/Opencode-Context-Analysis-Plugin](https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin)):
```typescript
const mostRecentWithUsage = [...assistants]
  .reverse()  // Most recent first
  .find(({ tokens }) => 
    (Number(tokens.input) || 0) +
    (Number(tokens.output) || 0) +
    (Number(tokens.reasoning) || 0) +
    (Number(tokens.cache?.read) || 0) +
    (Number(tokens.cache?.write) || 0) > 0
  ) ?? assistants[assistants.length - 1]  // Fallback to last
```

**Why this works**:
1. Reverse the array to start from most recent
2. Use `.find()` with explicit non-zero check
3. Returns first match working backward (most recent with tokens)
4. Fallback to last message if somehow all are zero

## Plugin Architecture

### Core Components

```
TokenizerManager
├─ Loads and caches tokenizers (tiktoken, transformers)
├─ Handles token counting with fallback to approximation
└─ Manages vendor dependencies from ./vendor/node_modules/

ModelResolver
├─ Detects model from session messages
├─ Maps model IDs to tokenizer specs
└─ Provides fallbacks (OpenAI → tiktoken, others → transformers, unknown → approx)

ContentCollector
├─ Collects user/assistant message texts
├─ Aggregates tool outputs by tool name
├─ Extracts reasoning traces
└─ Counts tool call occurrences
└─ NOTE: Does NOT collect system prompts (they're inferred from API telemetry)

TokenAnalysisEngine
├─ Orchestrates parallel token counting
├─ Builds CategorySummary for each category
├─ Applies telemetry adjustments (infers system tokens from API)
├─ Tracks both current context and session totals
└─ Returns comprehensive TokenAnalysis

CostCalculator
├─ Maps models to pricing (per 1M tokens)
├─ Calculates input/output/cache costs
└─ Returns detailed CostEstimate

OutputFormatter
├─ Creates visual ASCII bar charts
├─ Formats token counts (K/M notation)
├─ Separates "Current Context" from "Session Billing" displays
└─ Writes to token-usage-output.txt (with explicit overwrite)
```

### Data Flow

```
User: /tokens
    ↓
Command invokes tool
    ↓
Plugin tool executes with context.sessionID
    ↓
Fetch messages: client.session.messages({ path: { id: sessionID } })
    ↓
Resolve model: modelResolver.resolveTokenModel(messages)
    ↓
Analyze tokens: analysisEngine.analyze(sessionID, messages, tokenModel, limit)
    ├─ Collect content (user, assistant, tools, reasoning)
    ├─ Count tokens in parallel (Promise.all)
    ├─ Apply telemetry (aggregate all calls + find most recent with non-zero)
    ├─ Infer system tokens: (mostRecentInput + cacheRead) - (user + tools)
    └─ Return TokenAnalysis with both current and session totals
    ↓
Calculate costs: costCalculator.calculateCost(analysis)
    ↓
Format output: formatter.format(analysis)
    ├─ Current Context Window (TUI match)
    ├─ Session-Wide Billing (all API calls)
    ├─ Summary comparison
    ├─ Cost estimation
    └─ Tool usage breakdown
    ↓
Write to file: 
    ├─ Delete existing token-usage-output.txt
    └─ Write new file with { flag: 'w' }
    ↓
Return message to user
```

## Key Interfaces

### SessionMessage Structure

```typescript
interface SessionMessage {
  info: {
    id: string
    role: "user" | "assistant"  // NOTE: No "system" role in practice
    modelID?: string        // e.g., "claude-3.5-sonnet"
    providerID?: string     // e.g., "anthropic"
    // NOTE: system array is NOT present in actual messages
    tokens?: {
      input?: number        // Input tokens from API
      output?: number       // Output tokens from API
      reasoning?: number    // Reasoning tokens (o1, etc.)
      cache?: {
        read?: number       // Cache read tokens
        write?: number      // Cache write tokens
      }
    }
  }
  parts: Array<
    | { type: "text"; text: string; synthetic?: boolean }
    | { type: "reasoning"; text: string }
    | { type: "tool"; tool: string; state: ToolState }
  >
}

interface ToolState {
  status: "pending" | "running" | "completed" | "error"
  output?: string         // Tool output (can be very large)
}
```

**IMPORTANT**: Despite the OpenCode documentation suggesting `info.system?: string[]` exists, in practice it is **NOT present** in session messages. System prompts must be inferred from API telemetry.

### TokenAnalysis Structure

```typescript
interface TokenAnalysis {
  sessionID: string
  model: TokenModel
  categories: {
    system: CategorySummary      // System prompts (inferred from API)
    user: CategorySummary        // User messages
    assistant: CategorySummary   // Assistant responses
    tools: CategorySummary       // Tool outputs
    reasoning: CategorySummary   // Reasoning traces
  }
  totalTokens: number           // Current context total (for TUI match)
  
  // Session-wide aggregates (all API calls)
  inputTokens: number           // Sum of all input tokens
  outputTokens: number          // Sum of all output tokens
  cacheReadTokens: number       // Sum of all cache read
  cacheWriteTokens: number      // Sum of all cache write
  assistantMessageCount: number // Total API calls made
  
  // Most recent call (for TUI match)
  mostRecentInput: number       // Last call's input
  mostRecentOutput: number      // Last call's output
  mostRecentCacheRead: number   // Last call's cache read
  mostRecentCacheWrite: number  // Last call's cache write
  
  allToolsCalled: string[]      // Unique tool names sorted
  toolCallCounts: Map<string, number>  // Tool name → call count
}

interface CategorySummary {
  label: string
  totalTokens: number
  entries: CategoryEntry[]      // Top N entries (limited by entryLimit)
  allEntries: CategoryEntry[]   // All entries (for top contributors)
}
```

### TokenModel and Tokenizer Specs

```typescript
interface TokenModel {
  name: string              // Display name (e.g., "claude-3.5-sonnet")
  spec: TokenizerSpec       // How to count tokens
}

type TokenizerSpec = 
  | { kind: "tiktoken"; model: string }         // OpenAI models
  | { kind: "transformers"; hub: string }       // HuggingFace models
  | { kind: "approx" }                          // Fallback (chars / 4)
```

## Critical Implementation Details

### 1. Telemetry Extraction (Fixed in This Session)

**Current Implementation**:
```typescript
private applyTelemetryAdjustments(analysis: TokenAnalysis, messages: SessionMessage[]) {
  // Filter to assistant messages with tokens
  const assistants = messages
    .filter((m) => m.info.role === "assistant" && m.info?.tokens)
    .map((m) => ({ msg: m, tokens: m.info.tokens! }))

  // Aggregate across ALL calls (for billing)
  let totalInput = 0, totalOutput = 0, totalReasoning = 0
  let totalCacheRead = 0, totalCacheWrite = 0
  for (const { tokens } of assistants) {
    totalInput += Number(tokens.input) || 0
    totalOutput += Number(tokens.output) || 0
    totalReasoning += Number(tokens.reasoning) || 0
    totalCacheRead += Number(tokens.cache?.read) || 0
    totalCacheWrite += Number(tokens.cache?.write) || 0
  }

  // Find MOST RECENT message with non-zero usage (for TUI match)
  const mostRecentWithUsage = [...assistants]
    .reverse()
    .find(({ tokens }) => 
      (Number(tokens.input) || 0) +
      (Number(tokens.output) || 0) +
      (Number(tokens.reasoning) || 0) +
      (Number(tokens.cache?.read) || 0) +
      (Number(tokens.cache?.write) || 0) > 0
    ) ?? assistants[assistants.length - 1]

  // Extract most recent telemetry
  const t = mostRecentWithUsage?.tokens
  const mostRecentInput = Number(t?.input) || 0
  const mostRecentCacheRead = Number(t?.cache?.read) || 0
  // ... etc

  // Infer system tokens from most recent call
  const recentApiInputTotal = mostRecentInput + mostRecentCacheRead
  const localUserAndTools = analysis.categories.user.totalTokens + 
                            analysis.categories.tools.totalTokens
  const inferredSystemTokens = Math.max(0, recentApiInputTotal - localUserAndTools)
  
  if (inferredSystemTokens > 0 && analysis.categories.system.totalTokens === 0) {
    analysis.categories.system.totalTokens = inferredSystemTokens
    analysis.categories.system.entries = [{
      label: "System (inferred from API)",
      tokens: inferredSystemTokens
    }]
    analysis.categories.system.allEntries = analysis.categories.system.entries
  }

  // Recalculate total (current context)
  analysis.totalTokens =
    analysis.categories.system.totalTokens +
    analysis.categories.user.totalTokens +
    analysis.categories.assistant.totalTokens +
    analysis.categories.tools.totalTokens +
    analysis.categories.reasoning.totalTokens
}
```

**Key Points**:
1. **Two aggregations**: Session total (all calls) and most recent (TUI match)
2. **Reverse + find**: Critical for finding most recent with non-zero tokens
3. **System inference**: Only for current context, not session total
4. **Explicit non-zero check**: Prevents using incomplete/tool-only messages

### 2. File Writing (Fixed in This Session)

**Problem**: File wasn't being overwritten, showed stale data on subsequent calls.

**Solution**:
```typescript
// Write output to file (force overwrite)
const outputPath = path.join(process.cwd(), 'token-usage-output.txt')
try {
  // Delete existing file first
  try {
    await fs.unlink(outputPath)
  } catch {
    // File might not exist, which is fine
  }
  
  // Write with explicit overwrite flag
  await fs.writeFile(outputPath, output, { encoding: 'utf8', flag: 'w' })
} catch (error) {
  throw new Error(`Failed to write token analysis to ${outputPath}: ${error}`)
}
```

**Why this works**:
1. Explicit `fs.unlink()` ensures old file is removed
2. Flag `'w'` means "write, truncate if exists"
3. Error handling for both operations

### 3. Parallel Token Counting

Categories are counted in parallel for performance:

```typescript
const [system, user, assistant, tools, reasoning] = await Promise.all([
  this.buildCategory("system", systemPrompts, tokenModel, entryLimit),
  this.buildCategory("user", userTexts, tokenModel, entryLimit),
  this.buildCategory("assistant", assistantTexts, tokenModel, entryLimit),
  this.buildCategory("tools", toolOutputs, tokenModel, entryLimit),
  this.buildCategory("reasoning", reasoningTraces, tokenModel, entryLimit),
])
```

Note: System prompts collection returns empty array, but system tokens are inferred later from API telemetry.

### 4. Tokenizer Loading

**Tiktoken (OpenAI)**:
- Package: `js-tiktoken`
- Location: `./vendor/node_modules/js-tiktoken`
- API: `encodingForModel(model)` or `getEncoding("cl100k_base")`

**Transformers (Others)**:
- Package: `@huggingface/transformers`
- Location: `./vendor/node_modules/@huggingface/transformers`
- API: `AutoTokenizer.from_pretrained(hub)`

**Installation**: `./install.sh` runs:
```bash
npm install "js-tiktoken@latest" "@huggingface/transformers@^3.3.3" --prefix ./vendor
```

### 5. Model Resolution Priority

```
1. Check if providerID is OpenAI/Azure → use tiktoken
2. Check if modelID exact match in TRANSFORMERS_MODEL_MAP → use transformers
3. Check if providerID has default in PROVIDER_DEFAULTS → use provider default
4. Check if modelID starts with known prefix (claude, llama, mistral, deepseek) → use family default
5. Fallback to approximation (chars / 4)
```

### 6. Cost Calculation

Pricing is per 1 million tokens:

```typescript
const inputCost = (inputTokens / 1_000_000) * pricing.input
const outputCost = (outputTokens / 1_000_000) * pricing.output
const cacheReadCost = (cacheReadTokens / 1_000_000) * (pricing.cacheRead ?? 0)
const cacheWriteCost = (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite ?? 0)
```

**Pricing lookup**:
1. Try exact match: `MODEL_PRICING[modelName]`
2. Try prefix match: Check if model name starts with pricing key
3. Fallback: `MODEL_PRICING["default"]` = { input: 1, output: 3 }

**IMPORTANT**: Cost uses **session-wide aggregated totals**, not current context.

## Model Configurations

### OpenAI Model Map (lines 165-182)

Maps model IDs to tiktoken model names:

```typescript
"gpt-4o" → "gpt-4o"
"o1" → "gpt-4o"
"o3" → "gpt-4o"
"gpt-4" → "gpt-4"
"gpt-3.5-turbo" → "gpt-3.5-turbo"
```

### Transformers Model Map (lines 184-211)

Maps model IDs to HuggingFace tokenizer hubs:

```typescript
"claude-3.5-sonnet" → "Xenova/claude-tokenizer"
"llama-3.3" → "unsloth/Llama-3.3-70B-Instruct"
"deepseek-r1" → "deepseek-ai/DeepSeek-R1"
"mistral-large" → "Xenova/mistral-tokenizer-v3"
```

### Provider Defaults (lines 213-219)

Fallback tokenizers by provider:

```typescript
anthropic → "Xenova/claude-tokenizer"
meta → "Xenova/Meta-Llama-3.1-Tokenizer"
mistral → "Xenova/mistral-tokenizer-v3"
deepseek → "deepseek-ai/DeepSeek-V3"
google → "google/gemma-2-9b-it"
```

### Model Pricing (lines 125-163)

Prices per 1M tokens (input/output/cacheRead/cacheWrite):

```typescript
"claude-3.5-sonnet": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
"gpt-4o": { input: 2.5, output: 10 }
"deepseek-r1": { input: 0.55, output: 2.19 }
"default": { input: 1, output: 3 }
```

## Output Format (Updated)

### New Report Structure

```
═══════════════════════════════════════════════════════════════════════════
Token Analysis: Session abc123
Model: claude-3.5-sonnet
═══════════════════════════════════════════════════════════════════════════

📊 LOCAL TOKEN BREAKDOWN (Estimated from content analysis)
─────────────────────────────────────────────────────────────────────────

Input Categories:
  SYSTEM    ███████████████░░░░░░░░░░░░░░░    51.5% (16,963)
  USER      █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        2.3% (753)
  TOOLS     ██████████████░░░░░░░░░░░░░░░░    46.2% (15,202)

  Subtotal: 32,918 estimated input tokens

Output Categories:
  ASSISTANT ██████████████████████████████     100.0% (1,214)

  Subtotal: 1,214 estimated output tokens

Local Total: 34,132 tokens (estimated)

═══════════════════════════════════════════════════════════════════════════
📐 CURRENT CONTEXT WINDOW (Matches OpenCode TUI display)
─────────────────────────────────────────────────────────────────────────

Most recent API call telemetry:
  Input (fresh):              6 tokens
  Cache read:            32,912 tokens
  Output:                     2 tokens
  Total (API):           32,920 tokens

Context breakdown (estimated):
  System prompts:        16,963 tokens
  User messages:            753 tokens
  Tool outputs:          15,202 tokens
  Assistant msgs:         1,214 tokens
  Reasoning:                  0 tokens
  ───────────────────────────────────
  Current Context:       34,132 tokens

Note: System = (Input + Cache) - (User + Tools) = 32,918 - 15,955 = 16,963

This should closely match the OpenCode TUI header. Small differences (~2K) are
expected because the TUI updates after this analysis runs, including tokens
from the /tokens command itself.

═══════════════════════════════════════════════════════════════════════════
📡 SESSION-WIDE BILLING (All 26 API calls aggregated)
─────────────────────────────────────────────────────────────────────────

Total tokens processed across the entire session (for cost calculation):

  Input tokens:              96 (fresh tokens across all calls)
  Cache read:           490,200 (cached tokens across all calls)
  Cache write:          114,217 (tokens written to cache)
  Output tokens:          2,691 (all model responses)
  ───────────────────────────────────
  Session Total:        607,204 tokens (for billing)

═══════════════════════════════════════════════════════════════════════════
📊 SUMMARY
─────────────────────────────────────────────────────────────────────────

Current Context (TUI):           34,132 tokens
Session Total (Billing):        492,987 tokens
API Calls Made:              26

Note: "Current Context" shows tokens in the most recent API call context
(matching what OpenCode TUI displays). "Session Total" shows all tokens
processed across all API calls (for accurate cost calculation).

System prompts are inferred from API telemetry as they're not exposed
in the session messages API.

═══════════════════════════════════════════════════════════════════════════

💰 COST ESTIMATION (Based on API telemetry)
─────────────────────────────────────────────────────────────────────────
Input tokens:            96 × $3.00/M  = $0.0003
Output tokens:        2,691 × $15.00/M = $0.0404
Cache read:         490,200 × $0.30/M  = $0.1471
Cache write:        114,217 × $3.75/M  = $0.4283
─────────────────────────────────────────────────────────────────────────
TOTAL COST: $0.6160

🔧 TOOL USAGE BREAKDOWN
─────────────────────────────────────────────────────────────────────────
bash                 ████████████████████░░░░░░░░░░    65.8% (10,005)   11x
task                 ████████░░░░░░░░░░░░░░░░░░░░░░     26.9% (4,094)    1x
token_usage          ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░      7.3% (1,103)   12x

⭐ TOP CONTRIBUTORS
─────────────────────────────────────────────────────────────────────────
• System (inferred from API)   16,963 tokens (49.7%)
• bash                         10,005 tokens (29.3%)
• task                         4,094 tokens (12.0%)
• token_usage                  1,103 tokens (3.2%)
• Assistant#3                  720 tokens (2.1%)

═══════════════════════════════════════════════════════════════════════════
```

### Key Changes:
1. **Separated sections**: Local breakdown → Current context → Session billing → Summary
2. **Most recent telemetry shown**: Displays exact API numbers for latest call
3. **System calculation visible**: Shows the inference formula
4. **Clear explanations**: Notes explain expected ~2K TUI difference
5. **Two totals clearly labeled**: "Current Context (TUI)" vs "Session Total (Billing)"

### Bar Chart Logic

```typescript
const percentage = (tokens / total) * 100
const barWidth = Math.round((percentage / 100) * BAR_WIDTH)  // BAR_WIDTH = 30
const bar = "█".repeat(barWidth) + "░".repeat(BAR_WIDTH - barWidth)
```

Example: 50% → 15 filled, 15 empty → `███████████████░░░░░░░░░░░░░░░`

## File Locations

```
~/.config/opencode/
├── plugin/
│   ├── token-analyzer.ts        # Main plugin implementation (1,207 lines)
│   ├── install.sh               # Dependency installer
│   ├── README.md                # User documentation
│   ├── plugin-under-the-hood.md # Developer guide
│   ├── context.md               # This file
│   └── vendor/                  # Tokenizer dependencies
│       └── node_modules/
│           ├── js-tiktoken/
│           └── @huggingface/transformers/
├── command/
│   └── tokens.md                # /tokens command definition
└── opencode.json                # OpenCode configuration
```

**Output file**: `token-usage-output.txt` (written to current working directory, overwritten each run)

## Common Patterns

### Type Guards

```typescript
function isToolPart(part: SessionMessagePart): part is { type: "tool"; tool: string; state: ToolState } {
  return part.type === "tool"
}

if (isToolPart(part)) {
  // TypeScript knows part.tool and part.state exist
  const toolName = part.tool
}
```

### Safe Array Operations

```typescript
// ❌ Bad - mutates original
messages.reverse()

// ✅ Good - creates copy
[...messages].reverse()
```

### Error Handling with Fallback

```typescript
try {
  return await this.countWithTiktoken(content, model)
} catch (error) {
  console.error(`Token counting error:`, error)
  return this.approximateTokenCount(content)  // Fallback
}
```

### Optional Chaining for Safety

```typescript
const modelID = message.info.modelID?.toLowerCase()?.trim()
const cacheRead = tokens.cache?.read ?? 0
```

### Finding Most Recent with Non-Zero (CRITICAL)

```typescript
// ✅ Correct - reverse and find first with non-zero
const mostRecent = [...assistants]
  .reverse()
  .find(({ tokens }) => 
    (Number(tokens.input) || 0) +
    (Number(tokens.output) || 0) +
    (Number(tokens.reasoning) || 0) +
    (Number(tokens.cache?.read) || 0) +
    (Number(tokens.cache?.write) || 0) > 0
  ) ?? assistants[assistants.length - 1]

// ❌ Wrong - might end up with zero-token message
for (const { tokens } of assistants) {
  mostRecentInput = tokens.input  // Keeps overwriting, last might be zero
}
```

## Adding New Features

### Adding a New Model

1. **Add pricing** (lines 125-163):
   ```typescript
   "new-model": { input: 1.5, output: 5 }
   ```

2. **Add tokenizer mapping** (lines 184-211):
   ```typescript
   "new-model": "huggingface/tokenizer-hub-id"
   ```

3. **Test**: Run `/tokens` with the new model

### Adding a New Category

1. **Update TokenAnalysis interface**:
   ```typescript
   categories: {
     // ... existing
     images: CategorySummary  // New category
   }
   ```

2. **Add collection method to ContentCollector**:
   ```typescript
   collectImages(messages: SessionMessage[]): CategoryEntrySource[] {
     // Extract and return image data
   }
   ```

3. **Update TokenAnalysisEngine.analyze()**:
   ```typescript
   const images = this.contentCollector.collectImages(messages)
   const [system, user, assistant, tools, reasoning, images] = await Promise.all([
     // ... existing
     this.buildCategory("images", images, tokenModel, entryLimit),
   ])
   ```

4. **Update OutputFormatter**: Add new category to display

5. **Update inference logic**: Adjust system token calculation if needed:
   ```typescript
   // If new category is input, include in calculation
   const localInputEstimate = userTokens + toolsTokens + imagesTokens
   const inferredSystemTokens = Math.max(0, recentApiInputTotal - localInputEstimate)
   ```

## Known Limitations

1. **System prompts not in messages**: Must infer from API telemetry difference
2. **~2K TUI difference**: Expected because TUI updates after plugin runs (includes plugin's own tokens)
3. **Approximation fallback**: Unknown models fall back to `chars / 4` estimation
4. **Transformers download**: First use downloads tokenizer models (~5-50MB)
5. **Large sessions**: 100+ messages may take a few seconds to analyze
6. **Output truncation**: Tool outputs can be very large (affects token counts)
7. **Model detection**: Relies on most recent message having model info

## Performance Optimizations

1. **Caching**: Tokenizers cached after first load
2. **Parallel processing**: Categories counted concurrently with `Promise.all`
3. **Lazy loading**: Tokenizer modules only loaded when needed
4. **Map-based deduplication**: Efficient system prompt deduplication (though currently returns empty)
5. **Early returns**: Skip empty content immediately

## Debugging Tips

### Write Debug Output to File

```typescript
// Don't use console.log in plugins - write to a file instead
const debugPath = path.join(process.cwd(), 'token-debug.json')
await fs.writeFile(debugPath, JSON.stringify(debugData, null, 2), 'utf8')
```

### Inspect Message Structure

```typescript
const debugData = {
  totalMessages: messages.length,
  roles: messages.reduce((acc, msg) => {
    acc[msg.info.role] = (acc[msg.info.role] || 0) + 1
    return acc
  }, {} as Record<string, number>),
  sampleMessages: messages.slice(0, 3).map(m => ({
    role: m.info.role,
    infoKeys: Object.keys(m.info),
    hasSystem: 'system' in m.info,
    systemValue: m.info.system,
    partTypes: m.parts.map(p => p.type)
  }))
}
```

### Verify Telemetry Extraction

```typescript
// Add to output for debugging
lines.push(`Most recent API call telemetry:`)
lines.push(`  Input (fresh):     ${mostRecentInput} tokens`)
lines.push(`  Cache read:        ${mostRecentCacheRead} tokens`)
lines.push(`  Output:            ${mostRecentOutput} tokens`)
```

## Related Documentation

- **OpenCode Plugin API**: https://opencode.ai/docs
- **Reference Implementation**: https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin
- **js-tiktoken**: https://github.com/dqbd/tiktoken
- **Transformers.js**: https://huggingface.co/docs/transformers.js
- **Zod Schema**: https://zod.dev

## Quick Reference

### Run the Tool

```
/tokens
```

### View Output

```bash
cat token-usage-output.txt
```

### Reinstall Dependencies

```bash
cd ~/.config/opencode/plugin
./install.sh
```

### Check Plugin Loading

Look for plugin initialization messages in OpenCode logs.

## Troubleshooting Common Issues

### Issue: File shows old/stale data
**Cause**: File wasn't being overwritten properly  
**Fixed**: Added explicit `fs.unlink()` before write with `flag: 'w'`

### Issue: System prompts showing 0 tokens
**Cause**: System prompts not in session messages API  
**Fixed**: Infer from `(Input + CacheRead) - (User + Tools)`

### Issue: Context total much lower than TUI (3x less)
**Cause**: Last message in array has zero tokens (tool-only/incomplete)  
**Fixed**: Use `.reverse().find()` with explicit non-zero check

### Issue: Context total much higher than TUI (10x more)
**Cause**: Using session-wide aggregation instead of most recent call  
**Fixed**: Separate current context (most recent) from session total (all calls)

### Issue: Cost calculation seems wrong
**Cause**: Using current context instead of session total for costs  
**Solution**: Always use session aggregates (`inputTokens`, `cacheReadTokens`, etc.) for cost

---

**Last Updated**: 2025-11-10 (This Session)
**Plugin Version**: 2.0 (Major refactor with dual tracking)
**OpenCode Version**: Compatible with latest
**Total Lines**: 1,207 lines (cleaned up from ~1,295)
**Key Contributors**: Initial implementation + this debugging session
