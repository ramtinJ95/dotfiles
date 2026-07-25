# Program Design

Map the approved architecture into the exact shape and execution of code: call paths, files, types, signatures, state, errors, and side effects. Use call graphs and stacks as working design tools, not final illustrations.

Treat each approved architecture sequence diagram as an execution constraint. Map every participant to an owning module or dependency and every message to one or more concrete call-graph edges. Reopen architecture if the code-level design cannot preserve the approved ordering, boundary contract, state transition, or failure semantics.

## Cover the program dimensions

For both the current and proposed execution model, account for:

- Concrete call graphs and representative success, failure, retry, background, and event-consumer stacks
- Data, errors, state transitions, ordering, and side effects on important edges
- Exact types, fields, variants, invariants, signatures, results, and errors
- Files, modules, visibility, naming, placement, and conversions
- Call sites, dependency construction, injection, registration, dispatch, and feature gating
- Persistence, migrations, API or event schemas, and generated artifacts
- Test seams, fixtures, and hands-on validation paths

## Recover the current execution model

Trace the analogous and affected repository behavior across every program dimension.

Identify both patterns worth reusing and inconsistencies that should not be copied. Present the current graph and representative stacks before proposing replacements so the user can see what will be preserved, removed, or redirected.

Prefer light pseudocode and diff views.

**Current-model criterion:** every architectural element maps to existing code, a deliberate new construct, or an explicit decision; every affected path is visible with its data, errors, ordering, and side effects.

## Draft the proposed execution model

Draft the proposed call graph before finalizing types and signatures. Show concrete functions and methods, boundary crossings, fan-out, state changes, and side effects. Annotate each important edge with the data and errors crossing it.

Walk the primary success stack from entry through boundary parsing or conversion, the owning operation, dependencies and side effects, result or error translation, and the externally observable outcome.

Walk each materially different failure, retry, timeout, cancellation, partial-success, background, or event-consumer stack separately. Use these paths to expose ordering, ownership, transaction boundaries, and failure semantics.

## Derive the code shape

Derive and refine the exact new and changed code shape across the same program dimensions. Include a file-tree diff that justifies every new, moved, changed, generated, and removed file.

Update the graph and representative stacks as the contracts settle. Iterate until the call paths, types, signatures, placement, state, and errors describe one coherent program.

## Expose program-design pressure

Stop on:

- Unexplained call depth, fan-out, or indirection
- Broad parameter threading
- Unrelated signature fallout
- Duplicate or weakly justified representations
- Domain behavior in a transport or persistence owner
- Broad mocking for a local rule
- Many-file change surfaces for a small behavior
- An implementation contract that contradicts approved ownership or guarantees

Return to system architecture when the pressure contradicts a boundary, owner, source of truth, or guarantee. Invalidate dependent approval rather than concealing the contradiction.

## Present the program-design gate

Update the working artifact with the current and proposed program model across every program dimension, the exact change surface, rejected alternatives, and open risks.

Finish with traceability from every architectural contract to its concrete types, calls, state, errors, and validation seam.

**Ready for review when:** the artifact contains every output listed above, the current-model criterion is met, every sequence message and architectural contract has a concrete realization, every changed load-bearing signature and call site is accounted for, and all program-design pressure is resolved. Remain `in_progress` while further legwork can meet the criterion; mark `blocked` only when progress requires user judgment or unavailable evidence.
