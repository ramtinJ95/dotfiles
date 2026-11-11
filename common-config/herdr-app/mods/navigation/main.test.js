import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Exercise the real View/controller with only its host/native boundaries faked.
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const nativeURL = moduleURL(`
  export class View {}
  function element() {
    const state = { handlers: {} };
    let proxy;
    proxy = new Proxy(state, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'on_key_down') target.handlers.key = args[0];
        if (key === 'track_focus') target.focus = args[0];
        if (key === 'when' && args[0]) args[1](proxy);
        return proxy;
      };
    } });
    return proxy;
  }
  export const div = element, h_flex = element, v_flex = element;
  export const Input = { new: element };
  export const InputState = { new() {
    return { handlers: {}, text: '', on(event, fn) { this.handlers[event] = fn; },
      focus() {}, value() { return this.text; }, set_value(value) { this.text = value; } };
  } };
  export const ScrollHandle = { new: () => ({ scroll_to_item() {} }) };
`);
const hostURL = moduleURL(`
  const host = () => globalThis.__herdrNavigationTest;
  export const props = () => host().props;
  export const spaces = () => host().spaces;
  export const agents = () => host().agents;
  export const panes = () => host().panes;
  export const terminals = () => host().terminals;
  export const focused = () => host().focus;
  export const theme = () => ({});
  export const run = (command, args) => host().runs.push({ command, args });
  export const notify = value => host().notifications.push(value);
  export const nextCommand = () => new Promise(resolve => host().pending.push(resolve));
  export const closeOverlay = id => host().closed.push(id);
  export const openOverlay = spec => { host().opened.push(spec); return 'picker'; };
`);
const source = (await readFile(new URL("./main.js", import.meta.url), "utf8"))
  .replaceAll('"gpui-kit"', JSON.stringify(nativeURL))
  .replaceAll('"gpui-base"', JSON.stringify(nativeURL))
  .replaceAll('"herdr"', JSON.stringify(hostURL))
  .replace('"./model.js"', JSON.stringify(new URL("./model.js", import.meta.url).href));
const { default: Navigation } = await import(moduleURL(source));
const controllerSource = (await readFile(new URL("./controller.js", import.meta.url), "utf8"))
  .replaceAll('"herdr"', JSON.stringify(hostURL))
  .replace('"./model.js"', JSON.stringify(new URL("./model.js", import.meta.url).href));
const { NavigationController } = await import(moduleURL(controllerSource));

function harness(props) {
  const h = { props, spaces: [{ id: "work", name: "Work", tabs: [] }],
    agents: ["a", "b"].map((address, i) => ({ address, space: "work", space_name: "Work",
      tab: "same-tab", tab_name: "Feature", title: i ? "Fix build" : "Navigation",
      status: "idle", focused: !i, program: { name: "Pi", agent: true } })),
    panes: [{ pane: "p-a", terminal: "a" }, { pane: "p-b", terminal: "b" }],
    terminals: ["a", "b"].map(address => ({ address, state: "live" })),
    focus: { space: "work", tab: "same-tab", pane: "p-a", terminal: "a" },
    runs: [], opened: [], closed: [], notifications: [], pending: [], errors: [] };
  globalThis.__herdrNavigationTest = h;
  h.cx = { notify() {}, stop_propagation() { h.stopped = true; },
    focus_handle: () => ({ focus() {} }),
    spawn(fn) { fn(h.cx).catch(error => h.errors.push(error)); } };
  if (props.role === "history") {
    h.controller = new NavigationController(h.cx);
    h.view = { render: () => h.controller.observe() }; // visible tab-bar hook
  } else {
    h.view = new Navigation();
    h.view.init(props, h.cx);
  }
  h.command = async command => {
    assert.ok(h.pending.length, "controller must be listening");
    h.pending.shift()(command);
    await new Promise(setImmediate);
    assert.deepEqual(h.errors, []);
  };
  return h;
}

test("controller jump-back toggles exact agents and opens explicitly scoped pickers", async () => {
  const h = harness({ role: "history" });
  h.focus = { ...h.focus, pane: "p-b", terminal: "b" };
  h.view.render();
  await h.command("back");
  assert.deepEqual(h.runs.at(-1), { command: "agent.focus", args: { terminal: "a" } });
  h.focus = { ...h.focus, pane: "p-a", terminal: "a" };
  h.view.render();
  await h.command("back");
  assert.deepEqual(h.runs.at(-1), { command: "agent.focus", args: { terminal: "b" } });
  await h.command("tabs");
  assert.deepEqual(h.opened.at(-1).props, { kind: "tabs", space: "work" });
  await h.command("agents");
  assert.equal(h.opened.at(-1).props.kind, "agents");
  assert.deepEqual(h.closed, ["picker"]);
});

test("controller reports empty history and skips closed targets", async () => {
  const h = harness({ role: "history" });
  await h.command("back");
  assert.equal(h.notifications.length, 1);
  h.focus = { ...h.focus, pane: "p-b", terminal: "b" };
  h.view.render();
  h.terminals = [{ address: "b", state: "live" }];
  await h.command("back");
  assert.deepEqual(h.runs, []);
  assert.equal(h.notifications.length, 2);
});

test("picker Ctrl-j/k moves selection without stealing plain typing; Enter targets the exact match", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  const root = h.view.render();
  assert.equal(root.focus, h.view.handle, "keyboard handlers need the root on the native focus path");
  assert.equal(h.view.mode, "browse");
  root.handlers.key({ key: "/", modifiers: {} }, h.cx);
  assert.equal(h.view.mode, "search");
  assert.equal(h.view.selected, "agent:a");
  root.handlers.key({ key: "j", modifiers: { control: true } }, h.cx);
  assert.equal(h.view.selected, "agent:b");
  root.handlers.key({ key: "k", modifiers: { control: true } }, h.cx);
  assert.equal(h.view.selected, "agent:a");
  h.stopped = false;
  root.handlers.key({ key: "j", modifiers: {} }, h.cx);
  assert.equal(h.stopped, false, "plain j must remain searchable text");
  h.view.input.text = "build";
  h.view.input.handlers.change(null, h.cx);
  h.agents[1].status = "done";
  h.view.render();
  assert.equal(h.view.selected, "agent:b");
  h.view.input.handlers.submit();
  assert.deepEqual(h.runs, [{ command: "agent.focus", args: { terminal: "b" } }]);
  assert.deepEqual(h.closed, ["picker"]);
});

test("agent search Escape returns to browse, then closes; no-match Enter is inert", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.view.search(h.cx);
  h.view.input.text = "not-present";
  h.view.input.handlers.change(null, h.cx);
  const root = h.view.render();
  h.view.input.handlers.submit();
  assert.deepEqual(h.runs, []);
  root.handlers.key({ key: "escape", modifiers: {} }, h.cx);
  assert.deepEqual(h.closed, []);
  assert.equal(h.view.mode, "browse");
  assert.equal(h.view.query, "");
  root.handlers.key({ key: "escape", modifiers: {} }, h.cx);
  assert.deepEqual(h.closed, ["picker"]);
});

test("n and d jump immediately to exact matching agents without Enter", () => {
  for (const [key, status] of [["n", "blocked"], ["d", "done"]]) {
    const h = harness({ overlay: "picker", kind: "agents", space: "work" });
    h.agents[1].status = status;
    h.view.render().handlers.key({ key, modifiers: {} }, h.cx);
    assert.deepEqual(h.runs, [{ command: "agent.focus", args: { terminal: "b" } }]);
    assert.deepEqual(h.closed, ["picker"]);
    assert.equal(h.stopped, true);
  }
});

test("reopening after a done agent becomes idle visits the next unseen completion", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.agents[1].status = "done";
  h.agents.push({ ...h.agents[1], address: "c", title: "Review tests" });
  h.view.render().handlers.key({ key: "d", modifiers: {} }, h.cx);
  assert.equal(h.runs.at(-1).args.terminal, "b");
  h.agents[1].status = "idle";
  h.focus = { ...h.focus, terminal: "b" };
  h.view = new Navigation();
  h.view.init(h.props, h.cx);
  h.view.render().handlers.key({ key: "d", modifiers: {} }, h.cx);
  assert.equal(h.runs.at(-1).args.terminal, "c");
});

test("no eligible status leaves launcher open; a newly matching agent clears the notice", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.view.render().handlers.key({ key: "n", modifiers: {} }, h.cx);
  assert.equal(h.view.emptyStatus, "blocked");
  assert.deepEqual(h.runs, []);
  assert.deepEqual(h.closed, []);
  h.agents[1].status = "blocked";
  h.view.render();
  assert.equal(h.view.emptyStatus, null);
});

test("n does not close the launcher when current agent is the only blocked result", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.agents[0].status = "blocked";
  h.focus = { space: "work", terminal: null, pane: null }; // popup owns the keyboard
  h.view.render().handlers.key({ key: "n", modifiers: {} }, h.cx);
  assert.equal(h.view.emptyStatus, "blocked");
  assert.deepEqual(h.runs, []);
  assert.deepEqual(h.closed, []);
});

test("working and all filters combine with / search; j/k and Enter browse without typing", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.agents[1].status = "working";
  const key = value => h.view.render().handlers.key({ key: value, modifiers: {} }, h.cx);
  key("w");
  assert.deepEqual(h.view.rows().map(r => r.id), ["agent:b"]);
  key("/");
  h.view.input.text = "build";
  h.view.input.handlers.change(null, h.cx);
  assert.equal(h.view.rows()[0].id, "agent:b");
  key("escape");
  assert.equal(h.view.statusFilter, "working");
  key("a");
  assert.equal(h.view.rows().length, 2);
  key("j");
  assert.equal(h.view.selected, "agent:b");
  key("k");
  assert.equal(h.view.selected, "agent:a");
  key("j"); key("enter");
  assert.deepEqual(h.runs, [{ command: "agent.focus", args: { terminal: "b" } }]);
});

test("n/d/w stay literal text in search mode and modified category keys are not captured", () => {
  const h = harness({ overlay: "picker", kind: "agents", space: "work" });
  h.view.search(h.cx);
  for (const key of ["n", "d", "w", "a", "j", "k"]) {
    h.stopped = false;
    h.view.render().handlers.key({ key, modifiers: {} }, h.cx);
    assert.equal(h.stopped, false, key);
  }
  h.view.browse(h.cx);
  h.stopped = false;
  h.view.render().handlers.key({ key: "d", modifiers: { control: true } }, h.cx);
  assert.equal(h.stopped, false);
  assert.deepEqual(h.runs, []);
});

test("tab picker still starts in text search; n/d are not category shortcuts and Esc closes", () => {
  const h = harness({ overlay: "picker", kind: "tabs", space: "work" });
  assert.equal(h.view.mode, "search");
  for (const key of ["n", "d", "/"]) {
    h.stopped = false;
    h.view.render().handlers.key({ key, modifiers: {} }, h.cx);
    assert.equal(h.stopped, false);
  }
  h.view.render().handlers.key({ key: "escape", modifiers: {} }, h.cx);
  assert.deepEqual(h.closed, ["picker"]);
});
