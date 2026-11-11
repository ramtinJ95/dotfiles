import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { relaxedColors, nativeColors } from "../common-config/common-dotfiles/pi/.pi/agent/extensions/herdr-appearance/palette.mjs";
import { contrast } from "../common-config/herdr-app/mods/terminal-chrome/palette.js";
import { layoutChoices, paletteFor } from "../common-config/herdr-app/mods/appearance/model.js";

test("relaxed code panels are warm and nested output stays readable", () => {
  const { foreground, background } = relaxedColors();
  for (const [name, color] of Object.entries(background)) {
    const [r, g, b] = color.slice(1).match(/../g).map(c => parseInt(c, 16));
    assert.ok(r > g && g > b, `${name} must be warm, not slate blue`);
    for (const token of ["text", "toolOutput", "dim", "muted", "syntaxComment"]) {
      assert.ok(contrast(foreground[token], color) >= 4.5, `${token} on ${name}: ${contrast(foreground[token], color)}`);
    }
  }
});

test("picker offers only Work, Cosy Cabin and Cosy Café, hiding defaults and old copies", () => {
  const names = ["main", "main-copy", "terminals", "cabin", "cosy", "main-personal", "win98"];
  const rows = layoutChoices(names);
  assert.deepEqual(rows.map(r => r.label), ["Work", "Cosy Cabin", "Cosy Café"]);
  assert.deepEqual(rows.map(r => r.name), ["main-personal", "cabin", "cosy"]);
  assert.equal(rows.filter(r => r.work).length, 1);
  assert.equal(layoutChoices(["main", "cosy"])[0].name, "main");
});

test("native palette reload resolves aliases and preserves literals; invalid references are explicit", () => {
  const result = nativeColors({ vars: { a: "b", b: "#abcdef" }, colors: {
    dim: "a", text: "", warning: 3, accent: "oklch(80% 0.1 40)", toolSuccessBg: "#221a10",
  } });
  assert.deepEqual(result.foreground, { dim: "#abcdef", text: "", warning: 3, accent: "oklch(80% 0.1 40)" });
  assert.equal(result.background.toolSuccessBg, "#221a10");
  assert.throws(() => nativeColors({ colors: { dim: "missing" } }), /not found/);
  assert.throws(() => nativeColors({ vars: { a: "a" }, colors: { dim: "a" } }), /Circular/);
  assert.throws(() => nativeColors(null), /no colors/);
});

test("picker restores native work colors on either platform and warm colors in both cafés", () => {
  const rows = layoutChoices(["main-personal", "cosy", "cabin"]);
  for (const native of ["omarchy", "macarchy-current", "macarchy"]) {
    const themes = [{ name: native }, { name: "cosy" }];
    assert.equal(paletteFor(rows[0], themes, "cosy", true), native);
    for (const row of rows.slice(1, 3)) assert.equal(paletteFor(row, themes, native, true), "cosy");
  }
  assert.equal(paletteFor(rows[0], [{ name: "ink" }], { light: "paper", dark: "ink" }, true), "ink");
  assert.throws(() => paletteFor(rows[1], [], "ink", true), /cosy palette is missing/);
  assert.throws(() => paletteFor(rows[0], [], "missing", true), /work palette missing is missing/);
});

// Load the actual Pi extension, faking only the host and file-watch boundaries.
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const fsURL = moduleURL(`
  const h = () => globalThis.__herdrAppearanceTest;
  export const readFileSync = path => {
    if (path === '/native/pi.json') return JSON.stringify(h().native);
    if (h().missing) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return h().source;
  };
  export const watchFile = (path, _options, fn) => { h().watches.set(path, fn); if (path.endsWith('/shared.json')) h().watched = fn; };
  export const unwatchFile = (path, fn) => { h().watches.delete(path); if (h().watched === fn) h().watched = null; };
  export const setInterval = fn => { h().reconcile = fn; return { unref() {} }; };
  export const clearInterval = () => { h().reconcile = null; };
`);
const sdkURL = moduleURL(`
  export class Theme {
    constructor(foreground, background, mode, options) {
      Object.assign(this, options); this.colors = { ...foreground, ...background }; this.mode = mode;
    }
    getColorMode() { return this.mode; }
  }
`);
const extensionURL = new URL("../common-config/common-dotfiles/pi/.pi/agent/extensions/herdr-appearance/index.ts", import.meta.url);
const extensionSource = stripTypeScriptTypes(await readFile(extensionURL, "utf8"))
  .replace('"node:fs"', JSON.stringify(fsURL))
  .replace('"node:timers"', JSON.stringify(fsURL))
  .replace('"@earendil-works/pi-coding-agent"', JSON.stringify(sdkURL))
  .replace('"./palette.mjs"', JSON.stringify(new URL("./palette.mjs", extensionURL).href));
const { default: appearance } = await import(moduleURL(extensionSource));

function harness({ layout = "cosy", hasUI = true, custom = true } = {}) {
  const h = { source: JSON.stringify({ layout }), watched: null, watches: new Map(), events: {}, calls: [], errors: [],
    native: { colors: { dim: "shade", toolSuccessBg: "#222222" }, vars: { shade: "#77766f" } } };
  globalThis.__herdrAppearanceTest = h;
  const work = { name: "omarchy-system", sourcePath: custom ? "/native/pi.json" : undefined, getColorMode: () => "truecolor" };
  h.work = work;
  h.theme = work;
  // Pi exposes one stable live proxy, not the current Theme instance itself.
  h.proxy = new Proxy({}, { get: (_target, key) => h.theme[key] });
  appearance({ on: (name, fn) => { h.events[name] = fn; } });
  h.start = () => h.events.session_start({}, { hasUI, ui: {
    get theme() { return h.proxy; },
    setTheme(value) {
      h.calls.push(value);
      h.theme = typeof value === "string" ? h.work : value;
      return { success: true };
    },
    notify: message => h.errors.push(message),
  } });
  h.switch = layout => { h.source = JSON.stringify({ layout }); h.watched?.(); };
  h.stop = () => h.events.session_shutdown();
  return h;
}

test("Pi bridge is session-local, reacts to layout changes, restores latest work theme and cleans up", () => {
  const prior = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = "appearance-test";
  try {
    const h = harness();
    h.start();
    assert.equal(h.theme.name, "herdr-relaxed");
    assert.ok(h.calls.every(value => typeof value === "object"), "never save the relaxed palette by name");
    h.switch("cabin");
    assert.equal(h.calls.length, 1, "no redundant apply between warm layouts");
    h.theme = h.work; // Pi's /reload reapplies saved settings after session_start.
    h.reconcile();
    assert.equal(h.theme.name, "herdr-relaxed", "repair a post-startup native reset without changing layout");
    h.native.vars.shade = "#aabbcc";
    h.switch("main-personal");
    assert.equal(h.theme.name, "omarchy-system");
    assert.equal(h.theme.colors.dim, "#aabbcc", "read from disk, not Pi's cached instance");
    h.native.vars.shade = "#bbccdd";
    h.watches.get("/native/pi.json")();
    assert.equal(h.theme.colors.dim, "#bbccdd", "continue following native palette changes in work mode");
    h.switch("cosy");
    h.stop();
    assert.equal(h.theme.name, "omarchy-system");
    assert.equal(h.watched, null);
    assert.equal(h.watches.size, 0);
    assert.equal(h.reconcile, null);
    assert.ok(h.calls.every(value => typeof value === "object"), "never write global theme settings");
    assert.deepEqual(h.errors, []);

    const builtin = harness({ custom: false }); builtin.start(); builtin.switch("main");
    assert.equal(builtin.calls.at(-1), "omarchy-system", "named built-in restore does not read a file");
    builtin.stop();
  } finally {
    if (prior === undefined) delete process.env.HC_TERMINAL_ID;
    else process.env.HC_TERMINAL_ID = prior;
  }
});

test("bridge does not affect Pi outside Herdr or without a UI; invalid state is visible and recoverable", () => {
  const prior = process.env.HC_TERMINAL_ID;
  try {
    delete process.env.HC_TERMINAL_ID;
    const outside = harness(); outside.start();
    assert.equal(outside.watched, null);
    process.env.HC_TERMINAL_ID = "appearance-test";
    const rpc = harness({ hasUI: false }); rpc.start();
    assert.equal(rpc.watched, null);
    const h = harness(); h.start();
    h.source = "{"; h.watched(); h.watched();
    assert.equal(h.errors.length, 1, "one visible error, not notification spam");
    assert.equal(h.theme.name, "herdr-relaxed");
    h.missing = true; h.watched();
    assert.equal(h.theme.name, "omarchy-system");
    h.missing = false; h.switch("cosy");
    assert.equal(h.theme.name, "herdr-relaxed");
    h.stop();
  } finally {
    if (prior === undefined) delete process.env.HC_TERMINAL_ID;
    else process.env.HC_TERMINAL_ID = prior;
  }
});

const uiURL = moduleURL(`
  export class View {}
  function el() {
    let proxy;
    const state = { handlers: {} };
    proxy = new Proxy(state, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => { if (key === 'on_key_down') target.handlers.key = args[0]; return proxy; };
    } });
    return proxy;
  }
  export const div = el, h_flex = el, v_flex = el;
  export const ScrollHandle = { new: () => ({ scroll_to_item(i) { globalThis.__herdrPickerTest.scrolled.push(i); } }) };
`);
const herdrURL = moduleURL(`
  const h = () => globalThis.__herdrPickerTest;
  export const appHome = () => '/fixture';
  export const layouts = () => h().layouts;
  export const themes = () => h().themes;
  export const settings = () => ({ dark: true });
  export const shared = () => h().layout;
  export const theme = () => ({});
  export const props = () => ({ overlay: 'looks' });
  export const readTextFile = async () => JSON.stringify({ theme: 'omarchy' });
  export const run = (name, args) => h().commands.push({ name, args });
  export const closeOverlay = id => h().closed.push(id);
  export const notify = value => h().errors.push(value);
`);
const pickerURL = new URL("../common-config/herdr-app/mods/appearance/main.js", import.meta.url);
const pickerSource = (await readFile(pickerURL, "utf8"))
  .replace('"gpui-kit"', JSON.stringify(uiURL))
  .replace('"gpui-base"', JSON.stringify(uiURL))
  .replace('"herdr"', JSON.stringify(herdrURL))
  .replace('"./model.js"', JSON.stringify(new URL("./model.js", pickerURL).href));
const { default: Appearance } = await import(moduleURL(pickerSource));

function picker() {
  const h = { layouts: ["main-personal", "cosy", "cabin"], themes: [{ name: "cosy" }, { name: "omarchy" }],
    layout: "cosy", commands: [], closed: [], errors: [], tasks: [], scrolled: [], stopped: 0 };
  globalThis.__herdrPickerTest = h;
  h.cx = { notify() {}, stop_propagation() { h.stopped++; }, focus_handle: () => ({ focus() {} }), spawn: fn => h.tasks.push(fn(h.cx)) };
  h.view = new Appearance(); h.view.init({}, h.cx);
  return h;
}

test("real picker keyboard handler applies layout then native palette; Escape does not apply", async () => {
  const h = picker();
  assert.equal(h.view.at, 2, "current café is selected initially");
  const root = h.view.render(h.cx);
  root.handlers.key({ key: "up" }, h.cx);
  root.handlers.key({ key: "up" }, h.cx);
  root.handlers.key({ key: "enter" }, h.cx);
  root.handlers.key({ key: "enter" }, h.cx);
  await Promise.all(h.tasks);
  assert.deepEqual(h.commands, [
    { name: "layout.switch", args: { name: "main-personal" } },
    { name: "app.theme", args: { name: "omarchy" } },
  ]);
  assert.deepEqual(h.closed, ["looks"], "no duplicate switch while awaiting settings");
  assert.deepEqual(h.errors, []);
  const cancel = picker();
  cancel.view.render(cancel.cx).handlers.key({ key: "escape" }, cancel.cx);
  assert.deepEqual(cancel.commands, []);
  assert.deepEqual(cancel.closed, ["looks"]);
});

test("picker j/k wraps and scrolls selection, then Enter applies the chosen layout", async () => {
  const h = picker();
  const key = h.view.render(h.cx).handlers.key;
  key({ key: "j", keystroke: "j" }, h.cx);
  assert.equal(h.view.at, 0, "j wraps from the last row to Work");
  key({ key: "k", keystroke: "k" }, h.cx);
  assert.equal(h.view.at, 2, "k wraps from Work to the last row");
  key({ key: "k", keystroke: "k" }, h.cx);
  assert.equal(h.view.at, 1);
  assert.deepEqual(h.scrolled, [0, 2, 1]);
  assert.deepEqual(h.commands, [], "movement alone must not switch layouts");
  assert.equal(h.stopped, 3, "handled motions stay inside the popup");
  key({ key: "enter", keystroke: "enter" }, h.cx);
  await Promise.all(h.tasks);
  assert.deepEqual(h.commands, [
    { name: "layout.switch", args: { name: "cabin" } },
    { name: "app.theme", args: { name: "cosy" } },
  ]);
});

test("picker does not capture modified j/k shortcuts or unrelated typing", () => {
  const h = picker();
  const key = h.view.render(h.cx).handlers.key;
  for (const keystroke of ["ctrl-j", "alt-k", "cmd-j", "shift-k", "x"]) {
    key({ key: keystroke.split("-").at(-1), keystroke }, h.cx);
  }
  assert.equal(h.view.at, 2);
  assert.equal(h.stopped, 0);
  assert.deepEqual(h.scrolled, []);
  assert.deepEqual(h.commands, []);
});

test("picker preflights warm palette before changing layouts or closing the picker", async () => {
  const h = picker(); h.themes = [{ name: "omarchy" }];
  h.view.choose(h.view.choices()[1], h.cx);
  await Promise.all(h.tasks);
  assert.deepEqual(h.commands, []);
  assert.deepEqual(h.closed, []);
  assert.match(h.errors[0].body, /cosy palette is missing/);
  assert.equal(h.view.busy, false);
});
