---
description: Close a todo as completed or cancelled
---

Close a todo using the `todo_file` tool with `action: "close"`.

Parse `$ARGUMENTS`:
- first token is `id`
- optional second token can be `completed` or `cancelled` and should map to `status`

If `id` is missing or ambiguous, ask one focused question.

Return the closed todo summary.
