#!/bin/bash

CACHE_FILE="/tmp/.claude-usage-cache"
CACHE_TTL=60

input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name // "?"')
CTX_PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
CTX_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
INPUT_TOKENS=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
CACHE_CREATE=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
CACHE_READ=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
USED_TOKENS=$(( INPUT_TOKENS + CACHE_CREATE + CACHE_READ ))

format_tokens() {
    local t=$1
    if (( t >= 1000000 )); then
        local whole=$(( t / 1000000 ))
        local frac=$(( (t % 1000000) / 100000 ))
        echo "${whole}.${frac}M"
    elif (( t >= 1000 )); then
        local whole=$(( t / 1000 ))
        local frac=$(( (t % 1000) / 100 ))
        echo "${whole}.${frac}k"
    else
        echo "$t"
    fi
}

USED_FMT=$(format_tokens "$USED_TOKENS")
TOTAL_FMT=$(format_tokens "$CTX_SIZE")

now=$(date +%s)
cached_at=0
if [[ -f "$CACHE_FILE" ]]; then
    cached_at=$(stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)
fi

if (( now - cached_at >= CACHE_TTL )); then
    TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])" 2>/dev/null)
    if [[ -n "$TOKEN" ]]; then
        RESP=$(curl -sf --max-time 3 https://api.anthropic.com/api/oauth/usage \
            -H "Authorization: Bearer $TOKEN" \
            -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)
        if [[ -n "$RESP" ]]; then
            echo "$RESP" > "$CACHE_FILE"
        fi
    fi
fi

FIVE_H="?"
SEVEN_D="?"
FIVE_H_RESET=""
SEVEN_D_RESET=""

if [[ -f "$CACHE_FILE" ]]; then
    FIVE_H=$(jq -r '.five_hour.utilization // "?"' "$CACHE_FILE" | cut -d. -f1)
    SEVEN_D=$(jq -r '.seven_day.utilization // "?"' "$CACHE_FILE" | cut -d. -f1)

    FIVE_H_RESET_AT=$(jq -r '.five_hour.resets_at // empty' "$CACHE_FILE" 2>/dev/null)
    SEVEN_D_RESET_AT=$(jq -r '.seven_day.resets_at // empty' "$CACHE_FILE" 2>/dev/null)

    if [[ -n "$FIVE_H_RESET_AT" ]]; then
        reset_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${FIVE_H_RESET_AT%%.*}" +%s 2>/dev/null)
        if [[ -n "$reset_epoch" ]] && (( reset_epoch > now )); then
            remaining=$(( reset_epoch - now ))
            hours=$(( remaining / 3600 ))
            mins=$(( (remaining % 3600) / 60 ))
            if (( hours > 0 )); then
                FIVE_H_RESET=" ${hours}h${mins}m"
            else
                FIVE_H_RESET=" ${mins}m"
            fi
        fi
    fi

    if [[ -n "$SEVEN_D_RESET_AT" ]]; then
        reset_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${SEVEN_D_RESET_AT%%.*}" +%s 2>/dev/null)
        if [[ -n "$reset_epoch" ]] && (( reset_epoch > now )); then
            remaining=$(( reset_epoch - now ))
            days=$(( remaining / 86400 ))
            hours=$(( (remaining % 86400) / 3600 ))
            SEVEN_D_RESET=" ${days}d${hours}h"
        fi
    fi
fi

echo "${MODEL} | ${USED_FMT}/${TOTAL_FMT} (${CTX_PCT}%) | 5h: ${FIVE_H}%${FIVE_H_RESET} | 7d: ${SEVEN_D}%${SEVEN_D_RESET}"
