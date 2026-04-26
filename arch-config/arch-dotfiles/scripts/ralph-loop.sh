#!/bin/bash
set -e
set -o pipefail

MAX_ITERATIONS=${1:-20}
PROMPT_FILE=${2:-"ralph-loop.txt"}
LOG_DIR="$(pwd)/ralph-logs"
mkdir -p "$LOG_DIR"

if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "❌ Error: Prompt file not found: $PROMPT_FILE"
    echo "   Create the file or specify a different path as the third argument."
    echo "   Usage: $0 [max_iterations] [prompt_file]"
    exit 1
fi

PROMPT=$(cat "$PROMPT_FILE")

echo "🚀 Starting Ralph Loop"
echo "   Max iterations: $MAX_ITERATIONS"
echo "   Prompt file: $PROMPT_FILE"
echo "   Logs: $LOG_DIR/"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    LOG_FILE="$LOG_DIR/iteration-${i}-${TIMESTAMP}.log"

    echo ""
    echo "═══════════════════════════════════════════"
    echo "  Iteration $i of $MAX_ITERATIONS"
    echo "  Started: $(date)"
    echo "  Log: $LOG_FILE"
    echo "═══════════════════════════════════════════"
    echo ""

    claude -p "$PROMPT" --dangerously-skip-permissions --output-format stream-json --verbose 2>&1 | \
        tee "$LOG_FILE" | \
        jq --unbuffered -r '
            if .type == "assistant" and .message.content then
                .message.content[] | select(.type == "text") | "💬 " + .text
            elif .type == "content_block_start" and .content_block.type == "tool_use" then
                "🔧 Using: " + .content_block.name
            elif .type == "content_block_delta" and .delta.partial_json then
                empty
            elif .type == "content_block_delta" and .delta.text then
                .delta.text
            elif .type == "tool_result" then
                "✓ Done"
            elif .type == "result" then
                "\n📋 Result: " + (.result // "completed")
            else
                empty
            end
        ' 2>/dev/null || true

    # Check log file for completion marker
    if grep -qi "IM DONE" "$LOG_FILE"; then
        echo ""
        echo "═══════════════════════════════════════════"
        echo "  ✅ All tasks complete!"
        echo "  Total iterations: $i"
        echo "  Finished: $(date)"
        echo "═══════════════════════════════════════════"
        exit 0
    fi

    echo ""
    echo "--- Iteration $i complete, starting next in 2s ---"
    sleep 2
done

echo ""
echo "⚠️  Max iterations ($MAX_ITERATIONS) reached"
exit 1
