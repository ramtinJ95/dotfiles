import { View, div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { appHome, closeOverlay, layouts, notify, props, readTextFile, run, settings, shared, theme, themes } from "herdr";
import { layoutChoices, paletteFor } from "./model.js";

export default class Appearance extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.scroll = ScrollHandle.new();
    this.at = Math.max(0, this.choices().findIndex(row => row.name === shared("layout")));
    this.busy = false;
  }

  choices() { return layoutChoices(layouts()); }

  choose(row, cx) {
    if (!row || this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const defaults = JSON.parse(await readTextFile(`${appHome()}/settings.json`));
        const palette = paletteFor(row, themes(), defaults.theme, settings().dark);
        // Both commands are synchronous and ordered; no async work remains after
        // the layout switch destroys this overlay's view.
        closeOverlay(props()?.overlay);
        run("layout.switch", { name: row.name });
        if (palette) run("app.theme", { name: palette });
      } catch (error) {
        this.busy = false;
        notify({ title: "Could not switch look", body: String(error), level: "error" });
        cx.notify();
      }
    });
  }

  render(cx) {
    const t = theme(), rows = this.choices();
    this.at = Math.min(this.at, rows.length - 1);
    // Terminal colors are the source; old terminal-chrome UI overrides may still
    // be cool from the work layout when a café is first opened.
    return v_flex().id("appearance").size_full().p(14).gap(8).bg(t.background).text_color(t.terminal_foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "down" || e.key === "up") {
          this.at = (this.at + (e.key === "down" ? 1 : rows.length - 1)) % rows.length;
          this.scroll.scroll_to_item(this.at);
        } else if (e.key === "enter") this.choose(rows[this.at], cx);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().text_size(17).font_semibold().child("Choose a look"))
      .child(v_flex().id("looks").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).gap(4)
        .children(rows.map((row, i) => h_flex().id(`look-${row.name}`).p(10).gap(10).rounded(6).items_center().cursor_pointer()
          .bg(i === this.at ? t.selected : t.background)
          .on_hover((hovered, cx) => { if (hovered) { this.at = i; cx.notify(); } })
          .on_click((_event, cx) => this.choose(row, cx))
          .child(div().w(16).text_color(t.accent).child(shared("layout") === row.name ? "✓" : ""))
          .child(v_flex().flex_1().gap(3)
            .child(div().font_semibold().child(row.label))
            .child(div().text_size(11).text_color(t.muted).child(row.detail))))))
      .child(div().text_size(11).text_color(t.muted).child(this.busy ? "Switching…" : "↑ ↓ choose · Enter apply · Esc cancel · Ctrl-f r reopen"));
  }
}
