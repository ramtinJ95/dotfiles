---
name: ui-test
description: Run UI tests using playwright-cli Bash commands. Use when testing web UIs, verifying UI functionality, debugging UI issues, or when the user mentions UI testing, browser testing, or end-to-end testing.
---

# UI Test Skill — Playwright CLI

Use `playwright-cli` Bash commands to test web applications. Snapshots are saved to disk as YAML/PNG files and read on demand, which keeps the workflow lightweight.

## Prerequisites

1. `playwright-cli` must be installed globally: `npm install -g @playwright/cli@latest`
2. Workspace initialized: `playwright-cli install` (creates `.playwright/cli.config.json`)

### Ensure Dev Server is Running

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Or check other common ports: 3000, 8080, 5174, 5175, 5176
```

## Core Commands Reference

| Command | Example | Description |
|---|---|---|
| `open [url]` | `playwright-cli open http://localhost:5173` | Open browser and navigate |
| `close` | `playwright-cli close` | Close the browser |
| `snapshot` | `playwright-cli snapshot` | Capture page as YAML with element refs (e1, e2, ...) |
| `screenshot` | `playwright-cli screenshot` | Save PNG screenshot to disk |
| `click <ref>` | `playwright-cli click e3` | Click an element by ref |
| `dblclick <ref>` | `playwright-cli dblclick e7` | Double-click |
| `fill <ref> <text>` | `playwright-cli fill e5 "user@example.com"` | Fill input field |
| `type <text>` | `playwright-cli type "search query"` | Type into focused element |
| `select <ref> <val>` | `playwright-cli select e9 "option-value"` | Select dropdown option |
| `hover <ref>` | `playwright-cli hover e4` | Hover over element |
| `check/uncheck <ref>` | `playwright-cli check e12` | Toggle checkbox/radio |
| `press <key>` | `playwright-cli press Tab` | Press a key |
| `drag <from> <to>` | `playwright-cli drag e2 e8` | Drag and drop |
| `eval <js> [ref]` | `playwright-cli eval "document.title"` | Run JavaScript |
| `console` | `playwright-cli console` | Show console messages |
| `network` | `playwright-cli network` | List network requests |
| `goto <url>` | `playwright-cli goto http://localhost:5173/about` | Navigate to URL |
| `go-back` | `playwright-cli go-back` | Navigate back |
| `reload` | `playwright-cli reload` | Reload page |
| `resize <w> <h>` | `playwright-cli resize 375 812` | Resize viewport |
| `tab-new [url]` | `playwright-cli tab-new http://localhost:5173` | Open new tab |
| `tab-list` | `playwright-cli tab-list` | List tabs |

## Testing Workflow

The standard workflow is:

```bash
# 1. Open the app
playwright-cli open http://localhost:5173

# 2. Take a snapshot to see element refs
playwright-cli snapshot
# Output: e1 [link "Home"], e2 [button "Login"], e3 [textbox "Email"], ...

# 3. Interact using element refs
playwright-cli click e2
playwright-cli fill e3 "user@example.com"

# 4. Snapshot again to verify state change
playwright-cli snapshot

# 5. Check for console errors
playwright-cli console

# 6. Screenshot for evidence
playwright-cli screenshot

# 7. Close when done
playwright-cli close
```

Snapshots are saved to `.playwright-cli/` as `.yml` files. Screenshots are saved as `.png` files. Read them with the Read tool only when needed — this is what saves tokens.

## Running Tests

Run `playwright-cli` commands directly via the Bash tool.

### Example: Login Form Test

```bash
playwright-cli open http://localhost:5173/login
playwright-cli snapshot
# Identify form elements from snapshot output
playwright-cli fill e1 ""
playwright-cli click e3  # submit button
playwright-cli snapshot   # check for validation errors
playwright-cli fill e1 "valid@email.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot   # verify redirect/success
playwright-cli console    # check for errors
playwright-cli close
```

## Common Test Scenarios

### Theme Testing
```bash
playwright-cli open http://localhost:5173
playwright-cli snapshot
# Find settings/theme toggle element
playwright-cli click e<settings-ref>
playwright-cli snapshot
playwright-cli click e<theme-option-ref>
playwright-cli snapshot  # verify theme changed
playwright-cli reload
playwright-cli snapshot  # verify theme persists
```

### Responsive Design
```bash
playwright-cli open http://localhost:5173
playwright-cli resize 375 812   # mobile
playwright-cli snapshot
playwright-cli screenshot
playwright-cli resize 1920 1080 # desktop
playwright-cli snapshot
playwright-cli screenshot
```

### Keyboard Navigation
```bash
playwright-cli open http://localhost:5173
playwright-cli press Tab
playwright-cli snapshot  # check focus
playwright-cli press Tab
playwright-cli snapshot  # check next focus
playwright-cli press Enter  # activate focused element
playwright-cli snapshot
```

### Drag and Drop
```bash
playwright-cli open http://localhost:5173
playwright-cli snapshot
playwright-cli drag e2 e8
playwright-cli snapshot  # verify new order
```

## Report Format

After testing, summarize results as:

```
## Test Results

| Test Area | Status | Notes |
|-----------|--------|-------|
| Initial load | PASS/FAIL | ... |
| Form validation | PASS/FAIL | ... |
| Navigation | PASS/FAIL | ... |

Console errors: [none / list]
Overall: PASS/FAIL
```

## Troubleshooting

### Server not responding
```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null
# Then restart the dev server
```

### Stale browser sessions
```bash
playwright-cli kill-all  # kill zombie processes
```

### Need to persist auth state
```bash
playwright-cli state-save auth-state.json
# Later:
playwright-cli state-load auth-state.json
```
