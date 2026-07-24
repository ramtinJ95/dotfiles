# Slice Execution

Implement only the explicitly approved direct change or slice batch, validate it, and return control for human code review. Do not treat an approved overall design as permission to implement every slice.

## Confirm the batch

Before editing:

- Read repository instructions and current working-tree state.
- For a planned path, read the approved product review, architecture, program design, slices, and prior batch reviews. For a direct path, read its approved behavior, change surface, and validation.
- Identify the exact direct change or selected slices, intended behavior, permitted change surface, validation, and implementation constraints.
- Separate load-bearing decisions from local choices left to the implementer.
- Check dependencies, migrations, generated artifacts, compatibility, and cross-repository coordination.
- Preserve unrelated user changes.

If the implementation unit is ambiguous or its prerequisites are incomplete, present the concrete blocker. Do not choose a materially different change or batch.

## Implement the approved behavior

Trace the current path before editing. Reuse the approved owners, boundaries, types, signatures, and call paths. Keep temporary behavior explicit and tied to its removal slice.

Implement only what the approved implementation unit needs. Do not:

- Pull later slices forward for convenience.
- Redesign an approved contract silently.
- Add speculative extension points.
- Hide contradictions with adapters, fallbacks, casts, broad exception handling, or duplicated state.
- Commit, open a pull request, deploy, or mutate external production state without separate authorization.

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

Report any validation that could not run and why. Do not translate an unrun check into a pass.

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

Compare the implementation to the approved traceability rows and update them with validation evidence. Mark the direct change or batch `implemented`, not `human-reviewed`.

Present the review packet and stop. The user must review the code and record one outcome:

- **Approved:** mark the direct change or batch `human-reviewed`.
- **Rework requested:** keep the implementation unit active and address only that feedback.
- **Design reopened:** return to the earliest affected phase.

Do not begin another batch in the same turn unless the user explicitly reviews the current implementation and asks to continue.

**Complete when:** the approved direct change or selected slices meet their observable behavior and validation criteria; the patch matches the approved contract or design, or deviations are explicit; the artifact contains a usable review packet; and control has returned to the user for human code review.
