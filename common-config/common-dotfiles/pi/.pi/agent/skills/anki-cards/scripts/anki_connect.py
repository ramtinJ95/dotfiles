#!/usr/bin/env python3
"""Shared AnkiConnect client for the anki-cards skill.

Requires Anki Desktop running with the AnkiConnect add-on installed.
Uses only the Python standard library.
"""

from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.request
from typing import Any

ANKI_CONNECT_URL = "http://localhost:8765"
ANKI_CONNECT_VERSION = 6


class AnkiConnectError(RuntimeError):
    pass


def request(action: str, params: dict[str, Any] | None = None) -> Any:
    payload = json.dumps(
        {"action": action, "version": ANKI_CONNECT_VERSION, "params": params or {}}
    ).encode("utf-8")
    http_request = urllib.request.Request(
        ANKI_CONNECT_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(http_request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise AnkiConnectError(
            f"Could not reach AnkiConnect at {ANKI_CONNECT_URL}. Is Anki open? {exc}"
        ) from exc

    if body.get("error"):
        raise AnkiConnectError(str(body["error"]))
    return body.get("result")


def check_connection() -> bool:
    try:
        request("version")
        return True
    except Exception:
        return False


def version() -> int:
    return int(request("version"))


def deck_names() -> list[str]:
    return list(request("deckNames"))


def create_deck(deck_name: str) -> int:
    return int(request("createDeck", {"deck": deck_name}))


def model_names() -> list[str]:
    return list(request("modelNames"))


def model_field_names(model_name: str) -> list[str]:
    return list(request("modelFieldNames", {"modelName": model_name}))


def find_notes(query: str) -> list[int]:
    return list(request("findNotes", {"query": query}))


def notes_info(note_ids: list[int]) -> list[dict[str, Any]]:
    if not note_ids:
        return []
    return list(request("notesInfo", {"notes": note_ids}))


def can_add_notes(notes: list[dict[str, Any]]) -> list[bool]:
    return list(request("canAddNotes", {"notes": notes}))


def add_notes(notes: list[dict[str, Any]]) -> list[int | None]:
    return list(request("addNotes", {"notes": notes}))


def update_note_fields(note_id: int, fields: dict[str, str]) -> None:
    request("updateNoteFields", {"note": {"id": note_id, "fields": fields}})


def add_tags(note_ids: list[int], tags: list[str]) -> None:
    request("addTags", {"notes": note_ids, "tags": " ".join(tags)})


def remove_tags(note_ids: list[int], tags: list[str]) -> None:
    request("removeTags", {"notes": note_ids, "tags": " ".join(tags)})


def note_summary(note: dict[str, Any]) -> dict[str, Any]:
    return {
        "noteId": note.get("noteId"),
        "modelName": note.get("modelName"),
        "tags": note.get("tags", []),
        "fields": {
            name: field.get("value", "")
            for name, field in note.get("fields", {}).items()
        },
    }


def strip_html(value: str) -> str:
    value = re.sub(r"<img\b[^>]*\bsrc=['\"]?([^'\" >]+)[^>]*>", r"[image: \1]", value)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"</p\s*>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()



def store_media_file(filename: str, path: str | None = None, data: str | None = None) -> str:
    params: dict[str, Any] = {"filename": filename}
    if path is not None:
        params["path"] = path
    if data is not None:
        params["data"] = data
    if path is None and data is None:
        raise ValueError("store_media_file requires path or base64 data")
    return str(request("storeMediaFile", params))

def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))
