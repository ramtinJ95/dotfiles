---
name: program-design
description: Build an evidence-backed architecture and detailed program design for a core feature before implementation.
disable-model-invocation: true
---

# Program Design

Turn a feature plan into an agreed architecture, concrete program design, and ordered vertical slices. Preserve **traceability** from requested behavior through ownership and code paths to validation.

This is a collaborative design gate, not a quiz. Do the repository legwork, propose grounded designs, and reserve consequential decisions for the user.

## Rules

- Read the feature plan, repository instructions, and relevant design documents before proposing changes.
- Label claims as `Observed`, `Inferred`, `Proposed`, `Decided`, or `Open`. Attach file-and-line evidence to load-bearing observations.
- Use bounded explore subagents when two or more repository investigations can proceed independently. Ask them for findings, evidence, implications, and uncertainty—not final designs. Synthesize one model and verify critical or conflicting claims directly.
- Present material decisions with evidence, viable options, tradeoffs, and a recommendation. Ask only after doing that work.
- Prefer existing ownership and abstractions. Expose architectural pressure instead of hiding it with pass-through parameters, fallback layers, adapters, or parallel abstractions.
- Treat call graphs and representative call stacks as working design artifacts. Recover the current paths before choosing a concrete design, draft proposed paths before finalizing types and signatures, and update them as decisions change.
- Reopen architecture when concrete program-design evidence contradicts it.
- Maintain one coherent working artifact using repository conventions. If no destination is established, work in chat and ask before creating a persistent file.
- Do not implement the feature unless the user separately asks.

## 1. Establish the design basis

Extract:

- Problem and desired behavior
- Actors and externally observable outcomes
- Acceptance criteria
- Constraints and non-goals
- Existing decisions
- Assumptions and unresolved behavior

Map every requested behavior to an acceptance criterion. If behavior that would change ownership, contracts, data, or system guarantees is ambiguous, present the missing decision instead of designing around a guess.

**Complete when:** every requested behavior is defined well enough to design, explicitly out of scope, or recorded as blocking.

## 2. Recover the current architecture

Investigate the system surface implicated by the requested behavior:

- Components, responsibilities, ownership, and allowed dependencies
- Analogous success, failure, and asynchronous paths
- Data ownership, persistence, contracts, events, and conversion boundaries
- Authorization, consistency, concurrency, and operational constraints
- Tests and documents that express current contracts
- Cross-repository and external-system dependencies

Synthesize:

- Relevant components and responsibilities
- Boundaries and semantic contracts
- Sources of truth and logical data flow
- Dependency direction
- Call and event paths
- Constraints, invariants, and inconsistencies

Do not paste raw subagent reports. Reconcile terminology, disagreements, and uncertainty.
Keep flows at the component and boundary level during this phase; defer concrete functions and methods until the architecture is agreed.

**Complete when:** every component, boundary, source of truth, side effect, and material constraint implicated by the feature is evidenced or explicitly marked unknown.

## 3. Agree the feature architecture

Architecture answers:

> Which parts of the system participate, what does each part own, and how may they interact?

Classify the feature:

- **Fits:** existing ownership, boundaries, and contracts support it.
- **Extends:** it deliberately changes a component, contract, data owner, dependency, or system constraint.
- **Conflicts:** a straightforward implementation would violate an existing architectural rule or guarantee.

Propose the architecture without choosing code-level representations:

- Participating components
- Responsibility and data ownership
- Boundaries and semantic contracts
- Logical data model and invariants
- Dependency direction and data flow
- Consistency, transaction, concurrency, and idempotency semantics
- Failure, retry, and partial-success semantics
- Authorization and security boundaries
- Operational and cross-repository consequences

Compare viable alternatives when the architecture does not determine one answer. Recommend one and record rejected alternatives with reasons.

Treat unclear ownership, cyclic or forbidden dependencies, duplicated sources of truth, cross-boundary transactions, incompatible guarantees, and contract bypasses as architectural pressure. Resolve the pressure with the user or mark it blocking; do not continue because a workaround exists.

Present the proposed architecture and pause for explicit agreement.

**Complete when:** every requested behavior has an agreed owner and architectural path; every boundary, source of truth, side effect, and system guarantee is explicit; and the user has agreed to proceed.

## 4. Recover the current execution model

Map the agreed architecture onto the repository:

- Exact current call graph for the analogous or affected behavior
- Representative success, failure, retry, background, and event-consumer call stacks
- Inputs, outputs, errors, state transitions, and side effects on important graph edges
- Existing domain, boundary, persistence, event, and error types
- Comparable function and method signatures
- Exact call sites, dependency construction, and injection
- Module layout, naming, visibility, and conversion conventions
- Test seams, fixtures, generated artifacts, and migrations

Identify both patterns worth reusing and inconsistencies that should not be copied.
Present the current graph and stacks before proposing their replacements so the user can see which behavior is preserved, removed, or redirected.

**Complete when:** every architectural element maps to existing code, a deliberate new construct, or an explicit design decision; and every affected current path is visible with its data, errors, ordering, and side effects.

## 5. Agree the detailed program design

Program design answers:

> Exactly how will the agreed architecture be represented and executed in this codebase?

Draft the proposed call graph first. Show concrete functions and methods, boundary crossings, fan-out, and side effects. Annotate each important edge with the data and errors that cross it.

Walk the primary success stack with the user:

```text
Entry point
  → boundary parsing or conversion
  → owning operation
  → dependencies and side effects
  → result or error translation
  → externally observable outcome
```

Walk each materially different failure, retry, partial-success, background, or event-consumer stack separately. Use the graph and stacks to expose ordering, ownership, transaction boundaries, and failure semantics before finalizing code contracts.

Derive and refine:

- Exact new and changed types, fields, variants, and invariants
- Exact public and load-bearing internal signatures
- Return and error types
- File, module, package, and repository placement
- Transport, domain, persistence, and event conversions
- Dependency construction and wiring
- Persistence changes, migrations, API schemas, and event schemas
- State, context, and error propagation
- Expected production and test file changes, each justified by responsibility

For every material proposal, cite repository evidence, show that it preserves the architecture, and explain any real alternative. Update the graph and stacks as types, signatures, and placement settle; iterate until the interactions and code contracts agree.

Treat unused parameter threading, unjustified duplicate representations, misplaced domain behavior, broad mocking for local rules, unrelated signature fallout, and unexplained call depth or fan-out as program-design pressure. Return to architecture when the pressure contradicts ownership, boundaries, or guarantees.

Present the updated call graph, representative stacks, and resulting program design together. Pause for explicit agreement.

**Complete when:** the user has reviewed the proposed graph and representative stacks; every edge has an owner and justified data contract; every architectural contract has a concrete realization; every changed public or load-bearing signature and call site is accounted for; every state transition, error, and side effect is traceable; and the user has agreed to proceed.

## 6. Derive vertical slices

Divide the design into the smallest ordered slices that each deliver observable, testable behavior. Do not group work merely by layer or file type.

For each slice specify:

- Behavior delivered
- Production changes
- Tests and validation
- Dependencies on earlier slices
- Migration, compatibility, and rollout concerns
- Cross-repository coordination and landing order
- A checkable completion point

Place the riskiest assumption early enough to invalidate the design cheaply. Make safe stopping points explicit.

**Complete when:** every program-design element belongs to a slice, every slice has an observable result and validation, and the order respects all dependencies and coordination constraints.

## 7. Produce the implementation handoff

Update the working artifact with:

```markdown
# Feature

## Design basis
## Current architecture
## Agreed feature architecture
## Detailed program design
## Call stacks and call graph
## Expected change surface
## Vertical slices
## Tests and validation
## Cross-repository coordination
## Rejected alternatives
## Open decisions and risks
## Implementation constraints and allowed flexibility
```

Preserve the agreed working graph and representative stacks in the handoff; do not introduce them for the first time here. Separate decisions the implementer must preserve from local choices left open. Do not permit silent drift in ownership, public contracts, data semantics, dependency direction, or failure guarantees.

Finish with a traceability table:

```text
Behavior | Architectural owner and contract | Concrete types and calls | Slice | Validation
```

**Complete when:** every requested behavior has a complete traceability row, no blocking decision is disguised as implementation flexibility, and the artifact is ready for implementation or explicitly marked blocked.

## Boundary

- If the user wants one-question-at-a-time interrogation or stress-testing, tell them to invoke `$grill-me`; do not reproduce it here.
- Recommend a focused experiment when evidence cannot settle an assumption, but do not implement the production feature as part of this skill.
