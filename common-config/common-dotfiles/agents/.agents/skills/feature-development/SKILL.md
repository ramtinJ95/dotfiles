---
name: feature-development
description: Guide a core feature from product intent through architecture, program design, vertical slices, and human-reviewed implementation.
disable-model-invocation: true
---

# Feature Development

Run a **lights-on** development workflow: use the agent for repository legwork, grounded proposals, implementation, and validation while the user retains the load-bearing product and engineering decisions and reviews the resulting code.

This is a collaborative workflow, not a quiz. Preserve **traceability** from requested behavior through ownership and code paths to slices, validation, and reviewed code.

## Operating contract

- Read repository instructions, the feature request, existing design artifacts, and the relevant code before proposing decisions.
- Label load-bearing claims as `Observed`, `Inferred`, `Proposed`, `Decided`, or `Open`. Attach file-and-line evidence to `Observed` claims.
- Do the legwork before asking. Present material decisions with evidence, viable options, tradeoffs, and a recommendation.
- Prefer existing ownership and abstractions. Expose design pressure instead of hiding it with parameter threading, adapters, fallback layers, or parallel abstractions.
- Keep one coherent working artifact. Use repository conventions; if no destination exists, work in chat and ask before creating a persistent file.
- Treat an approval as explicit user agreement. Never infer approval from silence or advance through several load-bearing gates at once.
- Reopen an earlier phase when later evidence contradicts it. Record what changed and invalidate dependent approvals.
- Do not implement until the user explicitly requests implementation of an approved slice or approves a direct path.
- Do not commit, open a pull request, deploy, or continue to another slice batch unless separately asked.

## Begin or resume

1. Read the working artifact and repository state.
2. If work already exists, identify the earliest `in_progress`, `reopened`, or `blocked` phase and continue there.
3. If work is new, recommend a planning depth based on the cost of misunderstanding, not estimated line count:
   - **Direct:** an obvious, low-risk change with cheap correction and no material product, ownership, contract, data, security, or operational decision.
   - **Compact:** a medium change whose product review and system architecture can be agreed together without obscuring either.
   - **Full:** a core, ambiguous, cross-boundary, high-risk, or expensive-to-reverse change.
4. Explain the recommendation and let the user decide. Do not downgrade an explicitly requested full workflow.

For a direct path, state the intended behavior, change surface, and validation before implementation. Stop and switch to compact or full if implementation reveals a load-bearing decision.

## Maintain workflow state

Keep this status block near the top of the working artifact:

```text
Mode: direct | compact | full
Current phase: product review | system architecture | program design | vertical slices | slice execution | complete

Product review: pending | in_progress | approved | reopened | blocked | skipped
System architecture: pending | in_progress | approved | reopened | blocked | skipped
Program design: pending | in_progress | approved | reopened | blocked | skipped
Vertical slices: pending | in_progress | approved | reopened | blocked | skipped

Direct change: pending | approved | implemented | human-reviewed | n/a
Approved slice batches:
Implemented slice batches:
Human-reviewed slice batches:
```

Record why any phase is skipped. Use `skipped` only when the phase genuinely does not apply, such as product review for a behavior-preserving internal refactor.

Maintain these artifact sections as they become relevant:

```markdown
# Feature
## Workflow status
## Product review
## System architecture
## Program design
## Vertical slices
## Slice batch reviews
## Traceability
## Decisions and rejected alternatives
## Open questions and risks
```

## Run only the active phase

Read the reference for the active phase completely before acting. Do not load later phase references merely to anticipate future work.

- **Product review:** read [references/product-review.md](references/product-review.md). In compact mode, also read the architecture reference and present one combined approval gate while keeping product and technical decisions distinct.
- **System architecture:** read [references/system-architecture.md](references/system-architecture.md).
- **Program design:** read [references/program-design.md](references/program-design.md).
- **Vertical slices:** read [references/vertical-slices.md](references/vertical-slices.md).
- **Slice execution:** read [references/slice-execution.md](references/slice-execution.md). Enter only when the user explicitly requests implementation and has approved either the direct change or a selected slice batch.

When a phase meets its completion criterion, update the artifact, present the result, and pause for user approval. After approval, mark the phase `approved`; begin the next phase only when the user's request also clearly asks to continue.

## Coordinate repository research

Use bounded explore subagents when two or more repository investigations can proceed independently. Ask for findings, evidence, implications, and uncertainty rather than final designs. Synthesize one system model, reconcile terminology and conflicts, and verify critical claims directly.

Do not paste raw subagent reports into the artifact. Keep evidence that changes a decision.

## Preserve the human review loop

Implement only the approved direct change or one approved batch at a time, normally one to three vertical slices. After automated and hands-on validation, produce a compact review packet and stop for human code review. Record the user's review outcome before proceeding.

If review or implementation exposes design drift, do not normalize it as a local implementation choice. Reopen the earliest affected phase, explain the contradiction, and wait for a decision.

The workflow is complete only when every requested behavior is traceable to approved design, implemented slices, validation evidence, and a recorded human review outcome.

## Boundary

- If the user wants one-question-at-a-time interrogation or stress-testing, tell them to invoke `$grill-me`; do not reproduce it here.
- Recommend a focused experiment when evidence cannot settle an assumption. Keep prototype findings separate from production implementation until the design is approved.
