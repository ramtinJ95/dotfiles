---
name: practice
description: Create and coach exercises from grok sessions, teach workspaces, repo context, notes, docs, or standalone topic requests. Prepares solutions but gates reveal until the user has attempted and used hints.
argument-hint: "What should we practice?"
---

# Practice

Use this skill when the user wants exercises, drills, kata, practice problems, quizzes with feedback, repo tasks for learning, or review of an attempted answer.

The deliverable is **practice with protected thinking time**. Prepare complete solutions, rubrics, and hints, but do not reveal the full solution until the user has made a genuine attempt, exhausted useful hints, or explicitly asks to reveal/exit practice mode.

This skill is intentionally separate from `/skill:teach` and `/skill:grok`:

- `/skill:grok` builds understanding while working in a repo or technical topic.
- `/skill:teach` builds a stateful teaching workspace with lessons, references, mission, resources, and learning records.
- `/skill:practice` turns understood or selected material into exercises and coaches attempts.
- `/skill:anki-cards` turns durable learning material into Anki notes; do not manage Anki here.

## Core rule: prepared but gated solutions

For every saved exercise, create a complete solution at `solution/SPOILER-solution.md`. The file may exist on disk, but the assistant must not print, summarize, quote, or walk through the full solution before the learner has attempted the exercise unless the user explicitly says something like:

- "show solution"
- "reveal"
- "exit practice mode"
- "I want the answer now"

A genuine attempt can be code, a written answer, a design sketch, a debugging hypothesis, a partial solution, or a clear explanation of where the user got stuck after thinking.

If the user asks for help before attempting, use the hint ladder instead of the solution. If the user keeps struggling after one or two hints, switch to a smaller worked analogy or partial scaffold, not the full answer.

## Exercise sources

Ground exercise design in the best available source:

1. **Grok context** — if `scratch/LEARNING.md` exists, read it for concepts learned, misconceptions corrected, traced flows, transfer questions, and card candidates.
2. **Teach workspace** — if inside `~/personal/teachings/<topic>/`, read `MISSION.md`, `RESOURCES.md`, `learning-records/`, `reference/`, relevant `lessons/`, and `GLOSSARY.md` if present.
3. **Repo context** — for codebase exercises, inspect relevant code/tests/docs first. Cite `file:line` anchors in prompts, rubrics, and explanations when making claims about this repo.
4. **Provided material** — use pasted notes, docs, wiki pages, plans, or user-selected source text.
5. **External docs** — use `npx ctx7` for current framework/library behavior when version-correct details matter. Use web/deep research only for broader or ambiguous topics that local sources cannot answer.

Do not invent repo behavior. Flag assumptions clearly.

## Output modes

Choose the lightest mode that fits the ask.

### Conversational practice

Use when the user wants a quick exercise in chat. Provide:

- prompt
- constraints
- deliverable
- first hint only if requested
- statement that a solution can be revealed later

Do not display the solution in the initial exercise.

### Saved exercise scaffold

Use when the user asks to create exercises, when the exercise is non-trivial, or when the source is from `/skill:grok` or `/skill:teach` and should become durable.

Follow [EXERCISE-FORMAT.md](./EXERCISE-FORMAT.md). Default roots:

- In a teaching workspace: `exercises/`
- In a repo or task context: `scratch/exercises/`
- Elsewhere: ask for a target path or stay conversational

Default shape:

```txt
0001-exercise-name/
  prompt.md
  hints.md
  rubric.md
  explainer.md
  solution/
    SPOILER-solution.md
  starter/   # optional
  tests/     # optional
```

### Attempt review

Use when the user submits an answer, patch, plan, or explanation. Compare against the rubric and prepared solution without revealing more than needed.

Response shape:

- **Intent** — restate what the user tried to do.
- **What is right** — reinforce correct thinking.
- **Smallest mismatch** — name the most important gap.
- **Next hint** — give the next useful nudge, not the full answer.
- **Rubric check** — optional concise pass/partial/missing bullets.

Only reveal the full solution after the user asks or after the exercise has reached a natural review point.

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
- **Respect the learning mode.** Do not hand over pasteable answers unless the user explicitly exits practice mode.

## Hint ladder

Escalate one rung at a time, ideally after each user attempt:

1. **Where to look** — file, concept, source, or part of the prompt.
2. **What matters** — invariant, relationship, distinction, or constraint.
3. **Approach shape** — the broad strategy.
4. **Worked analogy** — a tiny analogous example that does not solve the exact exercise.
5. **Partial scaffold** — pseudocode, blanks, or a near-solution checkpoint.
6. **Solution reveal** — only after attempt/hints or explicit user request.

If the same issue persists after one or two hints, reduce the task size or switch to a worked analogy.

## Saved exercise workflow

1. **Clarify target skill** — ask only if the exercise goal, source, or difficulty is unclear.
2. **Read source context** — learning notes, teach artifacts, repo files, docs, or pasted material.
3. **Pick exercise type** — recall, transfer, debugging, implementation, design, explanation, refactor, test-writing, or mixed.
4. **Create scaffold** — prompt, hints, rubric, explainer, spoiler solution, and optional starter/tests.
5. **Validate if applicable** — run safe tests/formatters/linters for generated code or tests.
6. **Present only learner-facing paths** — show `prompt.md`, `hints.md`, and `rubric.md`; mention that a spoiler solution exists but do not summarize it.
7. **Coach the attempt** — use attempt review and hint ladder.
8. **Post-attempt consolidation** — after review, suggest card candidates or learning-record updates when useful.

Do not commit automatically.

## Naming and numbering

Use dash-case names. For sequential exercise folders, scan existing siblings and increment the highest number.

Examples:

- `scratch/exercises/0001-trace-auth-request/`
- `~/personal/teachings/go-context/exercises/0003-cancel-a-worker/`
- `~/personal/teachings/typescript/exercises/02-generics/02.03-infer-a-result-type/`

## Integration with grok

When the user asks for practice after a grok session:

- Read `scratch/LEARNING.md` if present.
- Prefer exercises from `Misconceptions corrected`, `Transfer questions`, `Traced flows`, and `Card candidates`.
- Use repo-grounded tasks with file anchors when practicing a codebase.
- Default to `scratch/exercises/` for saved exercises.
- Do not solve the user's real ticket for them unless they exit practice mode.

## Integration with teach

When the user asks for practice in a teaching workspace:

- Read `MISSION.md` to keep exercises mission-relevant.
- Use `learning-records/` and `GLOSSARY.md` to calibrate difficulty and terminology.
- Link prompts to relevant `lessons/` and `reference/` docs when helpful.
- Default to the workspace `exercises/` directory.
- If an exercise reveals a new understanding, suggest a learning record. Confirm before writing one.

## Integration with anki-cards

Do not write to Anki from this skill. After an attempt or solution review, emit concise card candidates when useful:

```md
## Card candidates
- Type: misconception | procedure | distinction | concept | code | cloze
  Prompt idea: ...
  Key answer points:
  - ...
  Source: ...
  Tags: ...
```

Focus card candidates on mistakes, distinctions, procedures, and transfer insights surfaced by practice. `/skill:anki-cards` can later refine, deduplicate, preview, and write cards.

## What not to do

- Do not reveal the full solution in the initial prompt.
- Do not make exercises from ungrounded guesses when source material is available.
- Do not create large courses; that is `/skill:teach`.
- Do not turn every fact into a drill; prefer high-value transfer and misconception practice.
- Do not write Anki notes directly.
- Do not automatically commit generated exercise files.
