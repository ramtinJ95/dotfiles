---
name: scribebase-article-ingest
description: Submit article or text content to ScribeBase as JSON and poll ingestion.
disable-model-invocation: true
---

# ScribeBase article ingest

User-invoked only. If this skill was not explicitly named by the user, stop.

## Gate

Before submitting, confirm all required inputs are present:

- `SCRIBEBASE_URL`
- `SCRIBEBASE_API_TOKEN`
- article/text body
- title, unless the body contains Markdown frontmatter with `title`

Ask for missing required inputs. Do not invent metadata.

## Use this when

- An automation has fetched an article body.
- The user pasted text or Markdown to index.
- You have article metadata such as URL, publisher, tags, or origin.

If the user has a local file path, `scribebase-ingest` is also valid.

## Defaults

Use these only when the user does not specify a value:

- `source_type=article`
- `language=${SCRIBEBASE_DEFAULT_LANGUAGE:-en}` when language is not in frontmatter
- `no_index=false`

Optional fields you may pass through when provided:

- `tags`
- `origin`
- `publisher`
- `author`
- `created_at_source`
- `updated_at_source`
- `retrieved_at`
- `url`
- `canonical_url`
- `external_id`
- `collection`
- `summary`
- `course`
- `chapter`

## Body format

Plain Markdown is accepted:

```markdown
# Article Title

Article body...
```

Markdown frontmatter is accepted and used as defaults:

```markdown
---
title: "Article Title"
source_type: article
origin: company_blog
publisher: "Example Blog"
url: "https://example.com/article"
tags: ["kubernetes", "gitops"]
collection: "infra-reading"
---

# Article Title

Article body...
```

Explicit JSON fields override frontmatter values.

## Run

1. Call `/health`. Completion: the server responds.
2. Submit JSON to `POST /articles`. Completion: response has `job_id`.
3. Poll `GET /jobs/{job_id}`. Completion: status is `succeeded` or `failed`.
4. Report outcome. Completion: success includes `source_id`; failure includes `error`.

Do not say the article is searchable before the job reaches `succeeded`.

## Commands

Health:

```bash
curl -s "$SCRIBEBASE_URL/health"
```

Submit article JSON:

```bash
curl -s "$SCRIBEBASE_URL/articles" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Article Title",
    "body": "# Article Title\n\nArticle body...",
    "language": "en",
    "tags": ["kubernetes", "gitops"],
    "origin": "company_blog",
    "publisher": "Example Blog",
    "url": "https://example.com/article",
    "collection": "infra-reading"
  }'
```

Poll:

```bash
curl -s "$SCRIBEBASE_URL/jobs/JOB_ID" \
  -H "Authorization: Bearer $SCRIBEBASE_API_TOKEN"
```

Submissions are deduplicated by external ID/origin, canonical URL, then body
SHA-256. HTTP `409` means the source already exists; report the `source_id` from
the response instead of retrying. Use `duplicate_policy: "create"` only when the
user explicitly wants a separate copy.

## Status meanings

- `queued`: submission succeeded; ingestion has not started.
- `running`: extraction and/or indexing is in progress.
- `succeeded`: ingestion completed; use `source_id` for future retrieval.
- `failed`: ingestion failed; show `error` and suggest checking Mac mini logs.
