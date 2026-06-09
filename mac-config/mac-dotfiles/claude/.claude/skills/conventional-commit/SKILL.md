---
name: conventional-commit
description: Create properly formatted conventional commits with type prefixes and optional scope
---

# Conventional Commit Skill

Format: `<type>(<scope>): <subject>` — follow the Conventional Commits spec.

## House rules

- Subject line: max 70 characters, imperative mood ("add" not "added"), lowercase type/scope, no trailing period
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Scope is optional; use the affected component (e.g. `auth`, `api`, `ui`)
- Breaking changes: add `!` after type/scope and explain in a `BREAKING CHANGE:` footer
- Add a body only when the subject alone can't explain the why
- Unrelated changes go in separate commits, one per logical unit of work
- NEVER include a "Co-Authored-By" line

## Todo list integration

When working through implementation todos that modify code or files, each completed todo gets its own conventional commit; mark the todo completed only after the commit succeeds. This does not apply to research, planning, or read-only todos.
