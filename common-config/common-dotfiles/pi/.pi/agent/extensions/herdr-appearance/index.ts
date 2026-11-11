import { readFileSync, watchFile, unwatchFile } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setInterval, clearInterval } from "node:timers";
import { Theme, type ExtensionAPI, type ThemeColor, type ThemeBg } from "@earendil-works/pi-coding-agent";
import { RELAXED_LAYOUTS, relaxedColors, nativeColors } from "./palette.mjs";

// Herdr documents shared("layout") as the active layout. Watching its small
// persisted state avoids spawning a CLI (or touching global Pi settings) per poll.
export default function (pi: ExtensionAPI) {
  let stop: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    stop?.();
    if (!ctx.hasUI || !process.env.HC_TERMINAL_ID) return;
    const path = join(process.env.HERDR_APP_HOME ?? join(homedir(), ".config/herdr-app"), "shared.json");
    // ctx.ui.theme is a live proxy, not a snapshot. Capture the name before the
    // override, otherwise restoring it would try to load "herdr-relaxed".
    const workThemeName = ctx.ui.theme.name ?? "system";
    const workThemePath = ctx.ui.theme.sourcePath;
    let relaxed = false;
    let overridden = false;
    let lastError: string | undefined;

    const restore = () => {
      let result;
      if (workThemePath) {
        const { foreground, background, appearance } = nativeColors(JSON.parse(readFileSync(workThemePath, "utf8")));
        result = ctx.ui.setTheme(new Theme(
          foreground as Record<ThemeColor, string>, background as Record<ThemeBg, string>,
          ctx.ui.theme.getColorMode(), { name: workThemeName, sourcePath: workThemePath, appearance },
        ));
      } else result = ctx.ui.setTheme(workThemeName);
      if (!result.success) throw new Error(result.error);
    };
    const sync = (refreshNative = false) => {
      try {
        let layout: unknown;
        try { layout = JSON.parse(readFileSync(path, "utf8")).layout; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const next = typeof layout === "string" && RELAXED_LAYOUTS.has(layout);
        if (next !== relaxed || next && ctx.ui.theme.name !== "herdr-relaxed" || refreshNative && !next && overridden) {
          if (next) {
            const { foreground, background } = relaxedColors();
            const result = ctx.ui.setTheme(new Theme(
              foreground as Record<ThemeColor, string>, background as Record<ThemeBg, string>,
              ctx.ui.theme.getColorMode(), { name: "herdr-relaxed", appearance: "dark" },
            ));
            if (!result.success) throw new Error(result.error);
            overridden = true;
          } else restore();
          relaxed = next;
        }
        lastError = undefined;
      } catch (error) {
        const message = String(error);
        if (message !== lastError) ctx.ui.notify(`Herdr → Pi theme sync: ${message}`, "error");
        lastError = message;
      }
    };
    const layoutChanged = () => sync();
    const nativeChanged = () => sync(true);
    watchFile(path, { interval: 1000, persistent: false }, layoutChanged);
    // A direct Theme instance pauses Pi's internal watcher. Once overridden,
    // follow the original source here instead, including updates in work mode.
    if (workThemePath) watchFile(workThemePath, { interval: 1000, persistent: false }, nativeChanged);
    sync();
    // Pi reapplies saved settings after /reload and some session rebinds. Repair
    // that only while relaxed, rather than forcing settings or repainting each tick.
    const reconcile = setInterval(() => {
      if (relaxed && ctx.ui.theme.name !== "herdr-relaxed") sync();
    }, 1000);
    reconcile.unref();
    stop = () => {
      clearInterval(reconcile);
      unwatchFile(path, layoutChanged);
      if (workThemePath) unwatchFile(workThemePath, nativeChanged);
      if (relaxed) {
        try { restore(); }
        catch (error) { ctx.ui.notify(`Could not restore the work theme: ${error}`, "error"); }
      }
      stop = undefined;
    };
  });
  pi.on("session_shutdown", () => stop?.());
}
