---
description: Reopen a closed todo
---

Reopen a todo using the `todo_file` tool with `action: "reopen"`.

Parse `$ARGUMENTS`:
- first token is `id`
- optional second token can be `pending` or `in_progress` and should map to `status`

If `id` is missing or ambiguous, ask one focused question.

Return the reopened todo summary.
