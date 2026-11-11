function rgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected opaque theme color, got ${hex}`);
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function hex(channels) {
  return "#" + channels.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
}

function mix(a, b, amount) {
  const x = rgb(a), y = rgb(b);
  return hex(x.map((c, i) => c + (y[i] - c) * amount));
}

function luminance(color) {
  const c = rgb(color).map(v => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function readable(color, background, minimum) {
  if (contrast(color, background) >= minimum) return color;
  const target = contrast("#ffffff", background) > contrast("#000000", background)
    ? "#ffffff" : "#000000";
  for (let i = 1; i <= 100; i++) {
    const candidate = mix(color, target, i / 100);
    if (contrast(candidate, background) >= minimum) return candidate;
  }
  throw new Error(`Cannot achieve ${minimum}:1 text contrast against ${background}`);
}

// Only terminal colors are inputs: derived UI overrides must not feed back into themselves.
export function chromeColors(background, terminalForeground) {
  rgb(background);
  rgb(terminalForeground);
  const foreground = readable(terminalForeground, background, 4.5);
  const muted = readable(mix(background, foreground, 0.82), background, 4.5);
  const dim = readable(mix(background, foreground, 0.68), background, 4.5);
  return {
    canvas: background, chrome: background, surface: background,
    popover: background, raised: background,
    foreground, muted, dim, idle: dim, unknown: dim,
  };
}

export function mergeColors(source, colors) {
  const settings = JSON.parse(source ?? "{}");
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    throw new Error("settings.json must be an object");
  }
  if (settings.colors != null && (Array.isArray(settings.colors) || typeof settings.colors !== "object")) {
    throw new Error("settings.json colors must be an object");
  }
  if (Object.entries(colors).every(([key, value]) => settings.colors?.[key] === value)) return source;
  return JSON.stringify({ ...settings, colors: { ...settings.colors, ...colors } }, null, 2) + "\n";
}
