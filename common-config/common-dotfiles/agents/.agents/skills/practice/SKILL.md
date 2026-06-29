---
name: practice
description: Create coached exercises and review attempts from notes, repos, docs, or topics. Gate solutions until a genuine attempt, exhausted hints, or explicit reveal.
argument-hint: "What should we practice?"
---

# Practice

The deliverable is **practice with protected thinking time**: turn understood or selected material into exercises and coach attempts.

This skill is intentionally separate from `/skill:teach` and `/skill:grok`:

- `/skill:grok` builds understanding while working in a repo or technical topic.
- `/skill:teach` builds a stateful teaching workspace with lessons, references, mission, resources, and learning records.
- `/skill:practice` turns understood or selected material into exercises and coaches attempts.
- `/skill:anki-cards` turns durable learning material into Anki notes; do not manage Anki here.

## The gate

The solution is **gated**: prepared in full but withheld until the gate opens. For every saved exercise, create a complete solution at `solution/SPOILER-solution.md`, but never print, summarize, quote, or walk through it while the gate is closed.

The gate opens when the user has made a **genuine attempt** — code, a written answer, a design sketch, a debugging hypothesis, a partial solution, or a clear account of where they got stuck after thinking — or explicitly asks to open it ("show solution", "reveal", "exit practice mode", "I want the answer now").

While the gate is closed and the user asks for help, climb the hint ladder instead. If one or two hints don't unstick them, shrink the task or give a worked analogy — not the answer.

## Sources & integrations

Ground every exercise in the best available source, and honor each source's conventions. Do not invent repo behavior; flag assumptions.

- **Grok** — if `scratch/LEARNING.md` exists, read it and prefer exercises from its *Misconceptions corrected*, *Transfer questions*, *Traced flows*, and *Card candidates*. Use repo-grounded tasks with `file:line` anchors. Default saved exercises to `scratch/exercises/`. Don't solve the user's real ticket while the gate is closed.
- **Teach** — if inside `~/personal/teachings/<topic>/`, read `MISSION.md` (keep exercises mission-relevant), `learning-records/`, `reference/`, relevant `lessons/`, and `GLOSSARY.md` if present (calibrate difficulty and terminology); link prompts to lessons/reference when helpful. Default saved exercises to the workspace `exercises/`. If an exercise reveals new understanding, suggest a learning record — confirm before writing.
- **Repo** — inspect relevant code/tests/docs first; cite `file:line` anchors in prompts, rubrics, and explanations.
- **Provided material** — pasted notes, docs, wiki pages, plans, or user-selected text.
- **External docs** — `npx ctx7` for version-correct framework/library behavior; web/deep research only for broader or ambiguous topics local sources can't answer.
- **Anki** — never write Anki notes here. After an attempt or solution review, emit card candidates when useful (template below); `/skill:anki-cards` later refines, dedupes, and writes them.

```md
## Card candidates
- Type: misconception | procedure | distinction | concept | code | cloze
  Prompt idea: ...
  Key answer points:
  - ...
  Source: ...
  Tags: ...
```

Focus card candidates on mistakes, distinctions, procedures, and transfer insights surfaced by practice.

## Output modes

Choose the lightest mode that fits the ask.

### Conversational practice

Use when the user wants a quick exercise in chat. Provide:

- prompt
- constraints
- deliverable
- first hint only if requested
- a note that a gated solution can be opened later

### Saved exercise scaffold

Use when the user asks to create exercises, when the exercise is non-trivial, or when the source is from `/skill:grok` or `/skill:teach` and should become durable.

Follow [EXERCISE-FORMAT.md](./EXERCISE-FORMAT.md). Default roots:

- In a teaching workspace: `exercises/`
- In a repo or task context: `scratch/exercises/`
- Elsewhere: ask for a target path or stay conversational

### Attempt review

Use when the user submits an answer, patch, plan, or explanation. Compare against the rubric and prepared solution without opening the gate.

Response shape:

- **Intent** — restate what the user tried to do.
- **What is right** — reinforce correct thinking.
- **Smallest mismatch** — name the most important gap.
- **Next hint** — give the next useful nudge, not the full answer.
- **Rubric check** — optional concise pass/partial/missing bullets.

## Exercise design principles

- **One primary skill per exercise.** Avoid giant multi-concept tasks unless intentionally designing an integration challenge.
- **Transfer over recall.** Prefer applying a concept in a new but related situation.
- **Desirable difficulty.** Make the learner think, but keep the task small enough to finish.
- **Explicit constraints.** Good constraints prevent vague answers and trivial solutions.
- **Immediate feedback path.** Include tests, self-checks, a rubric, or a review checklist.
- **Misconception targeting.** Turn corrected misconceptions from `scratch/LEARNING.md` or learning records into exercises.
- **Progressive scaffolding.** Hints should move from orientation to invariants to approach shape to partial scaffold.
- **No hidden gotchas.** Difficulty should come from the concept, not ambiguous wording.
- **Code exercises should be runnable when practical.** If creating starter code or tests, run the relevant formatter/test/lint when safe and available.
- **Respect the gate.** No pasteable answers while it is closed.

## Hint ladder

Escalate one rung at a time, ideally after each user attempt:

1. **Where to look** — file, concept, source, or part of the prompt.
2. **What matters** — invariant, relationship, distinction, or constraint.
3. **Approach shape** — the broad strategy.
4. **Worked analogy** — a tiny analogous example that does not solve the exact exercise.
5. **Partial scaffold** — pseudocode, blanks, or a near-solution checkpoint.
6. **Solution reveal** — only once the gate opens.

If the same issue persists after one or two hints, reduce the task size or switch to a worked analogy.

## Saved exercise workflow

1. **Clarify target skill** — ask only if the exercise goal, source, or difficulty is unclear.
2. **Read source context** — learning notes, teach artifacts, repo files, docs, or pasted material.
3. **Pick exercise type** — recall, transfer, debugging, implementation, design, explanation, refactor, test-writing, or mixed.
4. **Create scaffold** — prompt, hints, rubric, explainer, spoiler solution, and optional starter/tests.
5. **Validate if applicable** — run safe tests/formatters/linters for generated code or tests.
6. **Present only learner-facing paths** — show `prompt.md`, `hints.md`, and `rubric.md`; note the gated solution exists.
7. **Coach the attempt** — use attempt review and hint ladder.
8. **Post-attempt consolidation** — after review, suggest card candidates or learning-record updates when useful.

Do not commit automatically.

## Naming and numbering

Use dash-case names. For sequential exercise folders, scan existing siblings and increment the highest number.

Examples:

- `scratch/exercises/0001-trace-auth-request/`
- `~/personal/teachings/go-context/exercises/0003-cancel-a-worker/`
- `~/personal/teachings/typescript/exercises/02-generics/02.03-infer-a-result-type/`