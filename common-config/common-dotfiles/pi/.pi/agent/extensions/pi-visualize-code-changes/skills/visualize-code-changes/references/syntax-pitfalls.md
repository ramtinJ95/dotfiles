# Mermaid syntax pitfalls

The failure modes that actually break generated diagrams, roughly in order of how
often they bite. Run `scripts/validate_mermaid.py` rather than trusting a visual
scan — several of these render *silently wrong* rather than erroring.

## Contents

1. [Unquoted characters in labels](#1-unquoted-characters-in-labels)
2. [Reserved words](#2-reserved-words)
3. [Theme-safe styling](#3-theme-safe-styling)
4. [Style classes](#4-style-classes)
5. [Edge styling by index](#5-edge-styling-by-index)
6. [Subgraphs](#6-subgraphs)
7. [Terminal-safe C4 profile](#7-terminal-safe-c4-profile)
8. [Comments](#8-comments)
9. [Sequence-diagram specifics](#9-sequence-diagram-specifics)
10. [Node ids](#10-node-ids)

---

## 1. Unquoted characters in labels

The number one break. `(`, `)`, `[`, `]`, `{`, `}`, and `|` terminate a label
early, and since code labels are full of call signatures this hits constantly.

```
A[login(req)]          ✗ Parse error
A["login(req)"]        ✓

B[arr[0]]              ✗
B["arr[0]"]            ✓

C[map|filter]          ✗
C["map|filter"]        ✓
```

Quote defensively — a quoted label never hurts, so wrap anything containing
`()[]{}|:,;`. For a literal double quote inside a label use `#quot;`, and for
other awkward characters use HTML entities: `#35;` is `#`, `#59;` is `;`.

Angle brackets need entities too, because Mermaid renders labels as HTML:

```
D["Vec<String>"]       ✗ renders as an empty tag
D["Vec&lt;String&gt;"] ✓
```

## 2. Reserved words

`end` breaks flowcharts when used as a node id or bare label — the parser reads it
as closing a `subgraph`:

```
flowchart TD
  start --> end          ✗
  start --> endNode      ✓
  start --> E["end"]     ✓
```

`graph`, `subgraph`, `class`, `click`, `style`, and `direction` are similarly
unsafe as bare ids. Capitalising (`End`) works but reads oddly; a descriptive
rename is better.

## 3. Theme-safe styling

Diagrams get read in both light and dark mode. `classDef` that sets only `fill`
leaves text colour inherited, so dark-mode readers get dark text on a light fill:

```
classDef added fill:#d4f8d4                              ✗ unreadable in dark mode
classDef added fill:<fill>,stroke:<stroke>,color:<text>  ✓ use template values
```

Always set `fill`, `stroke`, and `color` together. Copy the authoritative palette
from `assets/template.md`.

Avoid `%%{init: {'theme':'dark'}}%%` — it pins one theme and looks broken for
half your readers.

## 4. Style classes

Referencing an undefined class is *not* an error. The diagram renders, silently
unstyled — so a visual check passes while the colour coding that carried your
meaning is gone.

```
A["x"]:::added         ← needs the template's matching classDef in this block
```

Two application forms:

```
A["x"]:::added                 inline
class A,B,C added              statement form, several nodes at once
```

`classDef` must live in the same block as the nodes it styles; nothing carries
across fenced blocks. The validator flags this case specifically.

## 5. Edge styling by index

`linkStyle` takes 0-based indices counted in **declaration order across the whole
block**, including edges declared inside subgraphs:

```
linkStyle 2,4 stroke:#cf222e,stroke-dasharray:5
linkStyle 3 stroke:#2ea043
```

Two traps. An out-of-range index is a hard error (the validator catches it). A
merely *wrong* index is not — it silently paints the wrong edge, which is worse,
because the diagram then asserts something false. Recount after any edit that adds
or reorders edges.

Where dashed-vs-solid carries the meaning, encoding it in the arrow itself is
more robust than an index that drifts:

```
A -.-> B     dotted, survives reordering
A ==> B      thick
```

## 6. Subgraphs

Give a subgraph an explicit id when the title has spaces, otherwise the title
becomes the id and breaks references:

```
subgraph Auth layer        ✗
subgraph auth["Auth layer"] ✓
  ...
end
```

Every `subgraph` needs its own `end`. Edges may cross subgraph boundaries freely,
but declare them *outside* the subgraph blocks to keep layout predictable.

For C4-style views, do not use subgraphs at all; see the next section.

## 7. Terminal-safe C4 profile

Native Mermaid C4 syntax is not part of the portable profile. Use an ordinary,
flat flowchart with exact textual role prefixes:

```
flowchart TB
  API["Container: API — System: Product"]
  Queue["External: Queue"]
  API -->|publishes Job| Queue
```

The allowed prefixes are `Person:`, `System:`, `Container:`, `Component:`, and
`External:`. Keep labels concise, encode ownership in the label, label every
relationship, and use one global `TB`, `TD`, `BT`, `LR`, or `RL` direction.

Do not use `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, or
`C4Deployment`. Do not wrap C4 nodes in subgraphs: cross-subgraph edges can end
at a terminal-rendered boundary frame rather than the named node, silently
misstating the architecture.

## 8. Comments

`%%` must start the line. A trailing comment after content is unreliable:

```
  A --> B  %% explanation      ✗ can swallow the edge
  %% explanation
  A --> B                      ✓
```

## 9. Sequence-diagram specifics

Messages use a different arrow vocabulary from flowcharts — flowchart arrows are
invalid here:

```
A->>B: solid arrow, request
A-->>B: dashed arrow, response
A-)B: async
```

Declare participants up front to fix left-to-right order; otherwise it is decided
by first appearance:

```
sequenceDiagram
    participant C as Client
    participant S as Service
```

Colons separate the message from its text, so a colon *inside* message text needs
escaping or rewording. `alt`/`else`/`opt`/`loop` blocks each close with `end`.

## 10. Node ids

Ids must start with a letter or underscore, and cannot contain spaces or hyphens.
The label carries the human-readable name:

```
my-node["Label"]       ✗ hyphen
order id["Label"]      ✗ space
myNode["Label"]        ✓
order_id["Label"]      ✓
```

Reusing an id re-references the same node — useful for converging paths, but a
silent merge if it was accidental. Declare the label once and reference the bare
id afterwards:

```
A["parse()"] --> B
C --> A
```
