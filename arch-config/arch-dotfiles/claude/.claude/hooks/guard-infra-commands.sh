#!/bin/bash
# Guard against destructive CLI commands in bypass permissions mode.
# Exit 0 = allow, Exit 2 = block (Claude gets stderr as feedback).
#
# One-time approval flow:
#   1. Hook blocks a command
#   2. User says "go ahead"
#   3. Claude writes the command to /tmp/claude-approved-cmd
#   4. Claude retries — hook sees the approval, allows it, deletes the file

COMMAND=$(cat | jq -r '.tool_input.command')
APPROVAL_FILE="/tmp/claude-approved-cmd"

# ── Check for one-time approval ──
if [ -f "$APPROVAL_FILE" ]; then
  approved=$(cat "$APPROVAL_FILE")
  if [ "$COMMAND" = "$approved" ]; then
    rm -f "$APPROVAL_FILE"
    exit 0
  fi
fi

block() {
  echo "BLOCKED — $1: $COMMAND" >&2
  echo "If the user approves, write this exact command to $APPROVAL_FILE and retry." >&2
  exit 2
}

# ── rm protection ──
if echo "$COMMAND" | grep -qE '(^|\||;|&&)\s*rm\s'; then
  block "rm command needs confirmation"
fi

# ── kubectl: allowlist of read-only subcommands ──
if echo "$COMMAND" | grep -qE '(^|\||;|&&)\s*kubectl\s'; then
  KUBECTL_READ="get|describe|logs|log|top|explain|api-resources|api-versions|cluster-info|version|auth|diff|config|exec|port-forward|cp|wait"
  if ! echo "$COMMAND" | grep -qP "kubectl\s+($KUBECTL_READ)(\s|$)"; then
    block "kubectl write command needs confirmation"
  fi
fi

# ── az CLI: allowlist of read-only actions ──
if echo "$COMMAND" | grep -qE '(^|\||;|&&)\s*az\s'; then
  az_segment=$(echo "$COMMAND" | grep -oP '(^|(?<=\|)|(?<=;)|(?<=&&))\s*az\s+[^|;&]+' | head -1)
  # Strip redirects, then extract only az subcommands (words before first flag)
  az_clean=$(echo "$az_segment" | sed 's/[0-9]*>[&]*[0-9]*//g' | xargs)
  az_action=""
  for word in $az_clean; do
    case "$word" in
      az) continue ;;
      -*) break ;;
      *) az_action="$word" ;;
    esac
  done

  AZ_READ="list|show|get|export|download|download-batch|display|check|exists|wait|account"
  if ! echo "$az_action" | grep -qP "^($AZ_READ)$"; then
    block "az write command needs confirmation"
  fi
fi

# ── terraform: block destructive commands ──
if echo "$COMMAND" | grep -qE '(^|\||;|&&)\s*terraform\s'; then
  TF_READ="plan|show|init|validate|fmt|format|output|state list|state show|graph|providers|workspace list|workspace show|workspace select|version|get|console"
  if ! echo "$COMMAND" | grep -qP "terraform\s+($TF_READ)(\s|$)"; then
    block "terraform write command needs confirmation"
  fi
fi

exit 0
