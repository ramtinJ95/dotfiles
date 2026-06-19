#!/usr/bin/env python3
"""Validate or add Anki notes from a JSON file.

The JSON file can be either:
  [{...note...}, {...note...}]
or:
  {"notes": [{...note...}, {...note...}]}

By default this performs a dry run with canAddNotes. Use --commit to write.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from anki_connect import AnkiConnectError, add_notes, can_add_notes, print_json


def load_notes(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    notes = data.get("notes") if isinstance(data, dict) else data
    if not isinstance(notes, list):
        raise ValueError("Expected a JSON array or an object with a 'notes' array")
    for index, note in enumerate(notes, 1):
        if not isinstance(note, dict):
            raise ValueError(f"Note {index} is not an object")
    return notes


def brief(note: dict[str, Any]) -> dict[str, Any]:
    fields = note.get("fields", {})
    front = fields.get("Front") or fields.get("Text") or next(iter(fields.values()), "")
    return {
        "deckName": note.get("deckName"),
        "modelName": note.get("modelName"),
        "frontOrText": str(front)[:160],
        "tags": note.get("tags", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate or add Anki notes from JSON")
    parser.add_argument("json_file", type=Path, help="Path to JSON notes file")
    parser.add_argument("--commit", action="store_true", help="Actually add notes to Anki")
    args = parser.parse_args()

    try:
        notes = load_notes(args.json_file)
        print(f"Loaded {len(notes)} notes from {args.json_file}")
        print_json([brief(note) for note in notes])

        can_add = can_add_notes(notes)
        print("canAddNotes:")
        print_json(can_add)
        if not all(can_add):
            print("At least one note cannot be added. Fix or remove failing notes before committing.")
            raise SystemExit(1)

        if not args.commit:
            print("Dry run only. Re-run with --commit after user approval to add notes.")
            return

        note_ids = add_notes(notes)
        print("Created note IDs:")
        print_json(note_ids)
    except (AnkiConnectError, ValueError, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
