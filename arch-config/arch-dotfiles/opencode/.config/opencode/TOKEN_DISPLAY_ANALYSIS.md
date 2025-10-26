# OpenCode Token Display Implementation Analysis

## Overview
This document captures how OpenCode displays the token count and context window percentage in the top right corner of the TUI interface.

## Core Implementation

### Location
**File**: `packages/tui/internal/components/chat/messages.go`
**Key Functions**: 
- `renderHeader()` (lines ~600-750)
- `formatTokensAndCost()` (lines ~750-790)

## Token Calculation Logic

In the `renderHeader()` method, tokens are calculated by iterating through all messages:

```go
tokens := float64(0)
cost := float64(0)
contextWindow := m.app.Model.Limit.Context

for _, message := range m.app.Messages {
    if assistant, ok := message.Info.(opencode.AssistantMessage); ok {
        cost += assistant.Cost
        usage := assistant.Tokens
        if usage.Output > 0 {
            if assistant.Summary {
                tokens = usage.Output
                continue
            }
            tokens = (usage.Input +
                usage.Cache.Read +
                usage.Cache.Write +
                usage.Output +
                usage.Reasoning)
        }
    }
}
```

## Display Formatting Logic

The `formatTokensAndCost()` function handles the visual formatting:

```go
func formatTokensAndCost(
    tokens float64,
    contextWindow float64,
    cost float64,
    isSubscriptionModel bool,
) string {
    // Format tokens in human-readable format (e.g., 110K, 1.2M)
    var formattedTokens string
    switch {
    case tokens >= 1_000_000:
        formattedTokens = fmt.Sprintf("%.1fM", float64(tokens)/1_000_000)
    case tokens >= 1_000:
        formattedTokens = fmt.Sprintf("%.1fK", float64(tokens)/1_000)
    default:
        formattedTokens = fmt.Sprintf("%d", int(tokens))
    }

    // Remove .0 suffix if present
    if strings.HasSuffix(formattedTokens, ".0K") {
        formattedTokens = strings.Replace(formattedTokens, ".0K", "K", 1)
    }
    if strings.HasSuffix(formattedTokens, ".0M") {
        formattedTokens = strings.Replace(formattedTokens, ".0M", "M", 1)
    }

    percentage := 0.0
    if contextWindow > 0 {
        percentage = (float64(tokens) / float64(contextWindow)) * 100
    }

    if isSubscriptionModel {
        return fmt.Sprintf(
            "%s/%d%%",
            formattedTokens,
            int(percentage),
        )
    }

    formattedCost := fmt.Sprintf("$%.2f", cost)
    return fmt.Sprintf(
        " %s/%d%% (%s)",
        formattedTokens,
        int(percentage),
        formattedCost,
    )
}
```

## UI Positioning and Layout

The token information is positioned in the header using a flex layout system:

```go
// Layout configuration for right-aligned token display
headerRow := layout.Render(
    layout.FlexOptions{
        Background: &bgColor,
        Direction:  layout.Row,
        Justify:    layout.JustifySpaceBetween,  // This pushes token info to the right
        Align:      layout.AlignStretch,
        Width:      headerWidth - 6,
    },
    items...,
)
```

## Styling

The token display uses muted text styling:

```go
sessionInfo = styles.NewStyle().
    Foreground(t.TextMuted()).  // Subtle gray color
    Background(bgColor).
    Render(sessionInfoText)
```

## Display Formats

**For subscription models (free tier)**:
```
110K/25%
```

**For paid models**:
```
110K/25% ($0.12)
```

## Real-time Updates

The token display updates automatically through:
1. **Event-driven updates**: Listens for `EventMessageUpdated`, `EventSessionUpdated` events
2. **Render triggers**: Calls `renderView()` which recalculates tokens and updates the header
3. **Streaming updates**: During message streaming, the display updates in real-time

## Key Features

1. **Human-readable formatting**: Converts large numbers to K/M suffixes
2. **Context window percentage**: Shows `(tokens / contextWindow) * 100`
3. **Model type awareness**: Different formats for subscription vs. paid models
4. **Right-aligned positioning**: Uses flex layout with `JustifySpaceBetween`
5. **Muted styling**: Subtle appearance that doesn't distract from the main content
6. **Real-time updates**: Automatically updates during message streaming

## Comparison with Custom Token Analyzer Plugin

| Aspect | OpenCode Built-in | Custom Plugin |
|--------|-------------------|---------------|
| **Data Source** | Actual API telemetry from model provider | Local token counting with tokenizers |
| **Accuracy** | Real provider token counts | Approximate (though uses official tokenizers) |
| **Context Window** | Has access to model limits for percentage | Uses approximation or manual limits |
| **Update Frequency** | Real-time during streaming | On-demand analysis |
| **Detail Level** | Simple summary | Detailed breakdown by category |
| **Use Case** | Real-time monitoring | Post-session analysis |

## Key Insights

1. **Source of Truth**: OpenCode uses actual API telemetry, making it more accurate than local counting
2. **Context Awareness**: Has built-in knowledge of model context windows
3. **Real-time Nature**: Updates live during message generation
4. **Clean Integration**: Seamlessly integrated into the TUI header with proper styling
5. **Model Awareness**: Different display formats for different pricing models

This implementation is optimized for real-time monitoring during active usage, while the custom token analyzer plugin is better suited for detailed post-session analysis and optimization insights.