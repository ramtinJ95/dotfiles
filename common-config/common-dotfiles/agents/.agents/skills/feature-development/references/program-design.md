# Program Design

Map the approved architecture into the exact shape and execution of code: call paths, files, types, signatures, state, errors, and side effects. Use call graphs and stacks as working design tools, not final illustrations.

Treat each approved architecture sequence diagram as an execution constraint. Map every participant to an owning module or dependency and every message to one or more concrete call-graph edges. Reopen architecture if the code-level design cannot preserve the approved ordering, boundary contract, state transition, or failure semantics.

## Recover the current execution model

Trace the analogous and affected behavior through the repository:

- Exact current call graph
- Representative success, failure, retry, background, and event-consumer call stacks
- Data, errors, state transitions, ordering, and side effects on important edges
- Existing domain, transport, persistence, event, and error types
- Comparable public and load-bearing internal signatures
- Call sites, dependency construction, injection, registration, and dispatch
- Module layout, visibility, naming, and conversion conventions
- Test seams, fixtures, generated artifacts, schemas, and migrations

Identify both patterns worth reusing and inconsistencies that should not be copied. Present the current graph and representative stacks before proposing replacements so the user can see what will be preserved, removed, or redirected.

Prefer light pseudocode and diff views:

```diff
entrypoint
  runCommand
+   handleCreateResource
+     ResourceClient.create(input)
+       POST /resources
+     renderResult
-   legacyCreateFlow
```

**Current-model criterion:** every architectural element maps to existing code, a deliberate new construct, or an explicit decision; every affected path is visible with its data, errors, ordering, and side effects.

## Draft the proposed execution model

Draft the proposed call graph before finalizing types and signatures. Show concrete functions and methods, boundary crossings, fan-out, state changes, and side effects. Annotate each important edge with the data and errors crossing it.

Walk the primary success stack with the user:

```text
Entry point
  -> boundary parsing or conversion
  -> owning operation
  -> dependencies and side effects
  -> result or error translation
  -> externally observable outcome
```

Walk each materially different failure, retry, timeout, cancellation, partial-success, background, or event-consumer stack separately. Use these paths to expose ordering, ownership, transaction boundaries, and failure semantics.

## Derive the code shape

Derive and refine:

- Exact new and changed types, fields, variants, and invariants
- Exact public and load-bearing internal signatures
- Return, result, and error types
- File-tree diff with every new, moved, changed, generated, and removed file justified
- Module, package, and repository placement
- Transport, domain, persistence, and event conversions
- Dependency construction, wiring, registration, and feature gating
- Persistence changes, migrations, API schemas, and event schemas
- State, context, cancellation, and error propagation
- Production and test call sites affected by changed signatures
- Test seams and hands-on validation paths

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

Update the working artifact with:

- Current and proposed call graphs
- Representative call stacks
- Types and signatures
- File-tree diff
- State, error, and side-effect semantics
- Exact change surface
- Test and validation seams
- Rejected alternatives and open risks

Finish with traceability from every architectural contract to its concrete types, calls, state, errors, and validation seam.

**Complete when:** the user has reviewed the proposed graph and representative stacks; every important edge has an owner and justified data contract; every sequence-diagram message and architectural contract has a concrete realization; every changed public or load-bearing signature and call site is accounted for; every state transition, error, and side effect is traceable; all program-design pressure is resolved or blocking; and the user has explicitly approved the program design.
