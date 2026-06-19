#!/usr/bin/env python3
"""Create an Anki deck via AnkiConnect."""

from __future__ import annotations

import argparse
import sys

from anki_connect import AnkiConnectError, create_deck, deck_names


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an Anki deck")
    parser.add_argument("deck", help="Deck name, e.g. 'Learning::Go'")
    parser.add_argument(
        "--if-missing",
        action="store_true",
        help="Do nothing if the deck already exists",
    )
    args = parser.parse_args()

    try:
        existing = deck_names()
        if args.deck in existing and args.if_missing:
            print(f"Deck already exists: {args.deck}")
            return
        deck_id = create_deck(args.deck)
        print(f"Deck ready: {args.deck} (id: {deck_id})")
    except AnkiConnectError as exc:
        print(f"AnkiConnect error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
