---
name: codex-cost-estimator
description: Estimate API-equivalent Codex usage cost from local session JSONL data for a user-supplied date range. Use when the user wants a spend estimate, token breakdown, or date-bounded cost report from this machine's Codex history, not for generic OpenAI pricing questions.
---

# Codex Cost Estimator

## Overview

Use this skill to estimate Codex API-equivalent cost from local `~/.codex/sessions` data without depending on hosted billing exports. It supports date-bounded reports, scope selection, and per-thread breakdown output.

## Inputs To Collect

Capture these before running the script:
- Date range: either `last N days` or explicit `start` and `end` dates
- Scope:
  `all-except-memory` (recommended) includes CLI threads and spawned agents but excludes automatic memory consolidation
  `cli-only` includes only top-level CLI threads
  `all-activity` includes everything in the local session logs
- Whether the user wants a quick headline number or the full breakdown

If the user does not specify scope, recommend `all-except-memory`. If the user does not specify dates, default to `--last-days 14`.

## Workflow

1. Run the bundled script instead of re-parsing the session JSONL by hand.
2. Prefer one of these forms:

```bash
python ~/.codex/skills/codex-cost-estimator/scripts/estimate_codex_api_cost.py --last-days 14 --scope all-except-memory
python ~/.codex/skills/codex-cost-estimator/scripts/estimate_codex_api_cost.py --start 2026-03-01 --end 2026-03-07 --scope cli-only
```

3. Add `--write-thread-report` when the user wants a TSV report under `/tmp`.
4. Return the scope, the total estimate, and the main caveats:
   local session data only
   API-equivalent list-price estimate, not the actual invoice
   token-based estimate only, excluding any separate tool charges
5. If pricing freshness matters, verify current OpenAI rates from official docs before quoting a final number.

## Script Behavior

- The script reads `event_msg` entries of type `token_count` from `~/.codex/sessions`.
- It uses the latest cumulative `total_token_usage` per thread, not the weaker SQLite summary field.
- It prices uncached input, cached input, and output separately using a built-in rate snapshot.
- Date-only `--start` and `--end` values use UTC calendar boundaries because session timestamps are stored in UTC.

## Output Contract

Respond with:
1. The date range and scope used
2. The estimated total cost
3. The token breakdown if it adds value
4. Any missing-thread or stale-pricing caveats
5. The report path if `--write-thread-report` was used
