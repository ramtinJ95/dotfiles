# Software Factory plan reference

Read only the section needed for the current gate or artifact.

## Artifacts and status

```text
docs/plans/<feature-slug>/
  00-status.md
  01-product.md
  mockups/
  02-architecture.md
  03-program-design.md
  04-slices.md
```

Create `00-status.md` before Gate 1 and update it at every approval and slice completion:

```markdown
# Status: <feature name>

- Gate 1 — Product: pending | in progress | APPROVED <date>
- Gate 2 — Architecture: pending | in progress | APPROVED <date>
- Gate 3 — Program Design: pending | in progress | APPROVED <date>
- Gate 4 — Slice plan: pending | in progress | APPROVED <date>

## Slices
- [ ] Slice 1 — tracer bullet: <one line>
- [ ] Slice 2 — <one line>

## Notes for a fresh session
<decisions or evidence a new session needs that are not already in a gate document>
```

## Gate 1 — Product

Save as `01-product.md`:

```markdown
# Product: <feature name>

## Problem
<the user problem in the end user's words>

## Success metric
<one business number, its target, and how it is measured>

## Announcement — the blog post before the feature
<3–6 sentences announcing the feature to users>

## Screens
<one line per file in ./mockups/, or "no UI">
```

Keep database, schema, endpoint, architecture, and file-layout decisions for Gate 2. A UI mockup is plain HTML, one file per screen, with no framework or build step.

## Gate 2 — Architecture

Save as `02-architecture.md`:

```markdown
# Architecture: <feature name>

## Fit
<existing services or modules touched and how>

## Endpoints
<route, verb, and purpose for each endpoint, or "none">

## Data
<new or changed tables or collections, plus the query shapes that use them>

## Flow
<end-to-end call order for each main path>

## External
<third-party APIs, environment-variable names, and webhooks, or "none">
```

Record environment-variable names, never values.

## Gate 3 — Program Design

Save as `03-program-design.md`:

```markdown
# Program Design: <feature name>

## Files
<every file created or changed and why it belongs there>

## Types & signatures
<code blocks defining types and method signatures, without implementation bodies>

## Call stack
<what calls what, top to bottom, for every main flow>

## Test plan
<test case names and the behavior each asserts>

## Least confident decisions
<numbered decisions most worth challenging before implementation>
```

## Gate 4 — Vertical Slices

Save as `04-slices.md`:

```markdown
# Vertical Slices: <feature name>

1. **Slice 1 — tracer bullet:** <mocked or hardcoded end-to-end path and how to observe it>
2. **Slice 2 — happy path:** <real logic replacing the mocks and how to prove it>
3. **Slice 3 — <capability>:** <one business rule, failure mode, edge case, or polish increment>
```

Add further slices only when each represents one independently testable capability. Build through the stack within each slice rather than completing one technical layer at a time.
