import { agents, closeOverlay, focused, nextCommand, notify, openOverlay, panes,
  run, terminals } from "herdr";
import { FocusHistory, focusTarget, targetAlive } from "./model.js";

// Hosted by the visible tab bar, not an empty floating view: Herdr culls empty
// views and their render-based focus observations do not reliably run.
export class NavigationController {
  constructor(cx) {
    this.history = new FocusHistory();
    this.observe();
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        this.observe();
        if (command === "back") {
          const target = this.history.previous(this.target(), t => targetAlive(t, panes(), terminals()));
          if (this.overlay) closeOverlay(this.overlay);
          if (target) run(target.action.command, target.action.args);
          else notify({ title: "No previous location yet", level: "info" });
        } else if (command === "tabs" || command === "agents") {
          if (this.overlay) closeOverlay(this.overlay);
          this.overlay = openOverlay({ mod: "navigation", kind: "dialog", width: 720, height: 560,
            props: { kind: command, space: focused()?.space } });
        }
        cx.notify();
      }
    });
  }

  target() { return focusTarget(focused(), panes(), agents(), terminals()); }
  observe() { this.history.observe(this.target()); }
}
