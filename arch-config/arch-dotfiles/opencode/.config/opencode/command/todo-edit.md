---
description: Edit fields of an existing todo
---

Update a todo using the `todo_file` tool with `action: "update"`.

Interpret `$ARGUMENTS` as:
- first token: `id`
- remaining text: new title by default

If the user explicitly includes field directives, map them when present:
- `priority:<low|medium|high>` => `priority`
- `status:<pending|in_progress|completed|cancelled>` => `status`
- `tags:a,b,c` => `tags`

If arguments are incomplete, ask one focused clarifying question.

Return the updated todo summary.
