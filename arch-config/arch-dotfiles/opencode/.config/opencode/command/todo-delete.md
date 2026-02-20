---
description: Delete a todo file by ID
---

Delete a todo using the `todo_file` tool with `action: "delete"`.

Parse `$ARGUMENTS`:
- first token is `id`

If `id` is missing or ambiguous, ask one focused question.

Before deleting, confirm with the user once unless they already made clear they want deletion.
