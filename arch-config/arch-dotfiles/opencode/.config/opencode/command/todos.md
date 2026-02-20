---
description: List project todos from persistent storage
---

Use the `todo_file` tool with `action: "list"`.

Parse `$ARGUMENTS` with these rules:
- `all` => `listStatus: "all"`
- `done` => `listStatus: "done"`
- `open` => `listStatus: "open"`
- `tag:<value>` => `tag`
- `priority:<low|medium|high>` => `priority`
- `search:<value>` => `search`

Defaults:
- `listStatus: "open"`
- `limit: 100`
- `includeBody: false`

After calling the tool, present a concise todo list grouped by status.
