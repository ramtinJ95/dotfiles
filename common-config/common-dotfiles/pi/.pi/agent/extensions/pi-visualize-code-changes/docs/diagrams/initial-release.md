# Initial release — before & after

**Scope:** `95a8da6` (Initial release: pi skill for Mermaid before/after/diff diagrams)  
**Files:** `skills/visualize-code-changes/SKILL.md`, `scripts/validate_mermaid.py`, `assets/template.md`, `references/*`

This commit introduces a Pi skill that turns a code change into three Mermaid diagrams — before, after, and a colour-coded merged diff — so reviewers see behavioural structure instead of reconstructing it from hunks. There is no prior implementation: the “before” path is the ad-hoc review process the package replaces; the “after” path is the agent workflow plus the new `validate_mermaid.py` gate.

| File | What happened | Review effort |
| --- | --- | --- |
| `SKILL.md` | added — full agent workflow | all of it |
| `scripts/validate_mermaid.py` | added — only executable code | all of it |
| `assets/template.md` | added — output skeleton | skim |
| `references/diagram-types.md` | added — lens recipes | skim |
| `references/syntax-pitfalls.md` | added — Mermaid gotchas | skim |
| packaging (`package.json`, README, LICENSE, ignores) | added — publish plumbing | none for behaviour |

## Before

Understanding a change meant reading the diff and rebuilding control flow in your head. Diagrams, if anyone drew them, were optional and unvalidated.

```mermaid
flowchart TD
  REQ("code change to review") --> DIFF["read git diff / PR hunks"]
  DIFF --> MENTAL["reconstruct behaviour in head"]
  MENTAL --> JUDGE{"diagrams drawn?"}
  JUDGE -->|no| SHIP["merge with mental model only"]
  JUDGE -->|yes| HAND["hand-write Mermaid ad hoc"]
  HAND --> HOPE{"renders on GitHub?"}
  HOPE -->|yes| SHIP
  HOPE -->|no| RED["red error box / silent wrong style"]
  RED --> SHIP
```

## After

A structured agent skill discovers the change set, reads both sides of the code, picks a lens, writes three diagrams from a template, and refuses to hand off until validation passes.

```mermaid
flowchart TD
  INV("skill invoked") --> ARGS{"args pin scope/lens?"}
  ARGS -->|yes| SCOPE["use pinned scope"]
  ARGS -->|no| DISC["discover: uncommitted → staged → branch"]
  SCOPE --> STAT["git diff --stat; pick 2–3 key files"]
  DISC --> STAT
  STAT --> BOTH["read before via git show + after from tree"]
  BOTH --> LENS{"lens set?"}
  LENS -->|arg| LOK["use --lens"]
  LENS -->|ask tool| ASK["ask_user_question"]
  LENS -->|neither| AUTO["auto-pick from change shape"]
  LOK --> WRITE["write Before / After / What-changed from template"]
  ASK --> WRITE
  AUTO --> WRITE
  WRITE --> VAL[["validate_mermaid.py"]]
  VAL --> OK{"all blocks valid?"}
  OK -->|no| FIX["fix syntax; re-run"]
  FIX --> VAL
  OK -->|yes| OUT["hand over docs/diagrams/&lt;slug&gt;.md"]
```

## What changed

```mermaid
flowchart TD
  REQ("review a code change"):::same --> OLD["read hunks; rebuild flow mentally"]:::removed
  REQ --> INV["invoke visualize-code-changes skill"]:::added

  OLD --> JUDGE{"optional hand diagram?"}:::removed
  JUDGE -->|skip| SHIP["ship mental model"]:::changed
  JUDGE -->|draw| HAND["ad-hoc Mermaid, no gate"]:::removed
  HAND --> HOPE{"hope it renders"}:::removed
  HOPE --> SHIP

  INV --> SCOPE["pin or discover change set"]:::added
  SCOPE --> BOTH["read both sides of real code"]:::added
  BOTH --> LENS["choose lens + altitude"]:::added
  LENS --> WRITE["emit three diagrams via template"]:::added
  WRITE --> VAL[["validate_mermaid.py gate"]]:::added
  VAL --> OK{"valid?"}:::added
  OK -->|no| FIX["fix and re-validate"]:::added
  FIX --> VAL
  OK -->|yes| OUT["Markdown that renders on GitHub"]:::added
  OUT --> SHIP

  classDef added   fill:#d4f8d4,stroke:#2ea043,color:#1f2328
  classDef removed fill:#ffd7d5,stroke:#cf222e,color:#1f2328
  classDef changed fill:#fff5cc,stroke:#bf8700,color:#1f2328
  classDef same    fill:#f6f8fa,stroke:#8c959f,color:#1f2328
  linkStyle 0,2,3,4,5,6 stroke:#cf222e,stroke-dasharray:5
  linkStyle 1,7,8,9,10,11,12,13,14,15,16 stroke:#2ea043
```

**Legend** — 🟩 added · 🟥 removed · 🟨 modified · ⬜ unchanged.  
Dotted red edges are call paths that no longer exist.

## Zoom: `validate_mermaid.py` driver

The skill’s only executable surface. Mode selection prefers a real `mmdc` render, but never confuses infrastructure failure with a bad diagram.

```mermaid
flowchart TD
  MAIN("main files...") --> PARSE["parse CLI flags"]
  PARSE --> LINTONLY{"--lint-only?"}
  LINTONLY -->|yes| MODE_L["mode = lint"]
  LINTONLY -->|no| FIND["find_mmdc + nvm PATH fix"]
  FIND --> HAS{"mmdc found?"}
  HAS -->|no| FB1["fallback: mmdc not found"]
  HAS -->|yes| CHROME{"puppeteer browser or system Chrome?"}
  CHROME -->|Chrome path| PPTR["write puppeteer config"]
  CHROME -->|neither| FB2["fallback: no Chrome"]
  PPTR --> PROBE["renderer_works probe diagram"]
  CHROME -->|puppeteer cache| PROBE
  PROBE --> PROBE_OK{"probe ok?"}
  PROBE_OK -->|yes| MODE_R["mode = render"]
  PROBE_OK -->|no| FB3["fallback: mmdc could not run"]
  FB1 --> MODE_L
  FB2 --> MODE_L
  FB3 --> MODE_L

  MODE_R --> LOOP["for each file"]
  MODE_L --> LOOP
  LOOP --> EXT["extract_blocks: fences / ::: / .mmd"]
  EXT --> EMPTY{"any blocks?"}
  EMPTY -->|no| WARN["WARN and continue"]
  EMPTY -->|yes| EACH["for each block"]
  EACH --> WHICH{"mode?"}
  WHICH -->|render| RND["render_block via mmdc"]
  RND --> ROK{"render ok?"}
  ROK -->|yes| SEM["lint: undefined classDef / linkStyle only"]
  ROK -->|no| FAIL["FAIL + remapped line errors"]
  SEM --> SEMOK{"semantic ok?"}
  SEMOK -->|no| FAIL
  SEMOK -->|yes| PASS["ok"]
  WHICH -->|lint| FULL["lint_block full heuristics"]
  FULL --> LOK2{"clean?"}
  LOK2 -->|yes| PASS
  LOK2 -->|no| FAIL
  PASS --> NEXT["next block / file"]
  FAIL --> NEXT
  WARN --> NEXT
  NEXT --> DONE{"any failures?"}
  DONE -->|yes| EX1["exit 1"]
  DONE -->|no| EX0["exit 0"]
```

### Heuristic lint checks (when `mode = lint`, or semantic pass after render)

| # | Check | Why it exists |
| --- | --- | --- |
| 1 | Known diagram header | empty/garbage blocks |
| 2 | Balanced `subgraph` / `end` | structural parse breaks |
| 3 | Unquoted risky chars in labels | #1 real-world Mermaid break |
| 4 | `:::class` → defined `classDef` | silent colour loss |
| 5 | `linkStyle` index &lt; edge count | silent wrong edge colour |
| 6 | bare `end` node id | reserved-word trap |

## Notes

- **Greenfield:** every package file is newly added. The Before diagram is the prior human/agent review process, not a deleted codebase — there was nothing to `git show` before `95a8da6`.
- Packaging files (`package.json`, LICENSE, ignores) are omitted from the flow; they do not affect runtime behaviour beyond Pi discovering `./skills`.
- Follow-up commits after this SHA only touch docs/preview (ask-user recommendation, requirements table, gallery image) and are out of scope here.
- Edge colours in “What changed”: removed paths are indices 0,2–6; added paths are 1 and 7–16.
