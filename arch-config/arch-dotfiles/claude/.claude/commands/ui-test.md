---
description: Run UI tests using the ui-test-engineer agent with Playwright
argument-hint: [url] [test-type]
---

Use the ui-test skill to run UI tests on the web application.

**Arguments:**
- `$1` - URL to test (default: http://localhost:5173)
- `$2` - Test type: "full", "theme", "keyboard", "dragdrop", "modal", "form" (default: full)

**Examples:**
- `/ui-test` - Run full E2E test on localhost:5173
- `/ui-test http://localhost:3000` - Test on different port
- `/ui-test http://localhost:5173 theme` - Test only theme functionality

First, verify the dev server is running at the specified URL. If arguments are provided:
- URL: $1
- Test type: $2

Then use the ui-test skill to run the appropriate tests and return a structured PASS/FAIL report.
