---
name: herdr
description: "Use Herdr app and Herdr Core when the user explicitly asks about Herdr, its window, spaces, tabs, panes, terminals, or agents. Do not load merely because a task could benefit from delegation. Uses herdr-app and hc, not the retired herdr TUI."
---

# Herdr app and Core

Choose the surface that owns the operation:

| Need | Surface |
|---|---|
| Pi agent discovery, spawning, communication, result collection or focus | Pi’s `agents` tool (`tools.agents` in Code Mode) |
| Window, layouts, mods, spaces, tabs and panes | `herdr-app` |
| Ordinary processes, terminal output and machine connections | `hc` (Herdr Core) |

The old `herdr` CLI and its workspace/pane IDs are not these APIs. Never gate
Core access on `HERDR_ENV=1`. `HC_TERMINAL_ID` is this terminal’s address;
`HC_TERMINAL_SOCKET` identifies its Core connection. Without caller context,
do not assume the app’s focused pane is yours or take over an arbitrary session.

## Discover the installed interfaces

For app work, read `~/.config/herdr-app/AGENTS.md` (or the home selected by
`HERDR_APP_HOME`). It is generated for the installed app and is authoritative.

```sh
herdr-app --help
herdr-app status
herdr-app ls
herdr-app commands
hc --help
hc --skill
```

Use `hc <command> --help` for exact flags. Do not run bare app/CLI commands
that launch a UI to discover syntax. Pass required arguments to mutations.
Treat returned space/tab/pane/terminal IDs as opaque; never construct them
from a sidebar position. An app pane ID and a Core terminal address differ.

## Agents in Pi

Read the tool’s current help **alone**, then use the returned contract:

```js
text(await tools.agents({}));
```

- `list`/`find`: discover existing sessions; they may be independent peers.
- `spawn`: `explorer` for read-only discovery, `reviewer` for explicit reviews,
  `general` for implementation only when the user explicitly delegates it.
  Give a distinct scope, `cwd`, short `label`, and desired result. No
  `user_requested` or `interactive` argument exists in this contract.
- `send`: message or steer an existing session; `assign`: delegate work and
  receive its result. Do not attach a peer merely to talk to it.
- `read`: `latest` for its answer/pending questions; `visible` or `recent`
  for terminal evidence. Read a returned Notes path when shared Notes is available.
- `reply`: resolve a pending extension question using the template in the
  report; `send` does not resolve such a question. Never self-approve a blocker.
- Background results arrive automatically. Do useful work or end the turn;
  do not poll, sleep, or run another wait to obtain them. Use `blocking: true`
  only when the caller needs the result before proceeding.
- Keep workers interactive. If startup fails, diagnose/report it; never retry
  headlessly. Do not issue raw `hc run/send/keys/kill` for supported agent
  operations or resurrect the legacy `spawn_agent`/`herdr_agent` wrappers.
- Close only a worker you own and are finished with, through `send` with
  `/quit` alone. Do not end another person’s agent.

If the `agents` tool is unavailable, report that Pi’s Core integration is
missing. Outside Pi, use that harness’s supported agent tooling; this skill
does not authorize spawning agents or bypassing permissions with shell commands.

## Ordinary terminal work

Use explicit terminal addresses and a deliberate working directory. For
example, a background **non-agent** test process:

```sh
hc run --bg --name test-run --cwd /path/to/repo -- npm test
hc wait test-run --timeout 60
hc read test-run --lines 50
```

Check the installed help for timeout/exit semantics. A timeout need not mean
the process ended: inspect its returned address instead of launching a duplicate.
Read output and exit status before claiming success. Diagnose stalled progress
and report the current phase rather than silently polling. Remove only test
terminals you created, after collecting their output.

Use `herdr-app do` for visible structure and `hc` for process state. Target an
explicit pane/tab when editing someone else’s window; implicit targets follow
UI focus, which may change. Avoid creating tabs/spaces or stealing focus unless
needed by the user’s request. Never restart Core or kill the app to fix a mod.

## App customization

Shipped layouts and mods are replaced by app updates. Clone before changing
their structure/code; use settings for supported appearance/alert preferences.
Check `herdr-app status` for config/runtime errors after edits and run
`herdr-app check <mod-folder>` for every changed mod. A passing initial render
does not verify asynchronous UI behavior: also smoke-test the affected path.

## Machines

Discover configured machines before targeting one. Do not invent host names,
copy credentials, add routing or bridge tailnets. On the work Mac, personal
home machines remain reachable only through the approved `home-*` SSH aliases
or the home SOCKS proxy; the work Tailscale CLI is never the home control plane.
Report missing access instead of silently selecting another connection.
