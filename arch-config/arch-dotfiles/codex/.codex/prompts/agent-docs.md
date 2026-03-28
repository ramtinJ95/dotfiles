---
description: Compatibility alias for the native docs-researcher role.
---

Use the native `docs-researcher` role defined in `~/.codex/agents_config.toml`
and `~/.codex/agents/docs-researcher.toml`.

This prompt is a thin compatibility alias. Do not redefine permissions, tools,
or behavior here; the native role file is authoritative.

When invoked:
- Use the `docs-researcher` role for current documentation, official-source
  verification, and GitHub implementation evidence.
- Return concise cited findings to the calling agent.
