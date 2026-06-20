# Exercise Format

Saved exercises live in one of these roots:

- Teaching workspace: `personal/teachings/<topic>/exercises/`
- Repo/task workspace: `scratch/exercises/`
- User-specified path: use the requested path

Use sequential numbering unless the surrounding course already has numbered sections.

## Default directory shape

```txt
exercises/
  0001-exercise-name/
    prompt.md
    hints.md
    rubric.md
    explainer.md
    solution/
      SPOILER-solution.md
    starter/          # optional, for code/files the learner edits
    tests/            # optional, for validation or self-checks
```

For sectioned courses, use this shape when the plan or existing workspace is sectioned:

```txt
exercises/
  01-section-name/
    01.01-exercise-name/
      prompt.md
      hints.md
      rubric.md
      explainer.md
      solution/
        SPOILER-solution.md
```

## `prompt.md`

The learner-facing task. It must not reveal the full solution.

Recommended structure:

```md
# Exercise Title

## Goal
One or two sentences describing the skill being practiced.

## Context
The minimum background needed to attempt the exercise.

## Task
Concrete instructions.

## Constraints
- Constraint that makes the task realistic.
- Constraint that prevents trivial or off-target solutions.

## Deliverable
What the learner should produce.

## How to check yourself
A short self-check that does not reveal the answer.

## Spoiler policy
A full reference solution exists at `solution/SPOILER-solution.md`, but do not open it until you have made a genuine attempt and used the hints.
```

## `hints.md`

A ladder of progressively stronger hints. Each rung should preserve useful thinking.

```md
# Hints: Exercise Title

## Hint 1 — Where to look
...

## Hint 2 — What matters
...

## Hint 3 — Shape of the approach
...

## Hint 4 — Pseudocode or worked analogy
...

## Hint 5 — Near-solution checkpoint
...
```

Do not put the complete solution in `hints.md`.

## `rubric.md`

Evaluation criteria for attempt review.

```md
# Rubric: Exercise Title

## Must have
- ...

## Good signs
- ...

## Common mistakes
- ...

## Stretch goals
- ...
```

## `explainer.md`

A post-attempt explanation. It may discuss the underlying concept, why the solution works, and common misconceptions, but should not be shown before an attempt unless the user asks to exit practice mode.

## `solution/SPOILER-solution.md`

The full reference answer. It should be complete enough for the assistant to compare attempts against it.

```md
# SPOILER: Solution — Exercise Title

Do not read this until after you have made a genuine attempt.

## Reference solution
...

## Why it works
...

## Alternative approaches
...

## Trade-offs
...
```

For code exercises, include exact code only when it is useful as a reference. If the exercise is about design, debugging, or explanation, the solution can be a high-quality written answer.
