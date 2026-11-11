import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { agents, closeOverlay, focused, panes, props, run, spaces, terminals, theme } from "herdr";
import { agentCounts, agentRows, filterRows, nextStatusRow, tabRows } from "./model.js";

export default class Navigation extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.kind = props()?.kind === "agents" ? "agents" : "tabs";
    const origin = focused();
    this.space = props()?.space ?? origin?.space;
    this.originAgent = origin?.shown || origin?.terminal;
    this.mode = this.kind === "agents" ? "browse" : "search";
    this.statusFilter = null;
    this.emptyStatus = null;
    this.query = "";
    this.selected = null;
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: this.kind === "agents"
      ? "Find an agent by task, space, program or address…" : "Find a tab in this space…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.selected = this.rows()[0]?.id ?? null;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", () => this.choose());
    if (props()?.overlay) {
      if (this.mode === "browse") this.handle.focus();
      else this.input.focus();
    }
  }

  baseRows() {
    return this.kind === "agents"
      ? agentRows(agents(), terminals(), this.space)
      : tabRows(spaces(), panes(), this.space);
  }

  rows(base = this.baseRows()) {
    return filterRows(this.statusFilter ? base.filter(row => row.status === this.statusFilter) : base, this.query);
  }

  currentAgentId() {
    const focus = focused();
    const address = focus?.shown || focus?.terminal || this.originAgent;
    return address ? `agent:${address}` : null;
  }

  jumpStatus(status, cx) {
    const target = nextStatusRow(this.baseRows(), status, this.currentAgentId());
    if (target) this.choose(target);
    else { this.emptyStatus = status; cx.notify(); }
  }

  setFilter(status, cx) {
    this.statusFilter = status;
    this.emptyStatus = null;
    this.selected = this.rows()[0]?.id ?? null;
    this.scroll.scroll_to_item(0);
    cx.notify();
  }

  search(cx) {
    this.mode = "search";
    this.emptyStatus = null;
    this.input.focus();
    cx.notify();
  }

  browse(cx) {
    this.mode = "browse";
    this.query = "";
    this.input.set_value("");
    this.selected = this.rows()[0]?.id ?? null;
    this.handle.focus();
    cx.notify();
  }

  key(e, cx) {
    const control = e.modifiers.control;
    const plain = !control && !e.modifiers.alt && !e.modifiers.platform && !e.modifiers.shift;
    if (e.key === "escape") {
      if (this.kind === "agents" && this.mode === "search") this.browse(cx);
      else closeOverlay(props().overlay);
    } else if (e.key === "down" || (control && e.key === "j")) this.move(1, cx);
    else if (e.key === "up" || (control && e.key === "k")) this.move(-1, cx);
    else if (this.kind === "agents" && this.mode === "browse" && plain) {
      if (e.key === "n") this.jumpStatus("blocked", cx);
      else if (e.key === "d") this.jumpStatus("done", cx);
      else if (e.key === "w") this.setFilter("working", cx);
      else if (e.key === "a") this.setFilter(null, cx);
      else if (e.key === "/") this.search(cx);
      else if (e.key === "j") this.move(1, cx);
      else if (e.key === "k") this.move(-1, cx);
      else if (e.key === "enter") this.choose();
      else return;
    } else return;
    cx.stop_propagation();
  }

  choose(row = this.rows().find(r => r.id === this.selected)) {
    if (!row) return;
    closeOverlay(props().overlay);
    run(row.action.command, row.action.args);
  }

  move(amount, cx) {
    const rows = this.rows();
    if (!rows.length) return;
    const index = Math.max(0, rows.findIndex(r => r.id === this.selected));
    const next = (index + amount + rows.length) % rows.length;
    this.selected = rows[next].id;
    this.scroll.scroll_to_item(next);
    cx.notify();
  }

  render() {
    const t = theme(), base = this.baseRows(), rows = this.rows(base);
    if (!rows.some(r => r.id === this.selected)) {
      this.selected = (!this.query && rows.find(r => r.current) || rows[0])?.id ?? null;
    }
    const space = spaces().find(s => s.id === this.space);
    const title = this.kind === "agents" ? "Agents · all spaces" : `Tabs · ${space?.name ?? "current space"}`;
    const counts = agentCounts(base);
    if (this.emptyStatus && nextStatusRow(base, this.emptyStatus, this.currentAgentId())) this.emptyStatus = null;
    const notice = this.emptyStatus === "blocked"
      ? (counts.blocked ? "No other agents need you" : "No agents need you")
      : this.emptyStatus === "done" ? (counts.done ? "No other done agents" : "No done agents") : null;
    const category = (key, label, status, action) => div().id(`navigation-category-${key}`).px(9).py(6).rounded(6)
      .bg(this.statusFilter === status ? t.selected : t.background).text_size(12).cursor_pointer()
      .text_color(t[status] ?? t.foreground).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => action(cx)).child(`${key}  ${label} ${status ? counts[status] : counts.all}`);
    return v_flex().id("navigation-picker").track_focus(this.handle).size_full().p(16).gap(10).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().font_semibold().text_size(15).child(title))
        .child(div().text_size(11).text_color(t.dim).child(this.kind === "agents"
          ? `${this.mode === "browse" ? "Browse" : "Search"} · ${rows.length} agents` : `${rows.length} matches`)))
      .when(this.kind === "agents", el => el.child(h_flex().gap(5).items_center()
        .child(category("n", "Needs you", "blocked", cx => this.jumpStatus("blocked", cx)))
        .child(category("d", "Done", "done", cx => this.jumpStatus("done", cx)))
        .child(category("w", "Working", "working", cx => this.setFilter("working", cx)))
        .child(category("a", "All", null, cx => this.setFilter(null, cx)))
        .child(div().id("navigation-search").px(9).py(6).rounded(6).text_size(12).cursor_pointer()
          .hover(s => s.bg(t.hover)).on_click((_e, cx) => this.search(cx)).child("/ Search"))))
      .when(this.mode === "search", el => el.child(Input.new(this.input).h(36).px(10).rounded(8).border(1).border_color(t.accent)
        .bg(t.background).text_color(t.foreground).text_size(13)))
      .when(Boolean(notice), el => el.child(div().text_size(12).text_color(t.muted).child(notice)))
      .child(v_flex().id("navigation-results").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map(row => h_flex().id(row.id).h(52).flex_none().px(10).gap(10).items_center().rounded(6)
          .bg(row.id === this.selected ? t.selected : t.background).cursor_pointer()
          .hover(s => s.bg(t.hover)).on_click(() => this.choose(row))
          .child(div().w(22).flex_none().text_size(12).text_color(t.accent).child(row.number == null ? "›" : String(row.number)))
          .child(v_flex().flex_1().min_w(0).gap(3)
            .child(div().truncate().text_size(13).child(row.label))
            .child(div().truncate().text_size(11).text_color(t.muted).child(row.detail)))
          .child(div().text_size(11).text_color(t[row.status] ?? t.dim).child(row.status ?? ""))))
        .when(!rows.length, el => el.child(div().p(12).text_size(13).text_color(t.muted).child("No matches"))))
      .child(div().text_size(11).text_color(t.dim).child(this.mode === "browse"
        ? "n/d jump immediately · w working · a all · / search · j/k browse · Enter jump · Esc close"
        : this.kind === "agents" ? "Type to filter · Ctrl-j/k or ↑/↓ · Enter jump · Esc back to browse"
          : "Type to filter · Ctrl-j/k or ↑/↓ · Enter to jump · Esc to cancel"));
  }
}
