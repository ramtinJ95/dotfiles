# Subagent Extension Codex-lite Design

## Why this document exists

The extension now uses the official upstream Pi `subagent` example as its baseline.

That means the upstream parity work is already done for our purposes. The next design question is no longer "how do we catch up to upstream Pi?" It is:

- which Codex-style ideas are worth borrowing
- which of those ideas fit Pi's extension architecture cleanly
- how far we want to go before the extension stops feeling simple and subprocess-based

This document therefore covers only one phase: **Codex-lite**.

## Baseline

The current baseline is the official Pi example, including:

- `single`, `parallel`, and `chain` execution modes
- bounded parallelism
- per-agent tool restrictions via frontmatter
- bundled sample agents like `scout`, `planner`, `reviewer`, and `worker`
- bundled workflow prompts like `/implement`, `/scout-and-plan`, and `/implement-and-review`
- official upstream rendering and subprocess bootstrap behavior

This baseline is intentionally treated as **already complete**. The scope below is only about the next layer on top.

## Goal

Improve visibility, handoff quality, and control-plane ergonomics by borrowing the best practical ideas from Codex **without** turning the extension into a full long-lived agent runtime.

## Design principles

### 1. Keep the subprocess model

Subagents should remain isolated `pi` subprocesses. We are not trying to build a resident thread manager inside the extension.

### 2. Borrow ideas, not architecture

Codex has a deeper native multi-agent runtime than a Pi extension can realistically mirror. We should copy the useful interaction patterns, not the entire system design.

### 3. Preserve clarity for the parent agent

Every added feature should make delegation easier to inspect and reason about. The parent should be able to answer:

- what is running
- what finished
- what failed
- what context was handed off
- what can be retried or resumed

### 4. Keep security boundaries explicit

Any behavior involving child approvals, project agents, tool inheritance, or recursive delegation should be visible and intentional.

### 5. Avoid prompt bloat

One of the reasons subprocess delegation is useful is context isolation. Any Codex-lite feature that injects too much child state back into the parent prompt needs to stay opt-in and compact.

## Non-goals

This design does **not** aim to:

- recreate Codex's full long-lived agent mesh
- create a persistent child-thread tree that behaves like a first-class session runtime
- silently forward approvals or user-input requests unless the architecture is proven safe
- turn the extension into a heavy workflow platform with too much hidden behavior

---

## The one phase: Codex-lite

This phase contains several workstreams, but they are all part of the same phase.

### Workstream A: Run registry and status model

The biggest current gap versus Codex is that subagent execution is still mostly tied to individual tool call output rows.

#### Objective

Add a lightweight session-scoped run registry so the extension can remember recent and active subagent runs in a structured way.

#### What to track

Each run should ideally capture:

- `runId`
- mode: `single`, `parallel`, or `chain`
- agent name or step list
- task text or task summary
- `cwd`
- start time and finish time
- status: queued, running, completed, failed, aborted
- final output summary
- usage summary
- relationship to a parent chain or parallel group if applicable

#### Why this matters

Codex feels stronger because the parent can reason about child state, not just child output text.

A run registry gives us a Pi-shaped version of that benefit without building a full thread runtime.

#### Pi-shaped implementation

Keep the registry:

- extension-managed
- session-scoped
- reconstructible from tool-result `details` when useful
- lightweight enough that it does not become a second session manager

#### Candidate UX

- richer `subagent` render output that shows `runId` and state transitions
- a `/subagent-runs` command for inspection
- a `subagent_status` read-only tool for the model when appropriate

#### Recommendation

This is the highest-value Codex-lite feature and should be the first one implemented.

---

### Workstream B: Structured handoffs

The upstream Pi chain flow is useful, but `{previous}` is still a blunt string-substitution mechanism.

Codex's handoffs feel better because the parent-child relationship is more structured.

#### Objective

Add structured handoffs so chained steps can receive controlled, compact context instead of raw string concatenation only.

#### Candidate handoff modes

A step could choose one of these inheritance modes:

- `none` — no prior output included
- `last_output` — pass the previous step's raw output
- `summary` — pass a compressed summary of the prior step
- `manual` — pass an explicitly provided handoff payload

#### Candidate handoff contents

A handoff packet could contain:

- prior output text
- summarized prior output
- extracted findings or bullet summaries
- shared task brief
- success criteria
- file references or relevant paths
- named artifacts created by prior steps

#### Why this matters

This is one of the easiest ways to get Codex-like coordination quality without inheriting Codex's runtime complexity.

#### Recommendation

Implement structured summary-oriented handoffs before attempting any child history forking or deep session inheritance.

That keeps the system understandable and makes prompts easier to audit.

---

### Workstream C: Parent-visible subagent state

Codex exposes active subagent state back to the parent in a more visible way than the current extension does.

#### Objective

Give the parent and the user a compact view of active or recent subagent activity without forcing them to scroll old tool rows.

#### Candidate features

- a small status widget for active runs
- a `/subagent-runs` or `/subagent-active` command
- optional contextual summaries of recent child activity
- clearer completion or failure notifications for long-running groups

#### Constraints

This must stay compact. Automatically stuffing detailed child history back into parent prompts would work against the extension's core value proposition.

#### Recommendation

Make this opt-in wherever possible:

- visible in UI and commands by default
- injected into model context only when specifically useful and compact

---

### Workstream D: Safer control plane

Codex has explicit control-plane mechanics around child agents: list, inspect, wait, and notify.

We do not need the full Codex model, but a lighter version would help a lot.

#### Objective

Add explicit operations for observing and coordinating subagent runs.

#### Candidate features

- `wait_for_subagents` or equivalent command/tool
- explicit completion notifications for parallel groups and long chains
- retry hooks for failed runs or failed chain steps
- max-concurrency and max-nesting policy limits
- clearer collision reporting for ambiguous or shadowed agent names

#### Why this matters

This would move the extension from "spawn and hope" toward a more inspectable orchestration layer.

#### Recommendation

Implement at least:

- wait/inspect support
- notifications for long-running groups
- explicit collision reporting

Retry and resumption can follow later if the basic run registry proves solid.

---

### Workstream E: Approval boundary investigation

Codex's strongest subagent feature is parent-routed approval and input handling.

That is also the part least likely to fit cleanly into a Pi extension without careful design.

#### Objective

Define an explicit policy for what happens when child runs need approval or interactive input.

#### Candidate policies

- **Best-effort mode:** child runs may fail when approval or interactive input is needed
- **Restricted-child mode:** child tools and policies are intentionally limited to reduce interactive approval paths
- **Bridged mode:** parent forwards child approval/input requests through a dedicated extension mechanism

#### Recommendation

Treat this as an architecture spike, not a default implementation commitment.

The safe current stance is either:

- best-effort behavior with clear failure messaging, or
- intentionally restricted child capabilities

Do not promise Codex-like approval routing until we know Pi's extension hooks can support it cleanly.

---

## Codex ideas to borrow vs defer

| Codex idea | Recommendation | Pi-shaped interpretation |
|---|---|---|
| child status model | Borrow | session-scoped run registry |
| list / inspect / wait workflows | Borrow | commands or read-only tools |
| structured handoffs | Borrow | summary-first handoff packets |
| compact parent-visible child state | Partial borrow | widget / command / minimal context injection |
| completion notifications | Borrow | explicit UI and tool-row status updates |
| retry / re-run ergonomics | Partial borrow | simple retry on top of run registry |
| history forking | Defer | prefer summaries first |
| parent-routed approvals | Defer | architecture spike first |
| long-lived agent mesh | Reject for now | keep subprocess model |
| cross-agent messaging network | Reject for now | chains plus registry are enough |

## Recommended implementation sequence

### Step 1

Implement the run registry and status model.

This unlocks better visibility and creates the foundation for later control-plane features.

### Step 2

Add structured handoffs for chained or multi-step flows.

This is the highest-value coordination improvement after visibility.

### Step 3

Add parent-visible status surfaces:

- command output
- optional widget
- clearer notifications

### Step 4

Add wait/inspect coordination and collision reporting.

### Step 5

Run an approval-boundary spike before committing to any approval-bridging behavior.

## Review checklist

These are the decisions to make before implementation starts.

- Do we want a session-scoped run registry?
- Do we want a user-facing `/subagent-runs` command?
- Do we want a model-facing `subagent_status` read-only tool?
- Do we want structured handoffs beyond `{previous}`?
- Do we want compact parent-visible active-run summaries?
- Do we want explicit `wait_for_subagents` support?
- Do we want retry or re-run support in this phase, or later?
- Do we want child approval behavior to remain best-effort for now?
- Do we want to investigate restricted-child policies before any approval bridging?

## Recommended default slice

If the goal is to keep momentum without overbuilding, the best first slice of Codex-lite is:

- **Run registry and status model**
- **Structured handoffs**
- **A simple inspect surface** such as `/subagent-runs`

That gives us the most useful Codex-inspired improvements:

- better visibility into what subagents are doing
- better multi-step coordination quality
- better observability after tool rows are collapsed
- better foundations for future wait/retry/notification features

without turning the extension into a complex multi-agent runtime.
