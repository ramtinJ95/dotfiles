---
description: Use the native ui-test-engineer role for UI investigation.
---

Use the native `ui-test-engineer` role defined in
`~/.codex/agents_config.toml` and `~/.codex/agents/ui-test-engineer.toml`.

This prompt is a command wrapper, not a second role definition.

When invoked:
- Use the `ui-test-engineer` role for UI investigation and browser automation.
- Prefer `playwright-cli` workflows and structured findings from the native
  role configuration.
