#!/bin/bash
input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name')
CONTEXT_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size')
USED_PERCENT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')

INPUT=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
OUTPUT=$(echo "$input" | jq -r '.context_window.current_usage.output_tokens // 0')
CACHE_CREATE=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
CACHE_READ=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')

TOTAL_TOKENS=$((INPUT + OUTPUT + CACHE_CREATE + CACHE_READ))
REMAINING=$((CONTEXT_SIZE - TOTAL_TOKENS))

if [ "$TOTAL_TOKENS" -gt 0 ] 2>/dev/null; then
    printf "[%s] Tokens: %'d/%'d | Remaining: %'d | Used: %.1f%%" "$MODEL" "$TOTAL_TOKENS" "$CONTEXT_SIZE" "$REMAINING" "$USED_PERCENT"
else
    printf "[%s] Tokens: 0/%'d | Used: 0.0%%" "$MODEL" "$CONTEXT_SIZE"
fi
