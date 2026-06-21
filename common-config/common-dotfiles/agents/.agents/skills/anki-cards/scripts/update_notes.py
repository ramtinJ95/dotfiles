#!/usr/bin/env python3
"""Preview or apply updates to existing Anki notes.

JSON shape:
{
  "updates": [
    {
      "noteId": 123,
      "fields": {"Front": "...", "Back": "..."},
      "addTags": ["tag1"],
      "removeTags": ["tag2"]
    }
  ]
}

By default this is a dry run. Use --commit after user approval.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from anki_connect import (
    AnkiConnectError,
    add_tags,
    notes_info,
    print_json,
    remove_tags,
    update_note_fields,
)


def load_updates(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    updates = data.get("updates") if isinstance(data, dict) else data
    if not isinstance(updates, list):
        raise ValueError("Expected a JSON array or an object with an 'updates' array")
    for index, update in enumerate(updates, 1):
        if not isinstance(update, dict):
            raise ValueError(f"Update {index} is not an object")
        if "noteId" not in update and "id" not in update:
            raise ValueError(f"Update {index} is missing noteId")
    return updates


def normalized(update: dict[str, Any]) -> dict[str, Any]:
    return {
        "noteId": int(update.get("noteId", update.get("id"))),
        "fields": update.get("fields", {}),
        "addTags": update.get("addTags", []),
        "removeTags": update.get("removeTags", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview or apply Anki note updates")
    parser.add_argument("json_file", type=Path, help="Path to update JSON")
    parser.add_argument("--commit", action="store_true", help="Actually update notes")
    args = parser.parse_args()

    try:
        updates = [normalized(update) for update in load_updates(args.json_file)]
        note_ids = [update["noteId"] for update in updates]
        existing = notes_info(note_ids)
        if len(existing) != len(note_ids):
            print("Warning: Anki returned a different number of notes than requested.", file=sys.stderr)

        print("Proposed updates:")
        print_json(updates)
        print("Existing notes:")
        print_json(existing)

        if not args.commit:
            print("Dry run only. Re-run with --commit after user approval to update notes.")
            return

        for update in updates:
            note_id = update["noteId"]
            if update["fields"]:
                update_note_fields(note_id, update["fields"])
            if update["addTags"]:
                add_tags([note_id], update["addTags"])
            if update["removeTags"]:
                remove_tags([note_id], update["removeTags"])
        print(f"Updated {len(updates)} notes.")
    except (AnkiConnectError, ValueError, json.JSONDecodeError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
