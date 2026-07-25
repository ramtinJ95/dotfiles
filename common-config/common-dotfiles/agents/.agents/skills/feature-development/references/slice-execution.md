# Slice Execution

Implement only the explicitly approved direct change or slice batch, validate it, and return control for human code review.

## Confirm the implementation unit

Before editing:

- Read repository instructions and current working-tree state.
- For a planned path, read the approved product review, architecture, program design, slices, and prior batch reviews. For a direct path, read its approved behavior, change surface, and validation.
- Identify the exact direct change or selected slices, intended behavior, permitted change surface, validation, and implementation constraints.
- Separate load-bearing decisions from local choices left to the implementer.
- Check dependencies, migrations, generated artifacts, compatibility, and cross-repository coordination.
- Preserve unrelated user changes.

If the implementation unit is ambiguous or its prerequisites are incomplete, present the concrete blocker. Do not choose a materially different change or batch.

Then mark the direct change or selected batch `implementing`. For a slice batch, also record its stable identifier as the active batch.

## Implement the approved behavior

Trace the current path before editing. Reuse the approved owners, boundaries, types, signatures, and call paths. Keep temporary behavior explicit and tied to its removal slice.

Do not:

- Pull later slices forward for convenience.
- Redesign an approved contract silently.
- Add speculative extension points.
- Hide contradictions with adapters, fallbacks, casts, broad exception handling, or duplicated state.

When implementation evidence contradicts the approved design:

1. Stop expanding the patch.
2. Identify the earliest affected phase.
3. Show the repository evidence and downstream consequences.
4. Mark that phase `reopened` and invalidate dependent approvals.
5. Ask the user to decide after receiving options and a recommendation.

Resume implementation only after the contradiction is resolved.

## Validate the slice

Run the narrowest relevant checks first, followed by broader checks proportional to risk. Execute every automated and hands-on validation promised by the approved direct change or slice where the environment permits it.

Verify:

- The observable behavior and acceptance criteria
- Success and material failure paths
- State transitions, ordering, errors, and side effects
- Contract and schema compatibility
- The approved sequence diagrams, call graph, and signatures
- Removal or containment of temporary behavior
- Tests that would fail without the new behavior
- Formatting, static analysis, and generated artifacts

Record completed validation as `Observed` with its command and relevant output or its hands-on inspection steps. Record checks that could not run and why as `Open`, never as passes.

## Prepare the human review

Update the working artifact with an implementation review containing:

- Direct change or slices implemented
- Observable behavior now available
- Files changed and why
- Actual call-path or contract changes
- Automated validation and results
- Exact hands-on review steps
- Deviations from the design
- Discoveries, risks, and remaining temporary behavior
- Focus areas for code review
- Suggested next batch, without starting it

Compare the implementation to the approved traceability rows and update them with validation evidence. Mark the direct change or batch `awaiting_review`, not `human_reviewed`.

Present the review packet and stop. The user must review the code and record one outcome:

- **Approved:** mark the direct change or batch `human_reviewed` and clear the active batch when applicable.
- **Rework requested:** mark the implementation unit `rework_requested` and address only that feedback.
- **Design reopened:** mark the implementation unit `design_reopened` and return to the earliest affected phase.

Code approval does not accept an `Open` validation risk. Present each such risk separately with its consequence before asking the user whether to accept it.

**Ready for human review when:** the implementation review contains every item listed above, every approved behavior and validation criterion has passing evidence or a recorded `Open` unavailable check with its consequence, deviations are explicit, the unit is `awaiting_review`, and control has returned to the user.
