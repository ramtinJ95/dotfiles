# Prefix navigation

Installed by `scripts/herdr-mods install`, using the shared Ctrl-f bindings.
Press and release Ctrl-f, then the next key; uppercase means Shift plus the letter.

| After Ctrl-f | Action |
|---|---|
| h / j / k / l | Adjacent pane left / down / up / right |
| H / L | Previous / next tab in this space |
| 1–9 | Tab by position |
| b | Search tabs in this space |
| a | Open the agent launcher across spaces, current space first |
| Tab | Toggle back to the previous pane or agent |
| v / - | Split right / down |
| z | Zoom pane |
| ? | Herdr shortcut help |
| Ctrl-f again | Forward literal Ctrl-f to the terminal |

Existing n/p tab shortcuts, w (the original all-space picker), g (commands),
e (nexus), t (tuido) and other bindings remain available. No global macOS,
skhd/Macarchy or Neovim key is reassigned. Ctrl-f remains reserved by Herdr;
double Ctrl-f is needed for the shell/editor's original Ctrl-f action.

The tab picker starts in text search as before: type to filter, Ctrl-j/k or
arrows to select, Enter to jump, Escape to cancel.

The agent launcher starts in **Browse** mode, with live status counts and these
popup-local shortcuts (no extra leader):

| Key | Action |
|---|---|
| n | Jump immediately to the next **Needs you** (blocked) agent |
| d | Jump immediately to the next **Done** agent |
| w | Show working agents |
| a | Show all agents |
| / | Enter text search within the selected category |
| j / k, or arrows | Browse the list |
| Enter | Jump to the selected agent |
| Esc | Close the launcher |

n/d skip the currently focused agent and wrap through stable list order. If
there is no other match, the popup stays open and explains why. Viewed done
agents become idle through Herdr, so repeated done jumps visit the remaining
unseen completions. Buttons provide the same actions for mouse navigation.

In agent **Search** mode, letters are text, not status shortcuts. Ctrl-j/k or
arrows select results, Enter jumps, and Escape clears search and returns to
Browse (a second Escape closes). Search terms match titles, space/tab names,
program and agent addresses. Agents are not urgency-sorted: status updates do
not reorder rows. Nested agents without panes are included and focused by their
exact address.

The visible `focus-tabs` clone receives `focus-tabs.tabs`, `focus-tabs.agents`
and `focus-tabs.back`. History observes actual focus on its render updates, skips
closed targets, keeps at most 40 distinct locations, and resets when the layout
tab bar is recreated (including app restart). It does not write session
history to dotfiles. The setup helper installs controller/model assets into the
owned tabs clone and attaches its init/render hooks, without replacing panels.
An empty floating controller is deliberately avoided: Herdr culls those views,
so their render-based focus observations can miss intermediate navigation.
