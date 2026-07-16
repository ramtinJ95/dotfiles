---
name: conventional-commit
description: Create conventional commits with optional scopes.
---

# Conventional Commit Skill

Use this skill when creating git commits to ensure consistent, meaningful commit messages that follow the Conventional Commits specification.

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Required Elements

- **type**: The category of change (see types below)
- **subject**: Brief description in imperative mood ("add" not "added")

### Optional Elements

- **scope**: Component or area affected (e.g., `auth`, `api`, `ui`)
- **body**: Detailed explanation if needed
- **footer**: Breaking changes or issue references

## Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): add OAuth2 login` |
| `fix` | Bug fix | `fix(api): handle null response` |
| `docs` | Documentation only | `docs: update README installation` |
| `style` | Formatting, no code change | `style: fix indentation in utils` |
| `refactor` | Code change, no new feature/fix | `refactor(db): simplify query builder` |
| `perf` | Performance improvement | `perf: cache expensive calculation` |
| `test` | Adding/fixing tests | `test(auth): add login unit tests` |
| `build` | Build system or dependencies | `build: upgrade typescript to 5.0` |
| `ci` | CI configuration | `ci: add GitHub Actions workflow` |
| `chore` | Maintenance tasks | `chore: update .gitignore` |
| `revert` | Revert previous commit | `revert: revert feat(auth) commit` |

## Rules

1. **Subject line**: Max 70 characters, no period at end
2. **Imperative mood**: "add feature" not "added feature" or "adds feature"
3. **Lowercase**: Type and scope are lowercase
4. **Breaking changes**: Add `!` after type/scope and explain in footer
   ```
   feat(api)!: change authentication flow

   BREAKING CHANGE: API now requires Bearer token instead of API key
   ```

## Workflow

1. Stage your changes: `git add <files>`
2. Review what's staged: `git diff --cached`
3. Determine the appropriate type based on the change
4. Write commit message following the format
5. Create the commit

## Examples

**Simple feature:**
```
feat: add dark mode toggle
```

**Bug fix with scope:**
```
fix(auth): prevent session timeout on active users
```

**Breaking change:**
```
feat(api)!: migrate to v2 endpoints

BREAKING CHANGE: All v1 endpoints are now deprecated.
Migrate to /api/v2/* endpoints before next major release.

Closes #123
```

**Multiple changes (prefer separate commits):**
If you have unrelated changes, create separate commits for each logical unit of work.
