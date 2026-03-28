---
description: Run UI tests by invoking the native ui-test-engineer role.
argument-hint: [url] [test-type]
---

Use the native `ui-test-engineer` role for this task.

Arguments:
- `$1` - URL to test (default: http://localhost:5173)
- `$2` - Test type: "full", "theme", "keyboard", "dragdrop", "modal", "form"
  (default: full)

First, verify the dev server is running at the specified URL. If arguments are
provided:
- URL: $1
- Test type: $2

Then use the native `ui-test-engineer` role to run the relevant
`playwright-cli` checks and return a structured PASS/FAIL report.
