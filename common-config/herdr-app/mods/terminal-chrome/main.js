import { View, div } from "gpui-kit";
import { appHome, notify, props, readTextFile, theme, writeTextFile } from "herdr";
import { chromeColors, mergeColors } from "./palette.js";

export default class TerminalChrome extends View {
  init() {
    // A layout explicitly enables the controller. `herdr-app check` and opening
    // the mod alone must not rewrite the person's settings.
    this.enabled = props()?.enabled === true;
    this.wanted = null;
    this.applied = null;
    this.writing = false;
  }

  render(cx) {
    if (this.enabled) {
      const t = theme();
      this.wanted = JSON.stringify([t.background, t.terminal_foreground]);
      if (!this.writing && this.wanted !== this.applied) {
        this.writing = true;
        cx.spawn(async (cx) => {
          // Serialize writes; a theme picked during a write is applied next.
          while (this.applied !== this.wanted) {
            const key = this.wanted;
            try {
              const path = `${appHome()}/settings.json`;
              const source = await readTextFile(path);
              const next = mergeColors(source, chromeColors(...JSON.parse(key)));
              if (next !== source) await writeTextFile(path, next, source);
            } catch (error) {
              // No retry loop or silent overwrite on a stale snapshot/invalid file.
              notify({ title: "Terminal chrome could not follow the theme", body: String(error), level: "error" });
            }
            this.applied = key;
          }
          this.writing = false;
          cx.notify();
        });
      }
    }
    return div();
  }
}
