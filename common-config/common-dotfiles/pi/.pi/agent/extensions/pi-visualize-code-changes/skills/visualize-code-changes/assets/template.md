# <Change name> — before & after

**Scope:** `<git ref, PR, or uncommitted working tree>`  
**Files:** `<path/one>`, `<path/two>`

<Two or three plain-language sentences describing what changed and why.>

## Before

<Key property of the old behaviour.>

```mermaid
flowchart TD
  <before flow>
```

## After

<Key property of the new behaviour.>

```mermaid
flowchart TD
  <after flow>
```

## What changed

```mermaid
flowchart TD
  <merged flow with every node and edge assigned a fate>

  classDef added   fill:#d4f8d4,stroke:#2ea043,color:#1f2328
  classDef removed fill:#ffd7d5,stroke:#cf222e,color:#1f2328
  classDef changed fill:#fff5cc,stroke:#bf8700,color:#1f2328
  classDef same    fill:#f6f8fa,stroke:#8c959f,color:#1f2328
```

**Legend** — 🟩 added · 🟥 removed · 🟨 modified · ⬜ unchanged.  
Dotted red edges are paths that no longer exist.

<!-- For sequence, class, or ER lenses, replace this default flowchart block and
legend with the diff representation from references/diagram-types.md. -->

<!-- Include this entire section only when a second lens is selected. Use one
merged diff unless the legibility rubric requires an explicit side-by-side. -->

## Complementary perspective — <Lens>

<One sentence naming the distinct question this perspective answers.>

```mermaid
flowchart LR
  <complementary merged or side-by-side diff>
```

<Adapted legend, or the concrete reason a side-by-side view was required.>

## Notes

- <Omitted files, operational implications, or migration ordering.>
- <Behaviour inferred rather than confirmed.>
