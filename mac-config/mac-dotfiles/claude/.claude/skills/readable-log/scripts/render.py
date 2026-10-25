#!/usr/bin/env python3
"""Render a decision-log TSV (ts, phase, decision, why, evidence, result) as Markdown, one section per entry.

Usage: render.py <log.tsv> [--out <file.md>] [--title <text>] [--note <text>] [--phase <name>=<label> ...]
Writes <log>.md next to the TSV unless --out is given, and prints the output path and the entry count.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

FORMULA_GUARD = ("'=", "'+", "'-", "'@")


def cell(value: str | None) -> str:
    text = (value or '').strip()
    # log.sh prefixes cells a spreadsheet would read as a formula with a single quote; the Markdown shows the value.
    return text[1:] if text.startswith(FORMULA_GUARD) else text


def sentence(text: str) -> str:
    return text[:1].upper() + text[1:]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('log', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--title')
    parser.add_argument('--note')
    parser.add_argument('--phase', action='append', default=[], metavar='NAME=LABEL')
    args = parser.parse_args()

    labels = dict(item.split('=', 1) for item in args.phase)
    with args.log.open(newline='') as file:
        reader = csv.reader(file, delimiter='\t', quoting=csv.QUOTE_NONE)
        header = next(reader)
        # A second header line is what log.sh leaves when its empty-file test misfires; it is not an entry.
        rows = [dict(zip(header, row)) for row in reader if row and row != header]

    columns = [name for name in header if name not in ('ts', 'phase')]
    body, fields = (columns[0], columns[1:]) if columns else (None, [])
    dates = {cell(row.get('ts'))[:10] for row in rows if cell(row.get('ts'))}
    one_day = len(dates) == 1

    title = args.title or f'Decision log: {args.log.resolve().parent.name}'
    if one_day and not args.title:
        title += f' ({next(iter(dates))})'
    intro = f'{len(rows)} entries, oldest first. Generated from {args.log.name}.'
    lines = [f'# {title}', '', intro + (f' {args.note}' if args.note else ''), '']

    for number, row in enumerate(rows, 1):
        ts = cell(row.get('ts'))
        when = (f'{ts[11:16]} UTC' if one_day else f'{ts[:10]} {ts[11:16]} UTC') if len(ts) >= 16 else ts
        phase = cell(row.get('phase'))
        if phase in labels:
            phase += f' ({labels[phase]})'
        heading = ', '.join(part for part in (when, phase) if part)
        lines += [f'## {number}. {heading}' if heading else f'## {number}.', '']
        if body:
            lines += [sentence(cell(row.get(body))), '']
        for name in fields:
            lines += [f'**{sentence(name)}.** {cell(row.get(name))}', '']

    out = args.out or args.log.with_suffix('.md')
    out.write_text('\n'.join(lines))
    print(f'{out} ({len(rows)} entries)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
