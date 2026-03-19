---
name: jira-create-tasks-playwriter
description: Create Jira Task issues under an epic using Playwriter with browser-session auth from an authenticated Jira tab. Use when asked to quickly add backlog tasks, often from PRs or rollout work.
---

# Jira Create Tasks Playwriter

## Overview

Use this skill to create Jira `Task` issues under a target epic through Playwriter, while reusing an authenticated Jira browser profile/session.
This skill does not use a Jira PAT or external token configuration.

## Inputs To Collect

Gather these before execution:

- Epic key, for example `BAN-302`
- Project key, for example `BAN`
- Task list with summary and description lines
- Browser profile key for Playwriter when multiple profiles exist, for example `profile:105252915234115552912`
- An already logged-in Jira tab in that browser profile

## Workflow

1. Build task payload JSON.
2. Run the helper script to create all tasks.
3. Report created keys and verify each issue parent/status.

Use the template file:

`references/task_payload_template.json`

## Commands

Create payload:

```bash
cat > /tmp/jira_tasks.json <<'JSON'
[
  {
    "summary": "DuckLake Entra auth and RBAC rollout for metadata and ADLS (PR #51)",
    "description_lines": [
      "Implement and roll out Microsoft Entra based access for DuckLake metadata and ADLS.",
      "Reference PR: https://github.com/nordicfactory/data-platform-infrastructure/pull/51"
    ]
  },
  {
    "summary": "Clarify DuckLake Entra runbook wording and default privilege scope (PR #52)",
    "description_lines": [
      "Clarify runbook wording and PostgreSQL default privilege scope notes.",
      "Reference PR: https://github.com/nordicfactory/data-platform-infrastructure/pull/52"
    ]
  }
]
JSON
```

Create tasks under an epic:

```bash
bash scripts/create_jira_tasks.sh \
  --epic BAN-302 \
  --project BAN \
  --tasks-file /tmp/jira_tasks.json \
  --browser profile:105252915234115552912
```

Optional dry-run validation:

```bash
bash scripts/create_jira_tasks.sh \
  --epic BAN-302 \
  --project BAN \
  --tasks-file /tmp/jira_tasks.json \
  --browser profile:105252915234115552912 \
  --dry-run
```

## Output Contract

Always return:

1. Created issue keys and URLs.
2. Any failed creations with Jira API status and message.
3. Parent and status verification for each created issue.
