---
name: jira-create-tasks
description: Create Jira Task issues under an epic using Playwriter browser-session auth. Use when asked to create backlog tasks from PRs, rollout work, or retroactively from the current session.
argument-hint: [epic-key]
disable-model-invocation: true
allowed-tools: Bash, Read, Write
---

# Jira Create Tasks

Create Jira Task issues under a target epic through Playwriter, reusing an authenticated Jira browser session. No Jira PAT or token needed.

## Inputs

- **Epic key** (from `$ARGUMENTS`, or ask the user if not provided)
- **Task list** — either:
  - Ask the user to describe the tasks they want created, OR
  - Retroactively extract tasks from the current conversation context (e.g. work done, PRs discussed, decisions made)
- **Project key** — infer from the epic key prefix (e.g. `BAN-302` → `BAN`). Do NOT ask for it separately.
- **Browser profile** — let the script auto-detect from the active Playwriter session. Only ask if the script fails to find one.

## Workflow

1. **Determine the epic key.** Use `$ARGUMENTS` if provided, otherwise ask.

2. **Infer the project key** from the epic key prefix (everything before the dash).

3. **Gather tasks.** Either:
   - Ask the user what tasks to create (summary + description for each), OR
   - If the user says "from this session" or similar, review the conversation history and propose a list of tasks based on work discussed. Present the list and get confirmation before creating.

4. **Build the task payload JSON** and write it to `/tmp/jira_tasks.json`:
   ```json
   [
     {
       "summary": "Short task title",
       "description_lines": [
         "Detail line 1",
         "Detail line 2"
       ]
     }
   ]
   ```

5. **Run a dry-run first** to validate the epic and payload:
   ```bash
   bash ${CLAUDE_SKILL_DIR}/scripts/create_jira_tasks.sh \
     --epic <EPIC_KEY> \
     --project <PROJECT_KEY> \
     --tasks-file /tmp/jira_tasks.json \
     --dry-run
   ```

6. **Show the user** the dry-run result and the full task list. Ask for confirmation to proceed.

7. **Create the tasks:**
   ```bash
   bash ${CLAUDE_SKILL_DIR}/scripts/create_jira_tasks.sh \
     --epic <EPIC_KEY> \
     --project <PROJECT_KEY> \
     --tasks-file /tmp/jira_tasks.json
   ```

8. **Report results:** show created issue keys with URLs, and any failures with error details.

## Output

Always present:
1. Created issue keys and their Jira URLs
2. Any failures with status codes and error messages
3. Parent and status verification for each created issue
