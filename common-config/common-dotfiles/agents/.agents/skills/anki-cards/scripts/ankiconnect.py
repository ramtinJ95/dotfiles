#!/usr/bin/env python3
"""Low-level AnkiConnect CLI for the anki-cards skill."""

from __future__ import annotations

import json
import sys

from anki_connect import (
    AnkiConnectError,
    deck_names,
    find_notes,
    model_field_names,
    model_names,
    notes_info,
    print_json,
    request,
    version,
)


def usage() -> None:
    print(
        "Usage:\n"
        "  ankiconnect.py version\n"
        "  ankiconnect.py deck-names\n"
        "  ankiconnect.py model-names\n"
        "  ankiconnect.py model-fields <model>\n"
        "  ankiconnect.py find <query>\n"
        "  ankiconnect.py info <note-id> [<note-id> ...]\n"
        "  ankiconnect.py call <action> [json-params]\n",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main(argv: list[str]) -> None:
    if len(argv) < 2:
        usage()

    command = argv[1]
    try:
        if command == "version":
            print_json(version())
        elif command == "deck-names":
            print_json(deck_names())
        elif command == "model-names":
            print_json(model_names())
        elif command == "model-fields":
            if len(argv) != 3:
                usage()
            print_json(model_field_names(argv[2]))
        elif command == "find":
            if len(argv) != 3:
                usage()
            print_json(find_notes(argv[2]))
        elif command == "info":
            if len(argv) < 3:
                usage()
            print_json(notes_info([int(note_id) for note_id in argv[2:]]))
        elif command == "call":
            if len(argv) not in (3, 4):
                usage()
            params = json.loads(argv[3]) if len(argv) == 4 else {}
            print_json(request(argv[2], params))
        else:
            usage()
    except AnkiConnectError as exc:
        print(f"AnkiConnect error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main(sys.argv)
