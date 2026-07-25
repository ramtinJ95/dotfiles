---
name: feature-development
description: Guide a feature from product intent through architecture, program design, vertical slices, and human-reviewed implementation.
disable-model-invocation: true
---

# Feature Development

Run a gated, traceable workflow. The agent does repository legwork, grounded proposals, implementation, and validation; the user retains load-bearing decisions and code review. Trace every requested behavior from evidence through approved behavior, ownership, code paths, slices, validation, and human-reviewed code.

## Operating contract

- Label every load-bearing claim in the working artifact and gate presentations using the evidence taxonomy below. A claim is load-bearing when changing it could alter requested behavior, ownership, contracts, implementation shape, validation, or a gate decision.
- Do the legwork before asking. Present material decisions with evidence, viable options, tradeoffs, and a recommendation.
- Use bounded explore subagents when two or more repository investigations are independent. Synthesize one model, verify critical claims, and retain decision-changing evidence instead of raw reports.
- Prefer existing ownership and abstractions. Expose design pressure instead of hiding it with parameter threading, adapters, fallback layers, or parallel abstractions.
- Keep one working artifact. Planned paths persist it using the repository's design-document convention, defaulting to `docs/`. A direct-change packet may stay in chat; persist it by the same convention when it must survive sessions or is escalated.
- Treat an approval as explicit user agreement. Never infer approval from silence or use one undifferentiated approval to advance through several load-bearing gates.
- Reopen an earlier phase when later evidence contradicts it. Record what changed and invalidate dependent approvals.
- Set the current phase to slice execution and implement only after the user explicitly requests implementation of an approved slice batch or approves a direct-change packet for implementation.

## Begin or resume

1. Read the repository instructions first. Then search the repository's design-document convention for an existing working artifact covering this feature, and read it and the current repository state.
2. If work exists, resume exactly from its status: report `complete` without reopening it; otherwise continue the active `in_progress` phase or `implementing` unit, present `awaiting_review`, address only requested `rework_requested` feedback, return to the earliest `reopened`, `invalidated`, or `blocked` phase, or enforce the next approval boundary for `pending`, `proposed`, or `approved` work.
3. If work is new, recommend a planning depth based on the cost of misunderstanding, not estimated line count:
   - **Direct:** an obvious, low-risk change with cheap correction and no material product, ownership, contract, data, security, or operational decision.
   - **Compact:** a medium change whose product review and system architecture can be reviewed together without obscuring either.
   - **Full:** a core, ambiguous, cross-boundary, high-risk, or expensive-to-reverse change.
4. Explain the recommendation and let the user decide. Do not downgrade an explicitly requested full workflow.

Once the user chooses compact or full, derive an artifact path from the repository convention and state it before creating the file. Ask only when the destination is ambiguous. Do not run a planned path without a destination for the artifact.

For a direct path, present one packet covering intended behavior, permitted change surface, and validation, then ask approval to implement it; choosing direct mode is not approval. Mark it `approved` only after approval.

If direct implementation reveals such a decision, stop, mark the direct change `design_reopened`, and recommend compact or full. After the user chooses, create the single planned artifact with the direct packet, implementation evidence, patch state, and open decision; set product review `in_progress`, make it current, and leave later phases `pending`. Preserve the partial patch as evidence and map it to a proposed slice later; do not resume editing until the planned gates and that slice are approved and the user authorizes implementation.

**Entry complete when:** a compact or full path has a created artifact containing the request, mode, initialized status block, and active phase, or a direct path has an explicitly approved direct-change packet.

## Evidence taxonomy

- `Observed`: directly supported by cited evidence. Use file-and-line citations for repository claims and a source-appropriate locator for other evidence, such as a user statement, issue or analytics URL, command and relevant output, or recorded inspection steps.
- `Inferred`: a conclusion drawn from observed evidence but not directly established by it. Cite the supporting observations and preserve material uncertainty.
- `Proposed`: a candidate behavior, design, plan, or validation approach that the user has not approved.
- `Decided`: an explicit user-approved choice. Record what was decided and the scope of the approval.
- `Open`: an unsettled fact, assumption, or decision that still requires evidence or user judgment.

Approval changes an approved proposal to `Decided`; it does not make the proposal `Observed`. An unlabeled load-bearing claim is a defect, not a stylistic choice.

## Maintain workflow state

Keep this status block near the top of the working artifact:

```text
Request: link to or short restatement of the original feature request
Mode: direct | compact | full
Current phase: product review | system architecture | program design | vertical slices | slice execution | complete

Product review: pending | in_progress | approved | reopened | invalidated | blocked | skipped
System architecture: pending | in_progress | approved | reopened | invalidated | blocked | skipped
Program design: pending | in_progress | approved | reopened | invalidated | blocked | skipped
Vertical slices: pending | in_progress | approved | reopened | invalidated | blocked | skipped

Direct change: pending | approved | implementing | awaiting_review | rework_requested | human_reviewed | design_reopened | n/a
Active slice batch: n/a | <batch ID>
Slice batches: <batch ID>: proposed | approved | implementing | awaiting_review | rework_requested | human_reviewed | design_reopened
```

Record why any phase is skipped. Use `skipped` only when the phase genuinely does not apply, such as product review for a behavior-preserving internal refactor.

Give every slice batch a stable identifier and every implementation unit exactly one current status. A design phase moves `pending`, `reopened`, or `invalidated` -> `in_progress` -> `approved`, or `in_progress` -> `blocked`; resume a resolved `blocked` phase as `in_progress`. Reopening a phase sets every later phase except `pending` or `skipped` to `invalidated`. Return unimplemented approved batches that depend on invalidated design to `proposed`. Keep human-reviewed batches as history and add any required correction as a new slice.

A direct change moves `pending` -> `approved`, and a batch moves `proposed` -> `approved`; both then move `approved` -> `implementing` -> `awaiting_review` -> `human_reviewed`. Rework moves `awaiting_review` -> `rework_requested` -> `implementing`. Design drift moves the active unit to `design_reopened` and reopens the earliest affected phase. After the affected design is reapproved, move an active planned batch to `rework_requested` if its patch must change or `awaiting_review` if it still conforms; do not resume implementation without explicit authorization. Direct escalation follows the entry rule above. A `blocked` phase is not ready for review; record an accepted risk as a risk, not a blocker.

After the status block, maintain the relevant phase sections plus slice batch reviews, traceability, decisions and rejected alternatives, and open questions and risks.

## Run only the active phase

Read the reference for the active phase completely before acting. Do not load later phase references merely to anticipate future work.

- **Product review:** read [references/product-review.md](references/product-review.md). In compact mode, also read the architecture reference.
- **System architecture:** read [references/system-architecture.md](references/system-architecture.md).
- **Program design:** read [references/program-design.md](references/program-design.md).
- **Vertical slices:** read [references/vertical-slices.md](references/vertical-slices.md).
- **Slice execution:** read [references/slice-execution.md](references/slice-execution.md).

In compact mode, present one packet with separate product and architecture approval requests, ordered product first, while keeping product review current and architecture pending. If the user approves only product, mark it `approved`, make system architecture current and `in_progress`, and leave its presented proposal unapproved. If the user separately approves both, make system architecture current and record both approvals in product-then-architecture order; leave architecture current until the user asks to continue. Revise the architecture proposal before requesting its approval again whenever product changes.

For product review, system architecture, program design, and vertical slices: when the phase meets its ready-for-review criterion, update the artifact, present the result, and pause for explicit user approval. Only then is the phase complete and marked `approved`; begin the next phase only when the user's request also clearly asks to continue. Slice execution follows the direct-change or batch review states in its reference.

## Complete the workflow

Complete a direct workflow when its approved behavior traces to validation and the change is `human_reviewed`. Complete a planned workflow when every requested behavior traces through approved design and slices to validation and every required batch is `human_reviewed`. Any remaining `Open` validation item blocks completion unless the user separately accepts its named consequence as a `Decided` risk; code approval alone is not risk acceptance. Then set the current phase to `complete`.

## Boundary

- Recommend a focused experiment when evidence cannot settle an assumption. Keep prototype findings separate from production implementation until the design is approved.
