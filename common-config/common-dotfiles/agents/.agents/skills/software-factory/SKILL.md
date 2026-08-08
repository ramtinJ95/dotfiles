---
name: software-factory
description: Run Dex Horthy's four-gate feature workflow with explicit human approval before implementation.
argument-hint: <feature or project>
disable-model-invocation: true
---

# Software Factory

Move feature work through four gates: **Product → Architecture → Program Design → Vertical Slices**. Work on one gate at a time. Gate 4 approval unlocks implementation.

## 1. Start or resume

Use `docs/plans/<feature-slug>/` as the durable record.

1. If `00-status.md` exists, read every plan document and inspect every mockup in the folder. Continue from the first unapproved gate or first unchecked slice. Preserve approved gates unless the user asks to revisit one or backtracking requires it.
2. Otherwise, read the **Artifacts and status** section of [REFERENCE.md](REFERENCE.md), create the plan folder and `00-status.md`, and mark Gate 1 `in progress`.
3. Put any decision made in chat that a fresh session would need into the plan documents or `00-status.md`.

**Complete when:** the durable record agrees with the current gate or slice, and no required decision exists only in chat.

## 2. Pass the four gates

Before working on a gate, read only its matching section in [REFERENCE.md](REFERENCE.md). Complete the gates in order.

### Gate 1 — Product

Define the end-user problem, one measurable business outcome, the announcement, and the screens. Express the product in user language; defer technical choices to Gate 2.

For UI work, create one throwaway plain-HTML mockup per screen in `mockups/`. Iterate until the user confirms the experience.

**Complete when:** every field in `01-product.md` is concrete, every screen is represented by an accepted mockup or the document says `no UI`, and the approval protocol below records explicit approval.

### Gate 2 — Architecture

Read the relevant current code before deciding how the feature fits. Account for touched modules, endpoints, data and query shapes, end-to-end flow, and external dependencies.

**Complete when:** `02-architecture.md` describes the feature against the actual codebase, covers every template section, and the approval protocol records explicit approval.

### Gate 3 — Program Design

Surface the implementation decisions that would otherwise be made silently: the exhaustive file change set, types and signatures, call stacks, test cases, and least-confident decisions. Signatures contain no implementation bodies.

**Complete when:** every anticipated file and main flow is accounted for, the proposed interfaces and tests are reviewable without reading implementation code, and the approval protocol records explicit approval.

### Gate 4 — Vertical Slices

Plan tracer bullets in build order. Each slice must cross every required layer and finish in a working, observable state. Slice 1 wires a mocked or hardcoded path end to end; Slice 2 replaces it with the real happy path; later slices add one capability each.

**Complete when:** `04-slices.md` covers the approved scope without horizontal phases, `00-status.md` contains the matching checklist, and the approval protocol records explicit approval.

Implementation code remains locked until this criterion is met.

## Approval protocol

Run this protocol at every gate:

1. Write or revise the gate document and synchronize `00-status.md`.
2. Present 5–10 or fewer decision bullets and the document path; keep the full document on disk.
3. Ask exactly: **"Approve Gate N, or what should change?"**
4. Stop for the answer. Only an unambiguous yes, approve, or continue counts as approval; otherwise revise the document and repeat the protocol.
5. On approval, record `APPROVED <date>` and mark the next gate `in progress`.
6. Ensure the plan folder can resume the workflow without chat history, then tell the user this is a safe fresh-session boundary.

If later work invalidates an approved decision, stop at that discovery. Set the affected gate to `in progress`, update its document, and re-run its approval protocol before continuing.

## 3. Build one slice

After Gate 4 approval, implement only the first unchecked slice.

1. Keep the diff limited to that slice's observable capability.
2. For each changed behavior, establish a test that fails without the behavior, then make it pass. Keep failures visible; repair the code or direction rather than skipping, weakening, or commenting out tests.
3. Prove the slice through the strongest available observation: run it, curl it, or browser-test it. Report the command or interaction and result.
4. Check off the slice in `00-status.md` and synchronize decisions and evidence needed by a fresh session.
5. Ask exactly: **"Continue to slice N+1, or re-steer?"** Stop for the answer.

**Complete when:** the slice works end to end, its meaningful tests pass and could fail against missing behavior, the durable record is current, and the user has the proof needed to choose whether to continue.

At slice boundaries, keep the human close to the code: summarize the reviewable diff and invite inspection when they have not reviewed a recent slice.

## Durable context

At a gate or slice boundary, offer to preserve decisions that outlive the feature:

- Architecture decisions: `docs/adr/NNNN-<slug>.md` with context, decision, and consequences. Supersede old ADRs rather than rewriting them.
- Off-repo dependencies an agent must know exist: `docs/external/`, including environment-variable names, dashboards, test accounts, and third-party setup. Record names and locations, not secret values.
