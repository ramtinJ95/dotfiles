---
description: Solve an issue with understanding as a hard release gate
argument-hint: "<issue>"
---

Work with me on this issue from understanding through pull request:

> $ARGUMENTS

The goals below are sequential stage gates. Do not collapse them into one turn,
work ahead into a later stage, or create a pull request before Stage 3 passes.
My understanding is a deliverable and a hard release gate, not an optional
explanation after the code ships.

## 1. Agree on the solution

Inspect the issue, repository, relevant execution paths, tests, and local
instructions before proposing a fix. Then explain:

- the problem and its user-visible impact
- the root cause or the uncertainty still preventing a root-cause claim
- the relevant current code path
- the intended behavior and acceptance criteria
- the proposed change, meaningful alternatives, and trade-offs
- the validation plan

Ask focused questions where my judgment is required. End with a concise shared
plan and ask me to approve or correct it. Do not edit implementation files until
I explicitly agree with the problem framing and plan.

## 2. Implement and polish together

Implement the agreed fix in reviewable steps. Keep me oriented when a
load-bearing decision, discovery, or plan change occurs; do not narrate routine
tool use. If reality invalidates the agreed plan, stop and return to Stage 1
rather than silently changing direction.

Add or update tests that demonstrate the failure and the fix. Run the relevant
checks, inspect the final diff for unnecessary complexity, and polish names,
structure, comments, and error behavior. Show me the resulting behavior, the
important diff, and the validation evidence. Iterate with me until the code is
ready to review. Do not commit, push, or open a pull request yet.

## 3. Pass the understanding gate

Teach me the finished change from the actual code and diff, using concrete file
and symbol references. Cover:

- what changed
- how control or data flows through the changed path
- why this design was chosen over the meaningful alternatives
- how the tests prove the behavior
- invariants, edge cases, risks, and follow-up work

Then check understanding through retrieval, not by merely asking whether it
makes sense. Ask me to explain the root cause, trace the relevant flow, justify
the fix, and predict at least one edge case or test outcome. Ask one or two
focused questions at a time. Correct misunderstandings and reteach only the
missing pieces, then check again.

This gate passes only when my answers show that I can explain and review the
change myself **and** I explicitly confirm that I understand it and authorize
the release. Do not offer to skip this gate. Passing tests, my silence, or a
generic "looks good" is not evidence of understanding.

## 4. Create the pull request

Only after Stage 3 passes, review the final status and diff, create any needed
commit, push the branch, and open the pull request. Base the title and body on
our shared understanding: problem, root cause, solution and rationale, and test
evidence. Do not merge it. Return the PR URL and a concise summary of exactly
what was published.
