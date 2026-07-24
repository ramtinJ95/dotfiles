# Vertical Slices

Turn the approved program design into the smallest ordered increments that deliver observable, testable behavior. Slice through the system; do not group work merely by layer, file type, or technical specialty.

## Find touchable increments

Start from user-visible or externally observable outcomes and trace inward through the approved call graph. A slice may use controlled temporary behavior when that creates an earlier feedback point, such as:

- Serve an agreed API contract with mock data and inspect it with `curl`.
- Connect a UI to the mock contract and exercise the flow in a browser.
- Replace the mock at the owning service boundary.
- Add persistence and prove the data round trip.
- Add remaining rules and distinct failure behavior.

Do not prescribe this order when dependencies or risk call for another. Prefer the earliest slice that tests the riskiest architectural or product assumption.

Reject horizontal groups such as “all migrations,” “the service layer,” or “the frontend” unless that unit independently produces an observable result and meaningful feedback.

## Specify each slice

For every slice record:

- Behavior delivered
- Entry point and externally observable result
- Architectural sequence and program-design call path exercised
- Production changes
- Temporary behavior and its removal point
- Automated tests
- Hands-on validation such as browser, CLI, API, event, job, or operational inspection
- Dependencies on earlier slices
- Migration, compatibility, feature-flag, rollout, and rollback concerns
- Cross-repository coordination and landing order
- Review surface
- Checkable completion point

Keep slices small enough that the user can understand and review the resulting code before design drift compounds. Do not optimize for an arbitrary line count.

## Order and batch the slices

Order slices to:

1. Test expensive or uncertain assumptions early.
2. Establish contracts before dependent behavior.
3. Preserve runnable, reviewable stopping points.
4. Avoid migrations or compatibility steps that cannot safely coexist with deployed versions.
5. Expose user or operator feedback as early as practical.

Propose implementation batches of one to three slices. Default to one when the area is unfamiliar, the design is risky, or a slice is already broad. Explain why each batch is reviewable and what evidence should exist before the next begins.

Map every program-design element to exactly one first-introducing slice and any later slice that exercises or removes it. Map every acceptance criterion to one or more slices and validation steps.

## Present the slice gate

Update the working artifact with the ordered slices, proposed batches, dependencies, safe stopping points, and full traceability:

```text
Behavior | Architectural owner and contract | Concrete types and calls | Slice | Validation
```

Present the sequence and ask the user to approve it or change the slicing. Do not begin implementation as part of slice approval.

**Complete when:** every approved behavior and program-design element belongs to a slice; every slice produces an observable result with automated and hands-on validation; the order respects dependencies and coordination constraints; batches are reviewable; and the user has explicitly approved the slices.
