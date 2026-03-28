---
description: Use the native docs-researcher role for documentation research.
---

Use the native `docs-researcher` role defined in `~/.codex/agents_config.toml`
and `~/.codex/agents/docs-researcher.toml`.

This prompt is a command wrapper, not a second role definition.

When invoked:
- Use the `docs-researcher` role for current documentation, official-source
  verification, and GitHub implementation evidence.
- Return concise cited findings to the calling agent.
