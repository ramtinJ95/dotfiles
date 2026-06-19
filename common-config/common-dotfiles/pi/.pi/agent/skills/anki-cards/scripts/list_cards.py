#!/usr/bin/env python3
"""List/search Anki notes via AnkiConnect."""

from __future__ import annotations

import argparse
import sys

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
    if args.added:
        parts.append(f"added:{args.added}")
    if args.rated:
        parts.append(f"rated:{args.rated}")
    if args.due:
        parts.append("is:due")
    if args.new:
        parts.append("is:new")
    if args.text:
        parts.append(args.text)
    return " ".join(parts) if parts else "*"


def display_note(note: dict, index: int, clean: bool) -> None:
    summary = note_summary(note)
    print(f"--- Note {index} | id={summary['noteId']} | model={summary['modelName']} ---")
    if summary["tags"]:
        print(f"Tags: {' '.join(summary['tags'])}")
    for name, value in summary["fields"].items():
        if not value.strip():
            continue
        rendered = strip_html(value) if clean else value
        print(f"{name}: {rendered}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="List/search Anki notes")
    parser.add_argument("--query", help="Raw Anki search query; overrides filters")
    parser.add_argument("--deck", help="Filter by deck")
    parser.add_argument("--tag", action="append", help="Filter by tag; repeatable")
    parser.add_argument("--text", help="Additional raw text search")
    parser.add_argument("--added", type=int, help="Notes/cards added in the last N days")
    parser.add_argument("--rated", type=int, help="Cards reviewed in the last N days")
    parser.add_argument("--due", action="store_true", help="Only due cards")
    parser.add_argument("--new", action="store_true", help="Only new cards")
    parser.add_argument("--limit", type=int, default=20, help="Max notes to display")
    parser.add_argument("--raw-html", action="store_true", help="Do not strip HTML from fields")
    args = parser.parse_args()

    try:
        query = build_query(args)
        note_ids = find_notes(query)
        print(f"Query: {query}")
        print(f"Matches: {len(note_ids)}\n")
        for index, note in enumerate(notes_info(note_ids[: args.limit]), 1):
            display_note(note, index, clean=not args.raw_html)
        print(f"Showing {min(args.limit, len(note_ids))} of {len(note_ids)} notes.")
    except AnkiConnectError as exc:
        print(f"AnkiConnect error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
