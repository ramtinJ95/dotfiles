---
name: egenskriven-advanced
description: Advanced EgenSkriven features including epics, task dependencies, sub-tasks, batch operations, and views. Use when working with blocked tasks, epic management, sub-tasks, batch imports, or complex filtering.
---

## Overview

This skill covers advanced EgenSkriven features for complex project management: epics, task dependencies, sub-tasks, batch operations, and advanced filtering.

## Epics

Group related tasks under a theme or initiative.

### Epic Commands

```bash
# Create an epic
egenskriven epic add "Epic title" --color "#4A90D9"

# List all epics
egenskriven epic list --json

# Show epic details with linked tasks
egenskriven epic show <epic-ref> --json

# Update epic
egenskriven epic update <epic-ref> --title "New title"

# Delete epic (unlinks tasks, doesn't delete them)
egenskriven epic delete <epic-ref>
```

### Linking Tasks to Epics

```bash
# Create task linked to epic
egenskriven add "Task title" --epic <epic-ref>

# Link existing task to epic
egenskriven update <task-ref> --epic <epic-ref>

# Unlink task from epic
egenskriven update <task-ref> --epic ""

# Filter tasks by epic
egenskriven list --epic <epic-ref> --json
```

## Task Dependencies (Blocking)

Tasks can block other tasks, preventing them from being started until blockers are resolved.

### Managing Dependencies

```bash
# Add a blocker
egenskriven update <task> --blocked-by <blocker-task>

# Add multiple blockers
egenskriven update <task> --blocked-by <blocker1> --blocked-by <blocker2>

# Remove a blocker
egenskriven update <task> --remove-blocked-by <blocker-task>

# View task with blockers
egenskriven show <task> --json
```

### Dependency Rules

- Circular dependencies are prevented automatically
- Self-blocking is prevented
- Completing a blocker unblocks dependent tasks
- Moving a blocker back from `done` re-blocks dependents

### Filtering by Block Status

```bash
# Ready tasks (unblocked, in todo/backlog) - best for agents
egenskriven list --ready --json

# Only blocked tasks
egenskriven list --is-blocked --json

# Only unblocked tasks (any column)
egenskriven list --not-blocked --json

# Combine with other filters
egenskriven list --ready --type bug --priority high --json
```

## Sub-tasks

Break down large tasks into smaller, trackable units.

### Creating Sub-tasks

```bash
# Create sub-task under parent
egenskriven add "Sub-task title" --parent <parent-ref>

# View parent with sub-tasks
egenskriven show <parent-ref> --json
```

### Sub-task Behavior

- Parent shows progress based on sub-task completion
- Sub-tasks inherit board from parent
- Sub-tasks can have their own blockers and dependencies
- Completing all sub-tasks doesn't auto-complete parent

### Filtering Sub-tasks

```bash
# Only tasks with parents (sub-tasks)
egenskriven list --has-parent --json

# Only top-level tasks (no parent)
egenskriven list --no-parent --json

# Sub-tasks of specific parent
egenskriven list --parent <parent-ref> --json
```

## Batch Operations

Efficiently handle multiple tasks at once.

### Batch Add (JSON Lines)

```bash
# From stdin
echo '{"title":"Task 1","type":"bug"}
{"title":"Task 2","type":"feature"}' | egenskriven add --stdin

# From file
egenskriven add --file tasks.jsonl
```

**JSON format per line:**
```json
{"title":"Required","type":"bug","priority":"high","column":"todo"}
```

### Batch Delete

```bash
# Multiple IDs
egenskriven delete id1 id2 id3 --force

# From stdin
echo "id1
id2
id3" | egenskriven delete --stdin --force
```

### Batch Move

```bash
# Move multiple tasks
egenskriven move id1 id2 id3 done
```

## Due Dates

Track deadlines for tasks.

### Setting Due Dates

```bash
# ISO format
egenskriven add "Task" --due 2024-03-15

# Natural language
egenskriven add "Task" --due tomorrow
egenskriven add "Task" --due "next friday"
egenskriven add "Task" --due "in 3 days"

# Update existing task
egenskriven update <ref> --due 2024-03-20

# Remove due date
egenskriven update <ref> --due ""
```

### Filtering by Due Date

```bash
# Tasks due before date
egenskriven list --due-before 2024-03-15 --json

# Tasks due after date
egenskriven list --due-after 2024-03-01 --json

# Tasks with any due date
egenskriven list --has-due --json

# Tasks without due date
egenskriven list --no-due --json

# Overdue tasks
egenskriven list --overdue --json
```

## Views and Filters

Build complex queries with filter combinations.

### Filter Options

| Filter | Description |
|--------|-------------|
| `--type bug,feature` | Filter by type (comma-separated) |
| `--priority high,urgent` | Filter by priority |
| `--column todo,in_progress` | Filter by column |
| `--label frontend` | Filter by label |
| `--epic <ref>` | Filter by epic |
| `--search "login"` | Full-text search |
| `--ready` | Unblocked tasks in todo/backlog |

### Sorting

```bash
# Sort by priority (default ascending)
egenskriven list --sort priority --json

# Sort descending (prefix with -)
egenskriven list --sort -created --json

# Available sort fields: priority, created, updated, due, title
```

### Limiting Results

```bash
# Get top 5 high priority tasks
egenskriven list --priority high --sort -priority --limit 5 --json
```

### Field Selection

Reduce output size by selecting specific fields:

```bash
# Only essential fields
egenskriven list --json --fields id,title,column

# More fields
egenskriven list --json --fields id,title,column,priority,type,blocked_by
```

## Boards

Manage multiple kanban boards for different contexts.

### Board Commands

```bash
# List all boards
egenskriven board list --json

# Create new board
egenskriven board add "Board Name" --prefix WRK

# Set default board
egenskriven board use <board-name>

# Delete board (must be empty or use --force)
egenskriven board delete <board-name>
```

### Working with Boards

```bash
# Add task to specific board
egenskriven add "Task" --board work

# List tasks from specific board
egenskriven list --board work --json

# List tasks from all boards
egenskriven list --all-boards --json
```

## Import/Export

Backup and migrate task data.

### Export

```bash
# Export as JSON
egenskriven export --format json > backup.json

# Export as CSV
egenskriven export --format csv > tasks.csv

# Export specific board
egenskriven export --board work --format json > work-backup.json
```

### Import

```bash
# Import from JSON
egenskriven import backup.json

# Merge strategy (default) - add new, update existing
egenskriven import backup.json --strategy merge

# Replace strategy - delete all, then import
egenskriven import backup.json --strategy replace
```

## Related Skills

- `egenskriven` - Core commands and task management
- `egenskriven-workflows` - Workflow modes and agent behaviors
