---
name: docs-researcher
description: Research framework, library, and language questions using up-to-date official documentation and real repository evidence. Use when asked to explain APIs, compare approaches, confirm behavior by version, provide citations, or investigate how tools are used in practice.
---

# Docs Researcher

## Overview

Answer technical questions with a source-first workflow:
1. Get primary docs through the local `ctx7` CLI.
2. Validate with official docs sites and repo evidence when needed.
3. Return concise, version-aware guidance with links and tradeoffs.

## Inputs To Collect

Capture these before deep research:
- Target technology and version (if known)
- Exact question and output depth
- Whether user wants implementation guidance, comparison, or quick fact lookup

If version is missing and answer could vary by version, ask for it.

## Step 1: Query Context7 First

Use the installed `ctx7` binary directly when it is available. Only fall back to `npx -y ctx7` if `ctx7` is missing from `PATH`.

Do not use the legacy `context7` command name, `context7 resolve-library-id`, `context7 query-docs`, or any `@upstash/context7-cli` package name. If a `ctx7` command fails, correct the command or inputs instead of retrying with old command families.

Preferred command sequence:

```bash
# 0) Confirm the CLI you should use
command -v ctx7 >/dev/null 2>&1 || alias ctx7='npx -y ctx7'

# 1) Resolve the best library ID
ctx7 library "<library-or-framework>" "<question>"

# 2) Query docs with the chosen ID
ctx7 docs "</org/project or /org/project/version>" \
  "<specific question with constraints>"
```

Rules:
- Prefer `ctx7` over `npx -y ctx7` for speed when the binary is already installed.
- Prefer a specific versioned library ID when version matters.
- Run focused queries instead of broad prompts.
- If multiple libraries are plausible, provide options and ask user which one to proceed with.
- If the first `ctx7 library` result is clearly authoritative, use it immediately instead of spending extra turns re-resolving the same library.
- If `ctx7 docs` comes back thin or ambiguous, refine the query once; do not restart the workflow from a different CLI brand or package.

## Step 2: Use Official Sources Only For Web Verification

When web verification is needed:
- Prioritize vendor/official documentation.
- Avoid blogs unless no primary source exists.
- Cite exact pages and call out any inferred conclusions.

See source ordering in `references/source-priority.md`.

## Step 3: Clone Repo To /tmp And Search Evidence

Use this pattern for real-world confirmation:

```bash
repo="owner/name"
search="your_pattern"
dest="/tmp/docs-research/${repo//\//-}-$(date +%s)"

git clone --depth 1 "https://github.com/${repo}.git" "$dest"

rg -n --hidden \
  -g '!.git/*' \
  -g '!node_modules/*' \
  -g '!dist/*' \
  -g '!build/*' \
  "$search" "$dest"

rg --files "$dest" | rg -i '(readme|docs|guide|example|reference|api)'
```

Or use helper script:

```bash
scripts/research_repo.sh owner/name "pattern"
scripts/research_repo.sh owner/name "pattern" "docs/**"
```

Default search tactics:
- Start with docs and examples.
- Then search for API entry points and tests.
- Use multiline mode (`rg -U`) only when cross-line patterns are required.

## Step 4: Compare Solutions Before Recommending

When the question allows multiple valid approaches:
1. Provide 2-3 options with tradeoffs.
2. State recommended option and why.
3. Ask which option to proceed with before implementation details.

## Output Contract

Return answers with:
1. Direct answer first.
2. Version assumptions.
3. Options and tradeoffs (if applicable).
4. Citations to Context7 and official docs.
5. Repo evidence path/command summary when code scan was used.
