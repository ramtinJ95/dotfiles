---
name: scribebase-context
description: Retrieve cited context from a remote ScribeBase server.
disable-model-invocation: true
---

# ScribeBase context

User-invoked only. If this skill was not explicitly named by the user, stop.

## Gate

Before retrieval, confirm all required inputs are present:

- `SCRIBEBASE_URL`
- `SCRIBEBASE_API_TOKEN`
- query or task to retrieve context for

Ask for missing required inputs. Preserve user-provided filters exactly unless
they ask you to broaden or narrow the search.

## Mode

- Use `/context` when the user needs source material for the current answer or task.
- Use `/search` when the user wants ranked snippets, source IDs, or chunk IDs.

Default retrieval settings:

- `top_k=8` for normal context gathering
- `top_k=12` for broad or ambiguous questions
- omit `alpha` unless requested
- keep `allow_model_mismatch=false` unless the user accepts stale mixed-model results

## Filters

Pass any provided filter through in the request body:

- `source_id`
- `title`
- `source_type`
- `course`
- `chapter`
- `section`
- `page_start`
- `page_end`
- `language`

## Run

1. Call `/health`. Completion: the server responds.
2. Choose `/context` or `/search`. Completion: request matches the user's goal.
3. Inspect the response. Completion: results are present, or you can state none matched.
4. Use returned material. Completion: citations and chunk IDs are preserved.

## Commands

Health:

```bash
curl -s "$SCRIBEBASE_URL/health"
```

List sources:

```bash
curl -s "$SCRIBEBASE_URL/sources" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN"
```

Context pack:

```bash
curl -s "$SCRIBEBASE_URL/context" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "question or task",
    "task": "answer",
    "top_k": 8,
    "filters": {
      "source_type": "paper",
      "language": "en"
    }
  }'
```

Search snippets:

```bash
curl -s "$SCRIBEBASE_URL/search" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "question or topic",
    "top_k": 8,
    "filters": {}
  }'
```

## Response handling

For `/context`, use `context_pack` as source material.

For `/search`, inspect `results[].chunk.title`, `source_id`, `chapter`, pages,
`chunk_id`, `text`, and `score`.

If no results return, say ScribeBase returned no matching context and ask whether
to broaden filters or try different wording.

If the server returns `502`, the API is up but Weaviate or embeddings failed.
Suggest running `uv run scribebase doctor` on the Mac mini.
