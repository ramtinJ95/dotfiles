---
description: Use the native snowflake-dbt-analyst role for Snowflake and dbt work.
---

Use the native `snowflake-dbt-analyst` role defined in
`~/.codex/agents_config.toml` and
`~/.codex/agents/snowflake-dbt-analyst.toml`.

This prompt is a command wrapper, not a second role definition.

When invoked:
- Use the `snowflake-dbt-analyst` role for Snowflake exploration and dbt model
  design.
- Keep exploratory queries constrained per the native role configuration.
