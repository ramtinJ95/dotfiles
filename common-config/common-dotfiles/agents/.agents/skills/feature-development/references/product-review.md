# Product Review

Establish what to build and why before choosing how the system will implement it. Keep this phase in the user's world; park technical ideas unless feasibility blocks a product decision.

## Recover the product context

Read the feature request and any relevant product documents, issues, support evidence, analytics, existing flows, and prior decisions. Inspect the current user experience when doing so resolves ambiguity.

Bound repository research to evidence needed to understand current observable behavior and the problem. Do not recover component architecture, call graphs, or implementation change surfaces during this phase.

Distinguish:

- User evidence from stakeholder preference
- Existing behavior from requested behavior
- Explicit constraints from assumptions
- The problem from a proposed solution

Do not manufacture product certainty when evidence is absent. Mark it `Open`.

## Frame the problem

Identify:

- Affected actor or user
- Problem in that actor's terms
- Current workaround or failure
- Why the change matters now
- Externally observable outcome
- Non-goals and excluded actors or workflows

For an internal refactor, reliability change, or infrastructure project, use an engineering problem statement instead of forcing user-facing language. Preserve the same discipline: current pain, desired outcome, success signal, and non-goals.

## Specify behavior and success

Write concrete scenarios covering:

- Entry conditions and trigger
- Primary workflow
- Material alternate and failure workflows
- Permissions and actor differences
- Empty, partial, repeated, and interrupted states where relevant
- Compatibility or migration experience
- Observable result

Turn them into acceptance criteria. Map every requested behavior to at least one criterion and every criterion to a success signal or necessary constraint.

Define how success will be judged after shipping. Prefer an observable user outcome; use reliability, latency, error rate, support volume, or another operational signal when that better represents the problem.

## Make the experience tangible

For visual or interactive behavior, draft the smallest useful mockup, state diagram, example conversation, request/response example, or CLI transcript. Prefer an artifact the user can inspect over additional prose.

Mark mock data and intentionally omitted behavior. Treat feedback on the artifact as product decisions and update the scenarios and acceptance criteria.

## Handle feasibility questions

Keep technical ideas in a parking-lot subsection for system architecture. If feasibility prevents a product decision:

1. State the exact unknown and which product choice it blocks.
2. Recommend bounded repository research or a focused prototype.
3. Define the evidence that would settle it.
4. Return the result to product review before approving behavior.

Do not let an implementation convenience silently narrow the desired behavior.

## Present the product gate

Update the working artifact with:

- Problem and actors
- Desired behavior and scenarios
- Success signals
- Acceptance criteria
- Mockups or concrete examples
- Constraints and non-goals
- Technical parking lot
- Open product decisions

Present unresolved decisions with options, consequences, and a recommendation. Ask the user to approve the product review or decide the remaining blockers.

**Complete when:** every requested behavior is represented by an agreed scenario and acceptance criterion; success and non-goals are explicit; the experience is tangible where useful; every material product uncertainty is decided or blocking; and the user has explicitly approved the product review.
