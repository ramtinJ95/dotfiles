---
description: Run manual cleanup of expired done todos
---

Call the `todo_file` tool with `action: "gc"`.

Return:
- how many files were deleted
- which todo IDs were deleted (if any)
- any files that failed cleanup
