import { test } from "node:test";
import assert from "node:assert/strict";
import { chromeColors, contrast, mergeColors } from "./palette.js";

for (const [name, bg, fg] of [
  ["Tokyo Night", "#1a1b26", "#a9b1d6"],
  ["dark", "#101010", "#eeeeee"],
  ["light", "#faf8f0", "#292929"],
  ["low-contrast theme", "#777777", "#888888"],
]) {
  test(`${name}: surfaces match terminal; all labels reach 4.5:1`, () => {
    const colors = chromeColors(bg, fg);
    for (const key of ["canvas", "chrome", "surface", "popover", "raised"]) assert.equal(colors[key], bg);
    for (const key of ["foreground", "muted", "dim", "idle", "unknown"]) {
      assert.ok(contrast(colors[key], bg) >= 4.5, `${key}: ${colors[key]}`);
    }
    assert.equal(colors.background, undefined, "never override the source terminal palette");
    assert.equal(colors.terminal_foreground, undefined);
    assert.equal(colors.hover, undefined);
    assert.equal(colors.selected, undefined);
  });
}

test("theme switch replaces old derived colors, preserving other settings and highlights", () => {
  const initial = { theme: "macarchy-current", zoom: 1.1, colors: { accent: "#ff0000", selected: "#332244" } };
  const dark = mergeColors(JSON.stringify(initial), chromeColors("#101010", "#eeeeee"));
  const light = mergeColors(dark, chromeColors("#faf8f0", "#292929"));
  const result = JSON.parse(light);
  assert.equal(result.colors.chrome, "#faf8f0");
  assert.equal(result.colors.accent, initial.colors.accent);
  assert.equal(result.colors.selected, initial.colors.selected);
  assert.equal(result.theme, initial.theme);
  assert.equal(result.zoom, initial.zoom);
  assert.equal(mergeColors(light, chromeColors("#faf8f0", "#292929")), light, "no write feedback loop");
});

test("invalid inputs fail explicitly", () => {
  assert.throws(() => chromeColors("background", "#ffffff"), /opaque theme color/);
  for (const source of ["{", "null", "[]", '{"colors":"bad"}']) {
    assert.throws(() => mergeColors(source, { chrome: "#000000" }));
  }
});
