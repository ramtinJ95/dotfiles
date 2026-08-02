---
name: visualize-code-changes
description: Create before/after/diff Mermaid diagrams with an optional complementary lens for a code change.
disable-model-invocation: true
argument-hint: "[scope] [--lens TYPE] [--second-lens TYPE] [--focus PATH]... [--out PATH|--slug NAME] [--render]"
---

# Visualize code changes

Produce one Markdown artifact with primary **Before**, **After**, and **What
changed** diagrams. When a second lens reveals a distinct, material effect, add
one complementary change view. Reconstruct behaviour from source; do not
translate diff hunks box by box.

## Context pointers

- If the invocation includes scope or flags, or the output path must be derived,
  read [`references/arguments.md`](references/arguments.md) before resolving
  scope.
- Before writing, instantiate [`assets/template.md`](assets/template.md).
- Read [`references/diagram-types.md`](references/diagram-types.md) before using
  a non-flowchart lens, drawing a relocation fate map, or replacing the merged
  diff with a side-by-side view.
- Read [`references/syntax-pitfalls.md`](references/syntax-pitfalls.md) before
  using advanced Mermaid syntax or fixing a validation failure.

## 1. Resolve the change set

Apply explicit scope, focus, lens, second-lens, and output arguments first.
Never replace a failed explicit PR, range, or commit with the working tree.

Without explicit scope, discover in this order:

1. a non-empty unstaged or staged change set;
2. a non-empty current-branch comparison against its default branch;
3. changes made in this session when git cannot describe them.

If all three are empty or unavailable, stop and report that no changes were
found; do not create an artifact.

Start with the scope's diff stat. Select the files carrying behaviour, honoring
`--focus`, and include one hop of callers or callees needed to explain the
change.

**Complete when:** the exact before/after sources, changed-file inventory,
focused files, and output path are known. Derive an omitted slug using
`references/arguments.md`. If an explicit scope cannot be read, stop with that
failure.

## 2. Reconstruct both sides

Read full surrounding code from the real before revision and the current after
revision. Use `git show <ref>:<path>` for historical files; do not infer control
flow from isolated hunks.

Classify affected units from their actual bodies:

- added or deleted;
- moved verbatim or moved with edits;
- renamed with preserved behaviour;
- behaviourally rewritten.

Trace every proposed node and edge to source. For a wholly greenfield change,
Before shows the capability's verified absence or the caller's prior external
path; for a complete deletion, After shows its verified absence or resulting
caller path. Do not invent an internal flow for an absent implementation. Mark
unresolved behaviour as uncertain.

**Complete when:** every diagrammed node and edge has source evidence, every
affected unit has a fate, and all remaining uncertainty is named.

## 3. Choose lens and altitude

Use `--lens` when supplied. It selects the primary lens and means primary-only
unless `--second-lens` is also supplied. `--second-lens` requires `--lens`;
stop with a clear error if it appears alone, duplicates the primary lens, is
invalid, or cannot be supported by inspected source. Explicit valid lenses pin
the decision and must not trigger another lens prompt.

Otherwise, choose a recommended primary lens from the inspected change:

| Change question | Lens |
|---|---|
| Which execution path changed? | control flow |
| What moved or depends on what? | dependency |
| Who calls whom, in what order? | sequence |
| Which lifecycle transitions changed? | state |
| How was data reshaped or passed? | data flow |
| Which type or schema shape changed? | structure |

The **dependency** lens can use a C4-style Context, Container, or Component
representation, but C4 is not another lens. Choose it only after inspected
source establishes a real architectural boundary:

- Context for a changed actor-to-system interaction or external system boundary.
- Container for a change crossing deployable services, applications, workers,
  or data stores.
- Component for a change crossing meaningful runtime/module boundaries inside
  one deployable container.

If manifests, entry points, imports/calls, configuration, or deployment files do
not establish the claimed boundary, use the ordinary module dependency graph.
Record source evidence for every C4 element and relationship in Notes; directory
names alone are not evidence. Follow the terminal-safe C4 profile in
`references/diagram-types.md`.

Consider at most one second lens. Propose it only when all three tests pass:

1. it answers a question distinct from the primary lens;
2. it exposes a material effect that the primary lens obscures;
3. every node and relationship is traceable to inspected before/after source.

Do not use PR narrative or conversational intent as evidence for automatic lens
selection or diagram content; explicit scope and lens flags remain instructions.
The change set, full surrounding source, and the inspected caller/callee hop are
authoritative. An explicit `--second-lens` overrides the first two suitability
tests, but never the source-evidence requirement.

When an interactive question tool is available and a second lens passes the
tests, ask once with composed choices: recommended primary plus second, primary
only, and second-as-primary only, such as `Control flow + dependency`, `Control
flow only`, and `Dependency only`. Explain the distinct question answered by
each choice. If no second lens passes, offer only the plausible primary lenses
and mark one recommended. Without an interactive tool, choose the recommended
primary, include a qualifying second lens, and state both choices.

Use one node per step you would name aloud to a colleague: a decision, external
effect, or meaningful transformation. Keep plumbing inside nodes. Aim for 5–15
nodes and one hop around the changed region; group or raise altitude when larger.

**Complete when:** the primary lens explains the dominant effect, its node set
is comparable across Before and After, any second lens passes the rules above,
and each node set is evidence-backed and within the altitude bound or explicitly
justified.

## 4. Write the artifact

Instantiate the template at `--out`, or at `docs/diagrams/<slug>.md`. Keep
Mermaid source as the canonical output even when SVG rendering is requested.
Remove all template comments and placeholders from the finished artifact.

- Lead with plain-language scope and outcome.
- Keep unchanged node names and altitude stable between Before and After.
- Give the primary lens all three views. In What changed, classify every node
  and edge as added, removed, changed, or unchanged. For flowcharts and state
  diagrams, use the template palette and legend. For sequence or structure
  diagrams, use the representation defined in
  `references/diagram-types.md` and adapt the legend.
- Quote labels defensively. Encode removed edges as dotted as well as styled so
  their meaning survives edge-index drift.
- For relocation, use a fate map whose edge labels say `moved verbatim`, `moved
  with edits`, or `deleted`; verify labels by comparing bodies.
- When selected, put `Complementary perspective — <Lens>` after the primary
  What changed view. Start with one sentence naming the distinct question it
  answers, then provide one merged diff using that lens.
- Automatically replace a merged view with an explicit side-by-side diff when
  it would be illegible. Switch when more than half the semantic nodes are
  added or removed, old and new paths form separate topologies sharing only an
  entry or exit, or the overlay creates plausible but nonexistent paths. Also
  switch when reasonable grouping cannot keep it near 5–15 nodes or readers
  would need to mentally hide most red or green elements. State the concrete
  reason; do not ask the user to judge an unseen diagram.
- Never add a third lens. Add a same-lens zoom only when it answers a distinct
  question concentrated in one changed unit and does not duplicate the second
  lens.

**Complete when:** all three primary views exist, the optional complementary
view follows its selected lens, every scoped behavioural change appears at the
chosen altitude, every diff element has a fate, and notes name omissions and
uncertainty.

## 5. Validate and hand off

Run the bundled validator against the Markdown:

```bash
python3 <skill-dir>/scripts/validate_mermaid.py <output.md>
```

When `--render` or images were requested, pass `--render-to <dir>` and require
`mmdc` plus Chrome/Chromium; missing renderer infrastructure is a visible failure,
not a successful heuristic fallback. Without rendering, fix every reported issue
and rerun; heuristic validation is acceptable when `mmdc` or Chrome is
unavailable, but state that the check was heuristic.

**Complete when:** the validator exits 0, every requested SVG exists, and the
handoff reports the Markdown path, a one-sentence change summary, validation
mode, and any unresolved uncertainty. A render request is incomplete until the
SVGs exist or the renderer failure is reported to the user.
