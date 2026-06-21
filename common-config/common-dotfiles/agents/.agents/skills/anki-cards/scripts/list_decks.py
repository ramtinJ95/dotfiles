#!/usr/bin/env python3
"""List Anki decks via AnkiConnect."""

from __future__ import annotations

import sys

from anki_connect import AnkiConnectError, deck_names


def main() -> None:
    try:
        for deck in deck_names():
            print(deck)
    except AnkiConnectError as exc:
        print(f"AnkiConnect error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
