---
description: Create a new persistent todo
---

Create a todo with the `todo_file` tool using `action: "create"`.

Use `$ARGUMENTS` as the title.
If the title is missing, ask one focused question for the title.

Defaults:
- `priority: "medium"`
- `status: "pending"`

Return the new todo ID and title.
