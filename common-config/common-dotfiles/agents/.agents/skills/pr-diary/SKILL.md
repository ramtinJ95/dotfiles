---
name: pr-diary
description: Write a concise re-entry map for one merged pull request.
disable-model-invocation: true
---

# PR Diary

Produce one first-person engineering diary entry that preserves the decision
trail and provides a re-entry map into the merged code. It is not release notes
or an exhaustive change summary.

Invocation authorizes writing the diary entry only. Do not commit, push, change
the PR, switch branches, or modify the source repository.

## Evidence boundaries

- Use the current conversation for motivation, constraints, decisions, rejected
  options, surprises, and changes in thinking.
- Use the merged PR and code for implementation facts, signatures, execution
  paths, tests, and invariants.
- Use review discussion for decisions made during review.
- Describe the evolution when intent and merged code differ.
- Never infer personal rationale from code or PR prose alone.

## 1. Resolve the merged PR

Require a PR URL or an unambiguous repository and PR number. Verify and collect:

- repository, PR number, and title
- merged state, merge date, and full merge commit SHA
- final diff and commits
- PR description, linked issues, and review discussion

Stop without writing if the merged state or final diff cannot be verified.

Use a matching local checkout when available: try the current repository, then
checkouts under `~/workspace` and `~/personal`. Match Git remotes, not directory
names. Inspect the merge commit and its files with read-only Git commands. Do
not switch branches or alter the working tree. If no checkout can be identified
safely, ask for its path.

Write to:

```text
~/personal/pr-diary/<repository>/<year>/
  <merge-date>-pr-<number>-<title-slug>.md
```

Use the repository basename for `<repository>`. If it already denotes a
different remote, ask the user for a distinct name. Search all existing entries
by the `repository` and `pr` frontmatter fields. If one exists, report its path
and stop unless the user explicitly requested a revision.

**Complete when:** required identifiers and the final diff are verified,
optional context is collected or confirmed absent, the merged code is readable,
and the destination is unique and unambiguous.

## 2. Reconstruct the decision trail

Before drafting, account for:

- the original problem and why it mattered
- constraints and assumptions
- material options, decisions, and rationale
- rejected approaches
- changes prompted by implementation or review
- surprises, lessons, remaining doubts, and follow-up

Treat PR prose as supporting evidence, not proof of personal rationale. If a
load-bearing decision remains unresolved, make one `ask` call containing no more
than three focused questions. Do not ask about routine implementation details.

If the user supplies no further rationale, omit immaterial uncertainty and name
any material unknown whose omission would misrepresent the history.

**Complete when:** every material decision is grounded in conversation or
review evidence, or is plainly marked unknown; no rationale is invented.

## 3. Trace the re-entry map

Read the final diff and relevant files as they existed at the merge commit. Do
not infer the design from filenames. Identify:

- the best entry point into the changed code
- up to five load-bearing method or function signatures
- affected components and architectural boundaries
- the changed call graph, control flow, or data flow
- important invariants and coupling
- tests that demonstrate the intended behavior
- hazards likely to matter in a future change

Use exact paths, symbols, and signatures. Break long signatures into multiline
declarations.

Represent the execution path once, in its smallest useful form:

- text call stack for a mostly linear synchronous path
- Mermaid sequence diagram for ordered cross-component interactions
- Mermaid flowchart for branching flow or ownership changes
- Mermaid component graph for changed architectural boundaries

Use at most one Mermaid diagram, normally with 6 to 12 nodes or participants.
Show before and after only when both are evidenced and the path materially
changed. Do not duplicate a path across prose, text graph, and diagram.

**Complete when:** the map names an entry point, follows the load-bearing path
to its effects, and identifies its behavioral tests or explicitly confirms that
none exist.

## 4. Write the entry

Use this frontmatter:

```yaml
---
project: <repository basename>
repository: <owner/repository>
pr: <number>
merged: <YYYY-MM-DD>
merge_commit: <full SHA>
---
```

Use this section order and omit empty sections:

```markdown
# PR #<number>: <title>

## Context

## Decisions

## Code path

## Invariants and tradeoffs

## Reflection and follow-up
```

Write concise first-person prose for the user's future self. Prioritize:

1. rationale and decisions
2. code landmarks and invariants
3. tradeoffs and future hazards
4. execution path and implementation
5. routine mechanical details

Do not list every changed file, restate the PR description, mechanically narrate
commits, add generic lessons, use Markdown tables, or include long raw URLs.

The entire file, including frontmatter and diagrams, must be at most 800 words;
aim for 400 to 650. Every physical line must be at most 80 characters.

**Complete when:** one entry at the resolved destination satisfies this output
contract and works as both a decision trail and code re-entry map.

## 5. Validate and report

Before reporting:

1. Run `wc -w` on the entry; the result must be at most 800.
2. Run `awk 'length > 80 { print NR ":" length }'` on it; output must be empty.
3. Recheck metadata, paths, signatures, and any diagram against the merged PR
   and code.
4. Recheck every rationale claim against the evidence boundaries.
5. Confirm the entry is unique and the source repository was not modified.

Report the file path, word count, longest line length, and any material
rationale that remained unavailable.

**Complete when:** all five checks pass and the reported metrics match the file.
