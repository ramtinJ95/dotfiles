# OpenCode Token Analyzer Plugin

A powerful OpenCode plugin that provides detailed token usage analysis for your AI sessions. Track and understand how tokens are distributed across system prompts, user messages, assistant responses, tool outputs, and reasoning traces.

## Features

- **Comprehensive Token Breakdown**: Analyze token usage across five categories:
  - System prompts (main prompt, permissions, tool rules, etc.)
  - User messages
  - Assistant responses
  - Tool outputs (bash, read, webfetch, grep, etc.)
  - Reasoning traces

- **Visual Charts**: Easy-to-read ASCII bar charts with percentages and token counts

- **Top Contributors**: Identifies the top 10 individual items consuming the most tokens

- **Multi-Model Support**: Works with all major AI models:
  - OpenAI (GPT-4, GPT-3.5, O1, O3, etc.)
  - Anthropic Claude (Opus, Sonnet, Haiku)
  - Meta Llama (2, 3, 3.1, 3.2, 3.3, 4)
  - Mistral (Large, Small, Nemo, Codestral)
  - DeepSeek (V2, V3, R1)
  - Google Gemini

- **Accurate Counting**: Uses official tokenizers:
  - `js-tiktoken` for OpenAI models
  - Hugging Face transformers for other models
  - Fallback approximation for unsupported models

## Installation

### Quick Install (Current Directory)

```bash
cd ~/.config/opencode/plugin
./install.sh
```

### Manual Installation

If you prefer to install dependencies manually:

```bash
cd ~/.config/opencode/plugin
npm install "js-tiktoken@latest" "@huggingface/transformers@^3.3.3" --prefix ./vendor
```

### Verify Installation

After installation, restart OpenCode. Type `/` and you should see `/tokens` in the command list.

## Usage

### Basic Command

```bash
/tokens
```

This will analyze the current session and display:
- Token distribution across all categories
- Visual bar chart
- Top 10 token consumers

### Example Output

```
Token Analysis: Session abc123
Model: claude-3.5-sonnet

SYSTEM    ████████████████████████░░░░░░  65.2% (32,456)
USER      ████████░░░░░░░░░░░░░░░░░░░░░░  21.3% (10,567)
ASSISTANT ██████░░░░░░░░░░░░░░░░░░░░░░░░  12.1%  (6,021)
TOOLS     █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1.2%    (598)
REASONING ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0.2%     (98)

Total: 49,740 tokens

Top Contributors:
• System#MainPrompt           28,456 tokens (57.2%)
• User#1                       6,234 tokens (12.5%)
• Assistant#1                  4,567 tokens (9.2%)
• read                           458 tokens (0.9%)
• bash                           140 tokens (0.3%)
```

## Architecture

The plugin is designed with a clean, modular architecture:

### Core Components

1. **TokenizerManager**: Manages tokenizer loading and caching
   - Supports tiktoken (OpenAI) and transformers (other models)
   - Caches tokenizers for performance
   - Automatic fallback to approximation

2. **ModelResolver**: Detects and resolves the appropriate tokenizer
   - Maps model IDs to tokenizer specs
   - Provider-based fallbacks
   - Prefix-based detection

3. **ContentCollector**: Extracts and categorizes content from sessions
   - System prompt identification
   - Tool output aggregation
   - Message text extraction

4. **TokenAnalysisEngine**: Orchestrates the analysis process
   - Parallel category processing
   - Telemetry integration (uses actual API token counts)
   - Token scaling and adjustment

5. **OutputFormatter**: Creates visual output
   - ASCII bar charts
   - Top contributors list
   - Clean, readable formatting

### File Structure

```
~/.config/opencode/
├── command/
│   └── tokens.md              # Command definition
└── plugin/
    ├── token-analyzer.ts      # Main plugin implementation
    ├── package.json           # Plugin metadata
    ├── install.sh             # Dependency installer
    ├── README.md              # This file
    └── vendor/                # Tokenizer dependencies (created by install.sh)
        └── node_modules/
            ├── js-tiktoken/
            └── @huggingface/transformers/
```

## Extending the Plugin

The plugin is designed to be easily extensible. Here are some ideas:

### Add Custom Analysis

Modify `TokenAnalysisEngine` to add new analysis features:

```typescript
// Add cost calculation
async analyzeWithCost(
  sessionID: string,
  messages: SessionMessage[],
  tokenModel: TokenModel,
  costPerToken: number
): Promise<TokenAnalysisWithCost> {
  const analysis = await this.analyze(sessionID, messages, tokenModel, 3)
  return {
    ...analysis,
    totalCost: analysis.totalTokens * costPerToken
  }
}
```

### Add New Categories

Extend `ContentCollector` to collect new types of content:

```typescript
collectImages(messages: SessionMessage[]): CategoryEntrySource[] {
  // Collect and estimate tokens for image content
}
```

### Custom Formatters

Create new formatters for different output styles:

```typescript
class JSONFormatter {
  format(analysis: TokenAnalysis): string {
    return JSON.stringify(analysis, null, 2)
  }
}

class CSVFormatter {
  format(analysis: TokenAnalysis): string {
    // Export to CSV format
  }
}
```

###  Cost Tracking
```typescript
class CostCalculator {
  calculateCost(analysis: TokenAnalysis, pricing: PricingConfig): CostAnalysis {
    // Calculate $ cost based on token usage
  }
}
```

###  Historical Trends
```typescript
class TrendAnalyzer {
  compareWithPrevious(current: TokenAnalysis, history: TokenAnalysis[]): TrendReport {
    // Show token usage over time
  }
}
```

###  Optimization Suggestions
```typescript
class OptimizationAdvisor {
  suggestOptimizations(analysis: TokenAnalysis): Suggestion[] {
    // Suggest ways to reduce token usage
  }
}
```

###  Export Capabilities
```typescript
class Exporter {
  exportToCSV(analysis: TokenAnalysis): string
  exportToJSON(analysis: TokenAnalysis): string
  exportToPDF(analysis: TokenAnalysis): Buffer
}
```

###  Real-time Monitoring
```typescript
class TokenMonitor {
  watchSession(sessionID: string, threshold: number): void {
    // Alert when token usage exceeds threshold
  }
}
```


## Troubleshooting

### "Dependencies missing" error

Run the installation script:
```bash
cd ~/.config/opencode/plugin
./install.sh
```

### Command not appearing

1. Check that `tokens.md` exists in `~/.config/opencode/command/`
2. Restart OpenCode completely
3. Check OpenCode logs for plugin errors

### Inaccurate token counts

The plugin uses actual API telemetry when available, which should be accurate. If counts seem off:
- The model might not be properly detected (check the model name in output)
- The tokenizer might not be installed correctly (re-run install.sh)
- For very rare models, it may fall back to approximation (length/4)

## Performance Notes

- Tokenizers are cached after first use for better performance
- Categories are processed in parallel for speed
- Large sessions (>100 messages) may take a few seconds to analyze
- Transformers tokenizers download model files on first use (~5-50MB per model)

## Privacy

All token counting happens locally on your machine. No session data is sent to external services. Tokenizer models are downloaded from official sources:
- OpenAI tokenizers: npm registry
- Transformers tokenizers: Hugging Face Hub

## Contributing

This plugin is designed to be extended! Some ideas:
- Add cost tracking per provider
- Export analysis to files
- Historical trending
- Token optimization suggestions
- Custom categorization rules

## License

Open source - feel free to modify and extend for your needs.

---

**Built for [OpenCode](https://opencode.ai)** - Enhance your AI development workflow with detailed token analysis.
