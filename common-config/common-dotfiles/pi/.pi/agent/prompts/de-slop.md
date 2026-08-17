---
description: Cull unnecessary complexity from the current change before a PR
argument-hint: "[base branch or focus]"
---

De-slop the current change before a pull request is created.

Additional base-branch or scope guidance from me: ${ARGUMENTS:-none}

Work from the repository's actual status and diff. Read the applicable project
instructions, determine the appropriate merge base, and inspect staged,
unstaged, and relevant untracked work. Keep the review centered on the current
change and its directly affected code; do not turn this into an unrelated
cleanup campaign. Never discard unrelated user changes.

## Simplify the implementation

Remove or reduce complexity that does not earn its place, including:

- dead code, redundant branches, duplicated logic, and needless indirection
- one-use abstractions, wrappers, helpers, configuration, and types that make
  the code harder to follow than the logic they replace
- speculative extensibility, compatibility paths, and fallback behavior not
  required by a concrete contract
- defensive handling that hides invalid states or makes failures ambiguous
- comments, names, and structure that narrate mechanics instead of clarifying
  a non-obvious invariant or decision
- dependencies or new files that can be avoided by using the repository's
  existing patterns

Prefer deletion, direct code, and reuse over adding another abstraction. Do not
optimize for fewer lines at the expense of behavior, readability, explicit
failure, or a boundary that genuinely isolates change.

## Cull low-value tests

Judge tests by the meaningful contract or regression they protect. Remove or
collapse tests that only:

- prove that a symbol, feature, route, command, or component exists or was
  registered, without exercising behavior that could realistically break
- restate guarantees already enforced by the type checker
- mirror the implementation or assert incidental call sequences, markup,
  classes, snapshots, or other implementation details
- duplicate stronger coverage without adding a distinct boundary, failure
  mode, or regression

For third-party providers and adapters, do **not** build a fake version of the
provider and then test that fake's assumed schema or behavior. Remove mocks and
fixtures that merely restate an external SDK or API. Keep focused tests for the
contract our code owns: translation into domain types, outbound request
construction when it contains our policy, error mapping, and other behavior at
the adapter boundary. If compatibility with the real provider matters, prefer
an explicit integration or contract test over an elaborate unit-test
simulation.

Cull UI/UX tests heavily when they freeze presentation details. Keep tests for
high-value user journeys, accessibility behavior, state transitions, and known
regressions. Likewise, do not test command registration by itself when it is
static or guaranteed by types; test dispatch or execution only when our wiring
contains meaningful behavior or has failed before.

Do not replace deleted low-value tests with different low-value tests. Do not
weaken meaningful regression coverage merely to make the suite smaller.

## Execute and report

Make the simplifications you can justify confidently. If simplification would
change public behavior, compatibility, failure semantics, or meaningful test
coverage, stop and ask rather than silently choosing the trade-off.

Run the smallest relevant formatter, typecheck, lint, and test commands that
validate the resulting change. Then inspect the final diff again for residue.
Report concisely:

- what was removed or simplified and why
- which contracts and tests remain load-bearing
- validation run and its result
- any complexity retained deliberately or judgment calls still needing me

Do not commit, push, or create the pull request.
