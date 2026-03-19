#!/usr/bin/env python3
"""Estimate API-equivalent Codex usage cost from local session JSONL files."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


SESSIONS_ROOT = Path.home() / ".codex" / "sessions"
DEFAULT_OUTPUT_PATH = Path("/tmp/codex_cost_estimate_threads.tsv")
DATE_FORMAT = "%Y-%m-%d"

RATES_PER_MILLION = {
    "gpt-5.4": {
        "input": Decimal("2.50"),
        "cached": Decimal("0.25"),
        "output": Decimal("15.00"),
    },
    "gpt-5.3-codex": {
        "input": Decimal("1.75"),
        "cached": Decimal("0.175"),
        "output": Decimal("14.00"),
    },
    "gpt-5.1-codex": {
        "input": Decimal("1.25"),
        "cached": Decimal("0.125"),
        "output": Decimal("10.00"),
    },
    "gpt-5.1-codex-max": {
        "input": Decimal("1.25"),
        "cached": Decimal("0.125"),
        "output": Decimal("10.00"),
    },
}

RATE_SNAPSHOT = "2026-03-07 official OpenAI API pricing snapshot"


@dataclass
class Usage:
    input_tokens: int
    cached_input_tokens: int
    output_tokens: int
    total_tokens: int

    @property
    def uncached_input_tokens(self) -> int:
        return max(0, self.input_tokens - self.cached_input_tokens)


@dataclass
class ThreadRecord:
    thread_id: str
    created_at: datetime
    created_at_raw: str
    source_class: str
    model: str | None
    cwd: str
    title: str | None
    usage: Usage | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Estimate API-equivalent Codex usage cost from local session data."
    )
    parser.add_argument(
        "--sessions-root",
        type=Path,
        default=SESSIONS_ROOT,
        help="Codex sessions root. Defaults to ~/.codex/sessions.",
    )
    parser.add_argument(
        "--last-days",
        type=int,
        default=14,
        help="Trailing day window to include when --start is omitted. Defaults to 14.",
    )
    parser.add_argument(
        "--start",
        help="Inclusive start date in YYYY-MM-DD. Overrides --last-days.",
    )
    parser.add_argument(
        "--end",
        help="Inclusive end date in YYYY-MM-DD. Defaults to today when --start is used.",
    )
    parser.add_argument(
        "--scope",
        choices=("cli-only", "all-except-memory", "all-activity"),
        default="all-except-memory",
        help="How much local activity to include. Defaults to all-except-memory.",
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format. Defaults to text.",
    )
    parser.add_argument(
        "--write-thread-report",
        nargs="?",
        const=str(DEFAULT_OUTPUT_PATH),
        default=None,
        help="Write per-thread TSV output. Defaults to /tmp/codex_cost_estimate_threads.tsv.",
    )
    return parser.parse_args()


def parse_date_start(date_text: str) -> datetime:
    return datetime.strptime(date_text, DATE_FORMAT).replace(tzinfo=UTC)


def parse_date_end_exclusive(date_text: str) -> datetime:
    return parse_date_start(date_text) + timedelta(days=1)


def determine_window(args: argparse.Namespace) -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    today = now.date()

    if args.start:
        start = parse_date_start(args.start)
        end_date = args.end or today.strftime(DATE_FORMAT)
        end = parse_date_end_exclusive(end_date)
        return start, end

    return now - timedelta(days=args.last_days), now


def parse_source_class(source: Any, agent_role: str | None) -> str:
    if isinstance(source, dict):
        subagent = source.get("subagent")
        if subagent == "memory_consolidation":
            return "memory_consolidation"
        if subagent == "review":
            return "review"
        if isinstance(subagent, dict) and "thread_spawn" in subagent:
            spawned_role = subagent["thread_spawn"].get("agent_role") or agent_role or "spawned"
            return f"spawned:{spawned_role}"
        return "other_subagent"
    if isinstance(source, str) and source:
        return source
    return "unknown"


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def extract_thread_record(path: Path, start: datetime, end: datetime) -> ThreadRecord | None:
    session_meta: dict[str, Any] | None = None
    model: str | None = None
    last_usage: Usage | None = None

    with path.open() as handle:
        for line in handle:
            item = json.loads(line)
            item_type = item.get("type")
            payload = item.get("payload")
            if item_type == "session_meta":
                if not isinstance(payload, dict):
                    return None
                created_at = parse_datetime(payload["timestamp"])
                if created_at < start or created_at >= end:
                    return None
                session_meta = payload
                continue

            if session_meta is None or not isinstance(payload, dict):
                continue

            if item_type == "turn_context" and model is None:
                model = payload.get("model")
                continue

            if item_type == "event_msg" and payload.get("type") == "token_count":
                info = payload.get("info") or {}
                total_usage = info.get("total_token_usage")
                if isinstance(total_usage, dict):
                    last_usage = Usage(
                        input_tokens=int(total_usage.get("input_tokens", 0)),
                        cached_input_tokens=int(total_usage.get("cached_input_tokens", 0)),
                        output_tokens=int(total_usage.get("output_tokens", 0)),
                        total_tokens=int(total_usage.get("total_tokens", 0)),
                    )

    if session_meta is None:
        return None

    return ThreadRecord(
        thread_id=session_meta["id"],
        created_at=parse_datetime(session_meta["timestamp"]),
        created_at_raw=session_meta["timestamp"],
        source_class=parse_source_class(session_meta.get("source"), session_meta.get("agent_role")),
        model=model,
        cwd=session_meta.get("cwd", ""),
        title=session_meta.get("title"),
        usage=last_usage,
    )


def load_threads(sessions_root: Path, start: datetime, end: datetime) -> list[ThreadRecord]:
    if not sessions_root.exists():
        raise FileNotFoundError(f"sessions root not found: {sessions_root}")

    records: list[ThreadRecord] = []
    for path in sorted(sessions_root.glob("*/*/*/*.jsonl")):
        record = extract_thread_record(path, start, end)
        if record is not None:
            records.append(record)
    return records


def include_record(record: ThreadRecord, scope: str) -> bool:
    if record.usage is None:
        return False
    if scope == "cli-only":
        return record.source_class == "cli"
    if scope == "all-except-memory":
        return record.source_class != "memory_consolidation"
    return True


def estimate_cost(record: ThreadRecord) -> Decimal | None:
    if record.usage is None or record.model not in RATES_PER_MILLION:
        return None

    usage = record.usage
    rates = RATES_PER_MILLION[record.model]
    micros = (
        Decimal(usage.uncached_input_tokens) * rates["input"]
        + Decimal(usage.cached_input_tokens) * rates["cached"]
        + Decimal(usage.output_tokens) * rates["output"]
    )
    return micros / Decimal(1_000_000)


def quantize(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def aggregate(records: list[ThreadRecord], scope: str) -> dict[str, Any]:
    included = [record for record in records if include_record(record, scope)]
    missing_usage = [record for record in records if record.usage is None]
    included_with_known_rates = [r for r in included if r.model in RATES_PER_MILLION]
    excluded_unknown_rates = [r for r in included if r.model not in RATES_PER_MILLION]

    totals = {
        "threads": len(included_with_known_rates),
        "uncached_input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "input_cost_usd": Decimal("0"),
        "cached_cost_usd": Decimal("0"),
        "output_cost_usd": Decimal("0"),
        "total_cost_usd": Decimal("0"),
    }
    by_model: dict[str, Decimal] = {}
    by_source_class: dict[str, Decimal] = {}
    per_thread_rows: list[dict[str, Any]] = []

    for record in included_with_known_rates:
        usage = record.usage
        assert usage is not None
        rates = RATES_PER_MILLION[record.model]
        input_cost = Decimal(usage.uncached_input_tokens) * rates["input"] / Decimal(1_000_000)
        cached_cost = Decimal(usage.cached_input_tokens) * rates["cached"] / Decimal(1_000_000)
        output_cost = Decimal(usage.output_tokens) * rates["output"] / Decimal(1_000_000)
        total_cost = input_cost + cached_cost + output_cost

        totals["uncached_input_tokens"] += usage.uncached_input_tokens
        totals["cached_input_tokens"] += usage.cached_input_tokens
        totals["output_tokens"] += usage.output_tokens
        totals["total_tokens"] += usage.total_tokens
        totals["input_cost_usd"] += input_cost
        totals["cached_cost_usd"] += cached_cost
        totals["output_cost_usd"] += output_cost
        totals["total_cost_usd"] += total_cost

        by_model[record.model] = by_model.get(record.model, Decimal("0")) + total_cost
        by_source_class[record.source_class] = by_source_class.get(record.source_class, Decimal("0")) + total_cost

        per_thread_rows.append(
            {
                "thread_id": record.thread_id,
                "created_at": record.created_at_raw,
                "source_class": record.source_class,
                "model": record.model,
                "cwd": record.cwd,
                "uncached_input_tokens": usage.uncached_input_tokens,
                "cached_input_tokens": usage.cached_input_tokens,
                "output_tokens": usage.output_tokens,
                "total_tokens": usage.total_tokens,
                "estimated_cost_usd": quantize(total_cost),
            }
        )

    per_thread_rows.sort(key=lambda row: Decimal(row["estimated_cost_usd"]), reverse=True)

    return {
        "included_threads": totals["threads"],
        "threads_in_window": len(records),
        "threads_missing_usage": len(missing_usage),
        "threads_excluded_unknown_rates": len(excluded_unknown_rates),
        "rate_snapshot": RATE_SNAPSHOT,
        "totals": {
            "uncached_input_tokens": totals["uncached_input_tokens"],
            "cached_input_tokens": totals["cached_input_tokens"],
            "output_tokens": totals["output_tokens"],
            "total_tokens": totals["total_tokens"],
            "input_cost_usd": quantize(totals["input_cost_usd"]),
            "cached_cost_usd": quantize(totals["cached_cost_usd"]),
            "output_cost_usd": quantize(totals["output_cost_usd"]),
            "total_cost_usd": quantize(totals["total_cost_usd"]),
        },
        "by_model_usd": {
            name: quantize(value)
            for name, value in sorted(by_model.items(), key=lambda item: item[1], reverse=True)
        },
        "by_source_class_usd": {
            name: quantize(value)
            for name, value in sorted(by_source_class.items(), key=lambda item: item[1], reverse=True)
        },
        "per_thread_rows": per_thread_rows,
    }


def write_thread_report(path: Path, rows: list[dict[str, Any]]) -> None:
    header = [
        "thread_id",
        "created_at",
        "source_class",
        "model",
        "cwd",
        "uncached_input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "total_tokens",
        "estimated_cost_usd",
    ]
    lines = ["\t".join(header)]
    for row in rows:
        lines.append("\t".join(str(row[column]) for column in header))
    path.write_text("\n".join(lines) + "\n")


def render_text(result: dict[str, Any], start: datetime, end: datetime, scope: str) -> str:
    totals = result["totals"]
    lines = [
        f"Window: {start.isoformat()} to {end.isoformat()}",
        f"Scope: {scope}",
        f"Rate snapshot: {result['rate_snapshot']}",
        (
            "Threads: "
            f"{result['included_threads']} included, "
            f"{result['threads_in_window']} in window, "
            f"{result['threads_missing_usage']} missing token_count, "
            f"{result['threads_excluded_unknown_rates']} with unknown rates"
        ),
        "",
        "Totals:",
        f"  uncached_input_tokens: {totals['uncached_input_tokens']}",
        f"  cached_input_tokens:   {totals['cached_input_tokens']}",
        f"  output_tokens:         {totals['output_tokens']}",
        f"  total_tokens:          {totals['total_tokens']}",
        f"  input_cost_usd:        {totals['input_cost_usd']}",
        f"  cached_cost_usd:       {totals['cached_cost_usd']}",
        f"  output_cost_usd:       {totals['output_cost_usd']}",
        f"  total_cost_usd:        {totals['total_cost_usd']}",
        "",
        "By model:",
    ]
    for name, value in result["by_model_usd"].items():
        lines.append(f"  {name}: {value}")
    lines.append("")
    lines.append("By source class:")
    for name, value in result["by_source_class_usd"].items():
        lines.append(f"  {name}: {value}")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    start, end = determine_window(args)
    records = load_threads(args.sessions_root.expanduser(), start, end)
    result = aggregate(records, args.scope)

    if args.write_thread_report:
        write_thread_report(Path(args.write_thread_report), result["per_thread_rows"])

    if args.format == "json":
        print(
            json.dumps(
                {
                    "window": {
                        "start": start.isoformat(),
                        "end_exclusive": end.isoformat(),
                    },
                    "scope": args.scope,
                    **{key: value for key, value in result.items() if key != "per_thread_rows"},
                },
                indent=2,
            )
        )
        return 0

    print(render_text(result, start, end, args.scope))
    if args.write_thread_report:
        print(f"\nThread report written to: {Path(args.write_thread_report)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
