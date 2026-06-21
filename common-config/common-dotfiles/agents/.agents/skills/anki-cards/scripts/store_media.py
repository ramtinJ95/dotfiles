#!/usr/bin/env python3
"""Store a local media file in Anki's media collection."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from anki_connect import AnkiConnectError, store_media_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Store media file in Anki")
    parser.add_argument("path", type=Path, help="Local file to store")
    parser.add_argument("--filename", help="Filename to use in Anki media; defaults to basename")
    args = parser.parse_args()

    if not args.path.exists():
        print(f"File not found: {args.path}", file=sys.stderr)
        raise SystemExit(1)

    try:
        filename = args.filename or args.path.name
        stored = store_media_file(filename=filename, path=str(args.path))
        print(stored)
        print(f'Use in a field as: <img src="{stored}">')
    except (AnkiConnectError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
