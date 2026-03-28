---
description: Compatibility alias for the native ui-test-engineer role.
---

Use the native `ui-test-engineer` role defined in
`~/.codex/agents_config.toml` and `~/.codex/agents/ui-test-engineer.toml`.

This prompt is a thin compatibility alias. Do not redefine permissions, tools,
or behavior here; the native role file is authoritative.

When invoked:
- Use the `ui-test-engineer` role for UI investigation and browser automation.
- Prefer `playwright-cli` workflows and structured findings from the native
  role configuration.
