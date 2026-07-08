---
name: scribebase-ingest
description: Upload a local document to a remote ScribeBase server and poll ingestion.
disable-model-invocation: true
---

# ScribeBase ingest

User-invoked only. If this skill was not explicitly named by the user, stop.

## Gate

Before uploading, confirm all required inputs are present:

- `SCRIBEBASE_URL`
- `SCRIBEBASE_API_TOKEN`
- local file path that exists
- title

Ask for missing required inputs. Do not guess title from filename unless the user
asks you to.

## Defaults

Use these only when the user does not specify a value:

- `source_type=${SCRIBEBASE_DEFAULT_SOURCE_TYPE:-paper}`
- `language=${SCRIBEBASE_DEFAULT_LANGUAGE:-en}`
- `ocr=auto`
- `no_index=false`

Optional fields you may pass through when provided:

- `course`
- `chapter`
- `continue_on_ocr_error`

## Run

1. Call `/health`. Completion: the server responds.
2. Upload with `POST /ingest`. Completion: response has `job_id`.
3. Poll `GET /jobs/{job_id}`. Completion: status is `succeeded` or `failed`.
4. Report outcome. Completion: success includes `source_id`; failure includes `error`.

Do not say the document is searchable before the job reaches `succeeded`.

## Commands

Health:

```bash
curl -s "$SCRIBEBASE_URL/health"
```

Upload:

```bash
curl -s "$SCRIBEBASE_URL/ingest" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "title=Document Title" \
  -F "source_type=paper" \
  -F "language=en" \
  -F "ocr=auto"
```

Poll:

```bash
curl -s "$SCRIBEBASE_URL/jobs/JOB_ID" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN"
```

## Status meanings

- `queued`: upload succeeded; ingestion has not started.
- `running`: extraction and/or indexing is in progress.
- `succeeded`: ingestion completed; use `source_id` for future retrieval.
- `failed`: ingestion failed; show `error` and suggest checking Mac mini logs.
