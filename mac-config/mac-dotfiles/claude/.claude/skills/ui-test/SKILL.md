---
name: ui-test
description: Run UI tests using the ui-test-engineer agent with Playwright. Use when testing web UIs, verifying UI functionality, debugging UI issues, or when the user mentions UI testing, browser testing, or end-to-end testing.
---

# UI Test Skill

Use this skill to run UI tests on web applications using the `ui-test-engineer` subagent with Playwright.

## Prerequisites

### Step 1: Ensure Dev Server is Running

Before running tests, verify the development server is running:

```bash
# Check if a common dev port is responding
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
# Or check other common ports: 3000, 8080, 5174, 5175, 5176
```

If the server is not running:
1. Find and start the dev server (usually `npm run dev` or similar)
2. Wait 2-3 seconds for startup
3. Note the actual port being used (may differ from default)

**Important**: The server may use a different port if the default is busy. Check the server output for the actual URL.

## Running Tests

Use the Task tool with `subagent_type: ui-test-engineer`:

```
Task(
  description="Test [feature name]",
  prompt="[test prompt - see templates below]",
  subagent_type="ui-test-engineer"
)
```

## Prompt Template

Use this template when calling `ui-test-engineer`:

```
Perform [TYPE OF TEST] at http://localhost:[PORT]

## Test Areas

### 1. [Feature Name]
- Step 1: [Action to perform]
- Step 2: [Action to perform]
- Expected: [What should happen]

### 2. [Feature Name]
- Step 1: [Action to perform]
- Expected: [What should happen]

## Required Output

Return a detailed report with:
1. PASS/FAIL status for each test area
2. Specific notes on any failures
3. Screenshots or evidence where relevant
4. Console error check results
```

## Required Information in Prompts

Always include:
1. **App URL**: The URL where the app is running (e.g., `http://localhost:5173`)
2. **Test Steps**: Numbered, specific actions to perform
3. **Expected Behavior**: What should happen for each step
4. **Required Output**: Request a structured report format

## Report Output Format

Request reports in this format:

```markdown
# [Test Name] Report

## Test Summary
[Brief description of what was tested]

## Environment
- **URL**: http://localhost:[PORT]
- **Browser**: Chromium (Playwright)
- **Date**: [Date]

---

## Test Results

### 1. [Feature Name] [PASS/FAIL]

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 [Test case] | [STATUS] | [Details] |
| 1.2 [Test case] | [STATUS] | [Details] |

---

## Console Errors
[List any console errors, or "No console errors"]

---

## Final Verdict

| Category | Status |
|----------|--------|
| [Category 1] | [STATUS] |
| [Category 2] | [STATUS] |

**Overall: [PASS/FAIL]**
```

## Common Test Scenarios

### Theme Testing
```
## Theme System
- Open settings (Ctrl+, or Cmd+,)
- Switch between available themes
- Verify colors change correctly for each theme
- Refresh the page - verify theme persists
```

### Keyboard Navigation Testing
```
## Keyboard Navigation
- Use Tab key to navigate through the interface
- Verify focus rings appear on focusable elements
- Verify interactive elements can be focused
- Test keyboard shortcuts
```

### Drag and Drop Testing
```
## Drag and Drop
- Drag an item
- Verify visual feedback during drag (opacity change, overlay)
- Drop the item and verify correct placement
- Verify state updates correctly
```

### Modal/Dialog Testing
```
## Modal/Dialog
- Open the modal/dialog
- Verify it can be closed with Escape key
- Verify clicking outside closes it (if applicable)
- Verify close button works
- Test form submission if applicable
```

### Form Testing
```
## Form Validation
- Submit form with empty required fields
- Verify error messages appear
- Fill in valid data and submit
- Verify success state
```

## Full E2E Test Template

For comprehensive end-to-end testing:

```
Perform a comprehensive end-to-end test of the application at http://localhost:[PORT]

## 1. Initial Load
- Navigate to the app
- Verify the page loads without errors
- Check for any console errors

## 2. Navigation
- Test all navigation links/buttons
- Verify correct pages/views load
- Test browser back/forward

## 3. Core Functionality
- [List main features to test]
- Verify CRUD operations if applicable
- Test user interactions

## 4. Responsive Design (if applicable)
- Test at different viewport sizes
- Verify mobile menu/layout if present

## 5. Error Handling
- Test invalid inputs
- Verify error messages are displayed
- Test edge cases

## 6. Accessibility
- Check keyboard navigation
- Verify focus management
- Check for proper labels

Return a detailed PASS/FAIL report for each test area.
```

## Tips

1. **Always verify the port**: Check dev server output for actual port
2. **Wait for server**: Give 2-3 seconds for startup before testing
3. **Be specific**: Provide exact actions and expected outcomes
4. **Request console check**: Always ask for console error verification
5. **Use tables**: Request tabular format for easy scanning of results
6. **Test in isolation**: Focus on one feature area per test when debugging

## Troubleshooting

### Server not responding
```bash
# Kill processes on common ports
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
# Then restart the dev server
```

### Wrong port
Check the dev server output for lines like:
```
Local:   http://localhost:5176/   <-- Use this port
```

### Tests timing out
- Ensure server is fully ready before testing
- Check for slow network requests or heavy initialization
- Consider increasing timeouts for specific actions
