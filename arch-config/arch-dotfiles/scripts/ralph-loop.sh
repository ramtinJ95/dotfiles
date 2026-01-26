#!/bin/bash
set -e
set -o pipefail

# CLI tool selection: "claude" (default) or "opencode"
CLI_TOOL=${1:-"claude"}
MAX_ITERATIONS=${2:-20}
PROMPT_FILE=${3:-"ralph-loop.txt"}
LOG_DIR="$(pwd)/ralph-logs"
mkdir -p "$LOG_DIR"

# Validate CLI tool selection
if [[ "$CLI_TOOL" != "claude" && "$CLI_TOOL" != "opencode" ]]; then
    echo "❌ Error: Invalid CLI tool: $CLI_TOOL"
    echo "   Valid options: claude, opencode"
    echo "   Usage: $0 [cli_tool] [max_iterations] [prompt_file]"
    exit 1
fi

# Read prompt from file
if [[ ! -f "$PROMPT_FILE" ]]; then
    if [[ "$CLI_TOOL" == "claude" ]]; then
        echo "❌ Error: Prompt file not found: $PROMPT_FILE"
    else
        echo "Error: Prompt file not found: $PROMPT_FILE"
    fi
    echo "   Create the file or specify a different path as the third argument."
    echo "   Usage: $0 [cli_tool] [max_iterations] [prompt_file]"
    exit 1
fi

PROMPT=$(cat "$PROMPT_FILE")

if [[ "$CLI_TOOL" == "claude" ]]; then
    echo "🚀 Starting Ralph Loop"
else
    echo "Starting Ralph Loop (OpenCode)"
fi
echo "   CLI tool: $CLI_TOOL"
echo "   Max iterations: $MAX_ITERATIONS"
echo "   Prompt file: $PROMPT_FILE"
echo "   Logs: $LOG_DIR/"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)

    if [[ "$CLI_TOOL" == "opencode" ]]; then
        LOG_FILE="$LOG_DIR/oc-iteration-${i}-${TIMESTAMP}.log"
    else
        LOG_FILE="$LOG_DIR/iteration-${i}-${TIMESTAMP}.log"
    fi

    echo ""
    if [[ "$CLI_TOOL" == "claude" ]]; then
        echo "═══════════════════════════════════════════"
    else
        echo "==========================================="
    fi
    echo "  Iteration $i of $MAX_ITERATIONS"
    echo "  Started: $(date)"
    echo "  Log: $LOG_FILE"
    if [[ "$CLI_TOOL" == "claude" ]]; then
        echo "═══════════════════════════════════════════"
    else
        echo "==========================================="
    fi
    echo ""

    if [[ "$CLI_TOOL" == "claude" ]]; then
        # Run claude and stream output to both terminal and log file
        # Pipe through jq for human-readable formatting
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
    else
        # Run opencode with auto-approve permissions and stream output to both terminal and log file
        # Pipe through jq for human-readable formatting
        # OPENCODE_PERMISSION='{"*":"allow"}' auto-approves all tool calls (equivalent to --dangerously-skip-permissions)
        OPENCODE_PERMISSION='{"*":"allow"}' opencode run "$PROMPT" --format json 2>&1 | \
            tee "$LOG_FILE" | \
            jq --unbuffered -r '
                if .type == "text" and .part.text then
                    ">> " + .part.text
                elif .type == "tool_use" and .part.tool then
                    if .part.state.status == "completed" then
                        "[v] " + .part.tool + ": Done"
                    elif .part.state.status == "running" then
                        "[*] Using: " + .part.tool
                    elif .part.state.status == "error" then
                        "[x] " + .part.tool + ": " + (.part.state.error // "Error")
                    else
                        empty
                    end
                elif .type == "step_start" then
                    "--- Step started ---"
                elif .type == "step_finish" then
                    "--- Step finished ---"
                else
                    empty
                end
            ' 2>/dev/null || true
    fi

    # Check log file for completion marker
    if grep -qi "IM DONE" "$LOG_FILE"; then
        echo ""
        if [[ "$CLI_TOOL" == "claude" ]]; then
            echo "═══════════════════════════════════════════"
            echo "  ✅ All tasks complete!"
        else
            echo "==========================================="
            echo "  All tasks complete!"
        fi
        echo "  Total iterations: $i"
        echo "  Finished: $(date)"
        if [[ "$CLI_TOOL" == "claude" ]]; then
            echo "═══════════════════════════════════════════"
        else
            echo "==========================================="
        fi
        exit 0
    fi

    echo ""
    echo "--- Iteration $i complete, starting next in 2s ---"
    sleep 2
done

echo ""
if [[ "$CLI_TOOL" == "claude" ]]; then
    echo "⚠️  Max iterations ($MAX_ITERATIONS) reached"
else
    echo "Warning: Max iterations ($MAX_ITERATIONS) reached"
fi
exit 1
