---
name: python-lint
description: Validate and auto-fix Python linting, formatting, and type issues using ruff and ty
---

# Python Lint Skill

Use this skill to validate and fix Python code quality issues using `ruff` (linting/formatting) and `ty` (type checking).

## Scope

Only operate on Python files that have been changed. Get the list of changed files with:

```bash
# Get both staged and unstaged changed Python files
git diff --name-only --diff-filter=d HEAD -- '*.py'
```

If there are no changed Python files, report that and stop.

## Step 1: Run Ruff Check (Linting)

First, check for linting issues on the changed files:

```bash
ruff check <files>
```

If issues are found:
1. Report the issues to the user
2. Ask if they want to auto-fix with `ruff check --fix <files>`
3. If approved, run the fix command

## Step 2: Run Ruff Format (Formatting)

Check formatting issues:

```bash
ruff format --check <files>
```

If formatting issues are found:
1. Report which files need formatting
2. Ask if they want to auto-fix with `ruff format <files>`
3. If approved, run the format command

## Step 3: Run ty (Type Checking)

Run type checking on the changed files:

```bash
ty check <files>
```

If type errors are found:
1. Report all type errors to the user
2. Ask if they want you to attempt manual fixes
3. If approved, analyze and fix the type errors

## Output Format

After each step, provide a summary:

```
## Linting (ruff check)
- Files checked: X
- Issues found: Y
- Issues fixed: Z

## Formatting (ruff format)
- Files checked: X
- Files reformatted: Y

## Type Checking (ty)
- Files checked: X
- Errors found: Y
- Errors fixed: Z
```

## Important Notes

- Always run checks before fixes to show the user what will change
- Ask for confirmation before each auto-fix operation
- If a tool is not installed, report it and skip that step
- Do not commit changes - let the user decide when to commit
