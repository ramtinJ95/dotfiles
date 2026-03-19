#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Create Jira Task issues under an epic through Playwriter browser-session auth.
No Jira PAT/token is required or used.

Usage:
  create_jira_tasks.sh --epic <EPIC_KEY> --project <PROJECT_KEY> --tasks-file <JSON_PATH> [options]

Options:
  --epic <key>           Epic key, e.g. BAN-302 (required)
  --project <key>        Project key, e.g. BAN (required)
  --tasks-file <path>    JSON array payload (required)
  --browser <stableKey>  Playwriter browser key (recommended when multiple profiles exist)
  --session <id>         Existing Playwriter session ID to reuse
  --timeout <ms>         Playwriter timeout in ms (default: 90000)
  --dry-run              Validate payload and epic access only; do not create issues
  --help                 Show this help

Task payload format:
[
  {
    "summary": "Task summary",
    "description_lines": ["Line 1", "Line 2"]
  }
]
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd jq
require_cmd rg

PLAYWRITER_BIN="${PLAYWRITER_BIN:-playwriter}"
if ! command -v "$PLAYWRITER_BIN" >/dev/null 2>&1; then
  PLAYWRITER_BIN="npx playwriter@latest"
fi

EPIC_KEY=""
PROJECT_KEY=""
TASKS_FILE=""
BROWSER_KEY="${PLAYWRITER_BROWSER_KEY:-}"
SESSION_ID=""
TIMEOUT_MS=90000
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --epic)
      EPIC_KEY="${2:-}"
      shift 2
      ;;
    --project)
      PROJECT_KEY="${2:-}"
      shift 2
      ;;
    --tasks-file)
      TASKS_FILE="${2:-}"
      shift 2
      ;;
    --browser)
      BROWSER_KEY="${2:-}"
      shift 2
      ;;
    --session)
      SESSION_ID="${2:-}"
      shift 2
      ;;
    --timeout)
      TIMEOUT_MS="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$EPIC_KEY" || -z "$PROJECT_KEY" || -z "$TASKS_FILE" ]]; then
  echo "Missing required arguments." >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$TASKS_FILE" ]]; then
  echo "Tasks file does not exist: $TASKS_FILE" >&2
  exit 1
fi

jq -e '
  type == "array" and
  all(.[]; (.summary | type == "string" and length > 0) and
            ((.description_lines // []) | type == "array" and all(.[]; type == "string")))
' "$TASKS_FILE" >/dev/null

if [[ -z "$SESSION_ID" ]]; then
  if [[ -z "$BROWSER_KEY" ]]; then
    BROWSER_KEY="$($PLAYWRITER_BIN session list | awk '/@bannerflow\\.(com|onmicrosoft.com)/ {print $4; exit}')"
  fi

  if [[ -n "$BROWSER_KEY" ]]; then
    SESSION_CREATE_OUTPUT="$($PLAYWRITER_BIN session new --browser "$BROWSER_KEY" 2>&1)"
  else
    SESSION_CREATE_OUTPUT="$($PLAYWRITER_BIN session new 2>&1)"
  fi

  SESSION_ID="$(printf '%s\n' "$SESSION_CREATE_OUTPUT" | rg -o 'Session [0-9]+' | awk '{print $2}' | head -n1)"
  if [[ -z "$SESSION_ID" ]]; then
    echo "Could not determine Playwriter session ID." >&2
    printf '%s\n' "$SESSION_CREATE_OUTPUT" >&2
    exit 1
  fi
fi

TASKS_B64="$(base64 "$TASKS_FILE" | tr -d '\n')"
EPIC_KEY_JSON="$(printf '%s' "$EPIC_KEY" | jq -Rsa .)"
PROJECT_KEY_JSON="$(printf '%s' "$PROJECT_KEY" | jq -Rsa .)"
TASKS_B64_JSON="$(printf '%s' "$TASKS_B64" | jq -Rsa .)"
if [[ "$DRY_RUN" == "true" ]]; then
  DRY_RUN_JSON="true"
else
  DRY_RUN_JSON="false"
fi

JS_CODE="$(cat <<'JS'
const tab = context.pages().find(p => p.url().includes('atlassian.net')) ?? context.pages()[0] ?? await context.newPage();
if (!tab.url() || tab.url() === 'about:blank') {
  await tab.goto('https://bannerflow.atlassian.net/jira', { waitUntil: 'domcontentloaded' });
}

const epicKey = __EPIC_KEY__;
const projectKey = __PROJECT_KEY__;
const dryRun = __DRY_RUN__;
const tasks = JSON.parse(Buffer.from(__TASKS_B64__, 'base64').toString('utf8'));

async function jira(path, init = {}) {
  const payload = await tab.evaluate(async ({ path, init }) => {
    const response = await fetch(path, {
      method: init.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: init.body || undefined
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { ok: response.ok, status: response.status, data };
  }, { path, init });
  return payload;
}

const epic = await jira(`/rest/api/3/issue/${epicKey}?fields=summary,issuetype,project,key,status`);
if (!epic.ok) {
  console.log(JSON.stringify({ ok: false, phase: 'epic_lookup', epicKey, epic }, null, 2));
  return;
}

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    phase: 'dry_run',
    epic: { key: epic.data.key, summary: epic.data.fields?.summary },
    projectKey,
    taskCount: tasks.length
  }, null, 2));
  return;
}

const created = [];
const failures = [];

for (const task of tasks) {
  const description = {
    type: 'doc',
    version: 1,
    content: (task.description_lines || []).map(line => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }]
    }))
  };

  const body = {
    fields: {
      project: { key: projectKey },
      parent: { key: epicKey },
      issuetype: { name: 'Task' },
      summary: task.summary,
      description
    }
  };

  const response = await jira('/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (response.ok) {
    const issueKey = response.data.key;
    const verify = await jira(`/rest/api/3/issue/${issueKey}?fields=parent,status,summary,issuetype`);
    created.push({
      key: issueKey,
      url: `https://bannerflow.atlassian.net/browse/${issueKey}`,
      verify
    });
  } else {
    failures.push({
      summary: task.summary,
      status: response.status,
      errorMessages: response.data?.errorMessages || [],
      errors: response.data?.errors || {}
    });
  }
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  epic: { key: epic.data.key, summary: epic.data.fields?.summary },
  created,
  failures
}, null, 2));
JS
)"

JS_CODE="$(printf '%s\n' "$JS_CODE" \
  | sed "s|__EPIC_KEY__|$EPIC_KEY_JSON|g" \
  | sed "s|__PROJECT_KEY__|$PROJECT_KEY_JSON|g" \
  | sed "s|__DRY_RUN__|$DRY_RUN_JSON|g" \
  | sed "s|__TASKS_B64__|$TASKS_B64_JSON|g")"

$PLAYWRITER_BIN -s "$SESSION_ID" --timeout "$TIMEOUT_MS" -e "$JS_CODE"
