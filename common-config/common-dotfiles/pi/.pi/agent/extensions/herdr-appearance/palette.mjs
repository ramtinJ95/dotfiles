// Warm, readable Pi surfaces for Herdr's café layouts. In particular, nested
// Codex output uses `dim`, so it must remain readable inside every tool panel.
export const RELAXED_LAYOUTS = new Set(["cosy", "cabin"]);

export function relaxedColors() {
  const foreground = {};
  const group = (color, names) => names.split(" ").forEach(name => { foreground[name] = color; });
  group("#eee2cc", "text userMessageText customMessageText toolOutput mdCodeBlock searchMatchText");
  group("#f0bd7d", "accent borderAccent customMessageLabel toolTitle mdHeading mdLink thinkingMinimal bashMode");
  group("#d2bda0", "muted mdQuote toolDiffContext syntaxPunctuation");
  group("#c9b69b", "dim thinkingText syntaxComment scrollbarTrack");
  group("#eee2cc", "scrollbarThumb");
  group("#8e7357", "border mdCodeBlockBorder mdQuoteBorder mdHr");
  group("#6c533f", "borderMuted thinkingOff");
  group("#b8ca8a", "success toolDiffAdded syntaxString");
  group("#f09a83", "error toolDiffRemoved thinkingXhigh thinkingMax");
  group("#efc789", "warning syntaxNumber thinkingHigh");
  group("#aec5e6", "syntaxFunction syntaxType thinkingLow");
  group("#d3b2d4", "mdListBullet syntaxKeyword syntaxOperator thinkingMedium");
  group("#a5ccc0", "mdLinkUrl mdCode");
  group("#eee2cc", "syntaxVariable");
  const background = {
    selectedBg: "#55402d", searchMatchBg: "#55402d",
    userMessageBg: "#34271e", customMessageBg: "#34271e",
    toolPendingBg: "#33271f", toolSuccessBg: "#2c231d", toolErrorBg: "#3c2520",
  };
  return { foreground, background };
}

// Native generated palettes use Pi's JSON color/variable format. Reload these
// from disk: Pi's getTheme(name) returns a cached instance while our override
// has paused its watcher, so it can miss an OS theme change made in the café.
export function nativeColors(document) {
  if (!document || typeof document.colors !== "object" || !document.colors) {
    throw new Error("The native Pi theme has no colors object");
  }
  const resolve = (value, seen = new Set()) => {
    if (typeof value === "number" || value === "" ||
        typeof value === "string" && (value.startsWith("#") || /^ok(lch|hsl)\(/i.test(value))) return value;
    if (typeof value !== "string" || !Object.hasOwn(document.vars ?? {}, value)) {
      throw new Error(`Native theme variable not found: ${value}`);
    }
    if (seen.has(value)) throw new Error(`Circular native theme variable: ${value}`);
    return resolve(document.vars[value], new Set([...seen, value]));
  };
  const backgroundSlots = new Set(Object.keys(relaxedColors().background));
  const foreground = {}, background = {};
  for (const [name, value] of Object.entries(document.colors)) {
    (backgroundSlots.has(name) ? background : foreground)[name] = resolve(value);
  }
  return { foreground, background, appearance: document.appearance };
}
