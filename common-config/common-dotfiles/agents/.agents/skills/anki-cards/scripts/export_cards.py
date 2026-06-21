#!/usr/bin/env python3
"""Export Anki notes to Markdown or JSON for review/discussion."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from anki_connect import AnkiConnectError, find_notes, note_summary, notes_info, strip_html


def build_query(args: argparse.Namespace) -> str:
    if args.query:
        return args.query
    parts = []
    if args.deck:
        parts.append(f'deck:"{args.deck}"')
    if args.tag:
        for tag in args.tag:
            parts.append(f"tag:{tag}")
    if args.text:
        parts.append(args.text)
    if args.added:
        parts.append(f"added:{args.added}")
    if args.rated:
        parts.append(f"rated:{args.rated}")
    if args.due:
        parts.append("is:due")
    if args.new:
        parts.append("is:new")
    return " ".join(parts) if parts else "*"


def clean_note(note: dict[str, Any], keep_html: bool = False) -> dict[str, Any]:
    summary = note_summary(note)
    fields = summary["fields"] if keep_html else {
        name: strip_html(value) for name, value in summary["fields"].items()
    }
    return {
        "noteId": summary["noteId"],
        "modelName": summary["modelName"],
        "tags": summary["tags"],
        "fields": fields,
    }


def render_markdown(query: str, notes: list[dict[str, Any]]) -> str:
    lines = ["# Exported Anki Notes", "", f"Query: `{query}`", f"Count: {len(notes)}", ""]
    for index, note in enumerate(notes, 1):
        lines.extend([
            f"## {index}. Note {note['noteId']} ({note['modelName']})",
            "",
        ])
        if note["tags"]:
            lines.extend([f"Tags: `{' '.join(note['tags'])}`", ""])
        for name, value in note["fields"].items():
            if str(value).strip():
                lines.extend([f"### {name}", "", str(value).strip(), ""])
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Anki notes for review/discussion")
    parser.add_argument("--query", help="Raw Anki search query; overrides filters")
    parser.add_argument("--deck", help="Filter by deck")
    parser.add_argument("--tag", action="append", help="Filter by tag; repeatable")
    parser.add_argument("--text", help="Additional raw text search")
    parser.add_argument("--added", type=int, help="Notes/cards added in the last N days")
    parser.add_argument("--rated", type=int, help="Cards reviewed in the last N days")
    parser.add_argument("--due", action="store_true", help="Only due cards")
    parser.add_argument("--new", action="store_true", help="Only new cards")
    parser.add_argument("--limit", type=int, default=100, help="Max notes to export")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    parser.add_argument("--raw-html", action="store_true", help="Keep raw HTML in fields")
    parser.add_argument("--output", type=Path, help="Write output to file instead of stdout")
    args = parser.parse_args()

    try:
        query = build_query(args)
        note_ids = find_notes(query)[: args.limit]
        exported = [clean_note(note, keep_html=args.raw_html) for note in notes_info(note_ids)]
        if args.format == "json":
            output = json.dumps({"query": query, "notes": exported}, indent=2, ensure_ascii=False) + "\n"
        else:
            output = render_markdown(query, exported)
        if args.output:
            args.output.write_text(output)
            print(f"Exported {len(exported)} notes to {args.output}")
        else:
            print(output, end="")
    except AnkiConnectError as exc:
        print(f"AnkiConnect error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
