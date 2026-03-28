---
description: Compatibility alias for the native snowflake-dbt-analyst role.
---

Use the native `snowflake-dbt-analyst` role defined in
`~/.codex/agents_config.toml` and
`~/.codex/agents/snowflake-dbt-analyst.toml`.

This prompt is a thin compatibility alias. Do not redefine permissions, tools,
or behavior here; the native role file is authoritative.

When invoked:
- Use the `snowflake-dbt-analyst` role for Snowflake exploration and dbt model
  design.
- Keep exploratory queries constrained per the native role configuration.
