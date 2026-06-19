---
name: anki-cards
description: Create, inspect, deduplicate, and improve high-quality Anki cards from learning notes, project notes, wiki pages, or selected source material using AnkiConnect. Manual invocation only.
disable-model-invocation: true
---

# Anki Cards

Use this skill when the user asks to create, inspect, deduplicate, import, or improve Anki cards from notes such as `scratch/LEARNING.md`, wiki pages, documentation, or a pasted learning summary.

This skill is intentionally separate from `/skill:grok`:

- `/skill:grok` teaches, scaffolds, and records learning notes.
- `/skill:anki-cards` turns selected learning material into high-quality Anki notes and manages existing cards.
- Anki handles spaced-repetition scheduling; do not reimplement scheduling here.

## Safety and consent

Adding or updating Anki notes changes the user's local Anki collection.

- Always preview proposed creations/updates before writing to Anki.
- Ask for explicit confirmation before calling `addNote`, `addNotes`, `updateNoteFields`, `addTags`, `removeTags`, or deck/model creation actions.
- Never delete notes unless the user explicitly asks and confirms after seeing note IDs and fronts.
- If AnkiConnect is unavailable, explain that Anki must be open with the AnkiConnect add-on running on `localhost:8765`.

## AnkiConnect helpers

Helper scripts are available relative to this skill directory. Prefer the focused scripts for normal workflows and the low-level `ankiconnect.py` escape hatch for unusual API calls.

```bash
# Health/setup
python3 scripts/ankiconnect.py version
python3 scripts/ankiconnect.py model-names
python3 scripts/ankiconnect.py model-fields Basic

# Decks
python3 scripts/list_decks.py
python3 scripts/create_deck.py 'Learning::Go' --if-missing

# Search/view/export existing cards
python3 scripts/list_cards.py --deck "Learning::Go" --tag go --limit 20
python3 scripts/export_cards.py --deck "Learning::Go" --output /tmp/go-cards.md
python3 scripts/ankiconnect.py find 'deck:Default tag:go'
python3 scripts/ankiconnect.py info 1234567890 1234567891

# Validate/add notes from a JSON file
python3 scripts/add_notes.py /tmp/proposed-anki-notes.json
python3 scripts/add_notes.py /tmp/proposed-anki-notes.json --commit

# Preview/update existing notes from a JSON file
python3 scripts/update_notes.py /tmp/proposed-anki-updates.json
python3 scripts/update_notes.py /tmp/proposed-anki-updates.json --commit

# Media/image support
python3 scripts/store_media.py /path/to/diagram.png --filename backend-topology.png

# Low-level API escape hatch
python3 scripts/ankiconnect.py call addNotes '{"notes":[...]}'
```

The helper uses AnkiConnect's JSON API at `http://localhost:8765` with request shape:

```json
{"action":"deckNames","version":6,"params":{}}
```

If the helper is insufficient, use direct `curl` or a short Python stdlib script.

Useful actions:

- `version` — health check.
- `deckNames`, `createDeck` — inspect/create decks.
- `modelNames`, `modelFieldNames` — inspect note types and fields.
- `findNotes` — search existing notes with Anki search syntax.
- `notesInfo` — inspect existing notes by ID.
- `canAddNotes` — preflight duplicate/model/field validation.
- `addNote`, `addNotes` — create notes.
- `updateNoteFields` — improve existing note fields.
- `addTags`, `removeTags` — manage tags.
- `storeMediaFile` — add images/media to Anki media collection.

## Card quality principles

Base card generation on these principles:

1. **Understand before memorizing.** Do not make cards from material the user has not understood or selected for memorization.
2. **Minimum information principle.** One card should test one idea. Split compound answers.
3. **Active recall over recognition.** Prefer prompts that require retrieving an answer, prediction, explanation, or distinction.
4. **Context-independent prompts.** A card should make sense months later without reopening the original note.
5. **No orphan cards.** Include enough context to disambiguate the question.
6. **No over-cueing.** Do not make the answer obvious from the wording.
7. **Avoid yes/no cards.** Ask "why", "when", "what changes", "what does this imply", or "which condition" instead.
8. **Prefer small answers.** If an answer needs many bullets, create multiple cards.
9. **Use cloze sparingly.** Cloze is good for terminology, syntax shape, and compact contrasts. Basic Q/A is usually better for conceptual understanding.
10. **Use type-in cards for fluency.** Use `Basic (type in the answer)` for syntax, commands, flags, short code snippets, and other answers the user should produce exactly.
11. **Use image cards for spatial/topology knowledge.** For architecture diagrams, Kubernetes topology, network flows, and backend maps, prefer image-based prompts or manual Image Occlusion workflows.
12. **Make technical cards operational.** For code, ask the user to predict output, identify a bug, explain a trade-off, or choose the right abstraction—not just recite definitions.
13. **Capture misconceptions.** Cards from corrected misunderstandings are high value.
14. **Use broad decks plus rich tags.** Topic decks are fine, but avoid many tiny decks that should be tags.
15. **Keep source metadata.** Include source path/section/URL in tags or an extra field when available.
16. **Treat cards as living objects.** If an existing card is vague, too broad, or repeatedly missed, rewrite/split it rather than preserving it.

## Workflow: create cards from notes

1. **Clarify scope**
   - Identify source path(s), pasted notes, or selected sections.
   - Ask what the user wants to remember if unclear.
   - Ask for target deck/tags if not provided.

2. **Read and extract candidates**
   - Pull out concepts, distinctions, procedures, misconceptions, examples, transfer questions, and source anchors.
   - Ignore trivia, one-off file paths, giant summaries, and facts unlikely to be reviewed.

3. **Inspect Anki setup**
   - Health check AnkiConnect.
   - List decks/models if target deck/model is unknown.
   - If the user wants a new broad topic deck, preview the deck name and ask before creating it.
   - Inspect field names for the chosen model.
   - Prefer `Basic` for conceptual cards and `Cloze` for carefully chosen cloze cards unless the user has a custom model.

4. **Check existing cards before proposing new ones**
   - Search by target deck/tags when available.
   - Search key terms from each candidate, not just exact question text.
   - Inspect likely matches with `notesInfo`.
   - Mark candidates as `new`, `possible duplicate`, `update existing`, or `skip`.

5. **Draft cards**
   - Produce a preview table or compact list:
     - action: create/update/skip
     - type: Basic/Cloze/custom model
     - front/text
     - back/extra
     - tags
     - source
     - duplicate risk
   - Include a short quality critique when useful: too broad, ambiguous, over-cued, missing context, or likely high-value.

6. **Ask for approval**
   - Do not write to Anki until the user approves specific cards/updates.
   - If many cards are proposed, ask the user to approve all, a range, or selected IDs.

7. **Write via AnkiConnect**
   - Use `canAddNotes` before `addNotes` when creating multiple notes.
   - Prefer writing proposed notes to a temporary JSON file and using `scripts/add_notes.py` for dry-run then commit.
   - Use `allowDuplicate: false` unless the user explicitly wants duplicates.
   - Add consistent tags, e.g. `source:grok`, `project:<name>`, `topic:<topic>`, `type:concept`, `type:misconception`.
   - Report created note IDs and any failures.

## Workflow: view existing cards

When asked to view cards:

1. Clarify query/deck/tag/topic if needed.
2. Use `findNotes` with an Anki query, examples:
   - `deck:Default tag:go`
   - `tag:source:grok`
   - `"slice" OR "backing array"`
3. Fetch note details with `notesInfo`.
4. Summarize cards by note ID, model, tags, front/text, and abbreviated answer.
5. Flag obvious quality issues: ambiguity, compound answers, stale source, duplicates, weak prompts.

## Workflow: improve existing cards

When asked to improve cards:

1. Fetch target cards with `findNotes`/`notesInfo`.
2. Diagnose quality issues using the principles above.
3. Propose concrete rewrites, splits, merges, or tag changes.
4. Preview exact field updates and affected note IDs.
5. Prefer writing proposed updates to a temporary JSON file and using `scripts/update_notes.py` for dry-run then commit.
6. Ask for explicit approval before `updateNoteFields`/tag changes.

Prefer improvement strategies:

- Split broad cards into multiple atomic cards.
- Replace recognition prompts with recall prompts.
- Add missing context to orphan cards.
- Turn large answers into focused follow-up cards.
- Convert low-value clozes into Basic Q/A when conceptual retrieval is better.
- Preserve source metadata and useful tags.

## Suggested tag conventions

Use tags that are stable and searchable. Avoid spaces in tags.

- `source:grok`, `source:mywiki`, `source:manual`, `source:paper`
- `project:<repo-or-topic>`
- `topic:<topic>`
- `type:concept`, `type:distinction`, `type:procedure`, `type:misconception`, `type:code`, `type:cloze`
- language/framework tags: `go`, `react`, `postgres`, etc.

If Anki rejects colon tags in the user's version/config, use hyphenated equivalents such as `source-grok`.

## Suggested deck conventions

Use decks for broad review contexts, and tags for precise filtering.

Good deck examples:

- `Learning`
- `Learning::Go`
- `Learning::Computer Science`
- `Work::<Company or Codebase>`
- `MyWiki::<Broad Topic>`

Avoid creating a new deck for every article, file, bug ticket, or narrow subtopic. Use tags for those instead.

## Export for discussion/examining

Use `scripts/export_cards.py` when the user wants to discuss, audit, or be examined on existing cards outside Anki static answer format.

Examples:

```bash
python3 scripts/export_cards.py --deck "Learning::Go" --output /tmp/go-cards.md
python3 scripts/export_cards.py --tag source:grok --format json --output /tmp/grok-cards.json
```

Exported cards can be used as context for conversational review, deeper explanations, or a future examiner-style skill. Anki is best for atomic recall, while discussion is better for open-ended reasoning.

## Type-in-answer cards

Use `Basic (type in the answer)` when exact production matters:

- commands and flags, e.g. `kubectl` incantations
- small syntax forms
- short code snippets
- exact function names or config keys

For the built-in `Basic (type in the answer)` model, fields are usually `Front` and `Back`:

```json
{
  "deckName": "Learning::Go",
  "modelName": "Basic (type in the answer)",
  "fields": {
    "Front": "Type the Go command that runs all tests in the current module.",
    "Back": "go test ./..."
  },
  "tags": ["go", "topic:testing", "type:type-in"],
  "options": {"allowDuplicate": false}
}
```

Keep type-in answers short and exact. If multiple answers are acceptable, use a Basic card instead.

## Image and image-occlusion workflows

Anki has a built-in `Image Occlusion` note type with fields commonly named `Occlusion`, `Image`, `Header`, `Back Extra`, and `Comments`. However, true built-in Image Occlusion cards require internal occlusion data and mask handling. AnkiConnect can store media and add ordinary notes, but it does not expose a reliable high-level API for generating functional built-in Image Occlusion masks.

Use one of these workflows:

### Manual true Image Occlusion

Best when the user wants real Image Occlusion UI and masks.

1. Create or locate the topology, diagram, or image file.
2. Optionally use `scripts/store_media.py` to test media handling, but manual IO usually starts from Anki UI.
3. In Anki, choose Image Occlusion and add or draw masks manually.
4. Use this skill later to inspect, export, or improve the resulting notes where possible.

### Automated pseudo-occlusion image cards

Best when the user wants the skill to generate cards end-to-end.

1. Create two images:
   - front image: labels hidden, numbered, or blanked out
   - back image: full answer diagram or annotated reveal
2. Store images with `scripts/store_media.py`.
3. Create Basic or type-in notes whose fields reference the images with `<img src="filename.png">`.

Example Basic image card:

```json
{
  "deckName": "Learning::Kubernetes",
  "modelName": "Basic",
  "fields": {
    "Front": "Which component is hidden by label 3?<br><img src=\"backend-topology-blanked.png\">",
    "Back": "Label 3 is the ingress controller.<br><img src=\"backend-topology-answer.png\">"
  },
  "tags": ["kubernetes", "topic:topology", "type:image"],
  "options": {"allowDuplicate": false}
}
```

### HTML/SVG diagrams

If the skill creates a diagram, prefer SVG where practical: it is text-editable, can be stored as media, and can be embedded with `<img src="diagram.svg">`. If a browser-rendered HTML diagram must become an image, create the HTML or SVG first, then use an external screenshot or rendering step before storing the resulting PNG or SVG in Anki.

## Basic note shape

For the built-in `Basic` model:

```json
{
  "deckName": "Learning",
  "modelName": "Basic",
  "fields": {
    "Front": "In Go, why can modifying one slice sometimes affect another slice?",
    "Back": "Because slices are descriptors over an underlying array. Two slices can share the same backing array, so mutations through one slice can be visible through the other."
  },
  "tags": ["source:grok", "go", "topic:slices", "type:concept"],
  "options": {"allowDuplicate": false}
}
```

## Cloze note shape

For the built-in `Cloze` model, inspect fields first; common fields are `Text` and `Back Extra`:

```json
{
  "deckName": "Learning",
  "modelName": "Cloze",
  "fields": {
    "Text": "In Go, a slice is a descriptor over an {{c1::underlying array}}, not a copy of the elements.",
    "Back Extra": "This is why two slices can sometimes observe the same mutation."
  },
  "tags": ["source:grok", "go", "topic:slices", "type:cloze"],
  "options": {"allowDuplicate": false}
}
```

Avoid clozing too many words in one note. If multiple deletions test unrelated ideas, split into separate notes.
