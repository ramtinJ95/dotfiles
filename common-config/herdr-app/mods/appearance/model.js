export const RELAXED = new Set(["cosy", "cabin"]);

export function layoutChoices(names) {
  const work = names.includes("main-personal") ? "main-personal" : "main";
  return [work, "cabin", "cosy"].filter(name => names.includes(name)).map(name => ({
    name,
    label: name === work ? "Work" : name === "cabin" ? "Cosy Cabin" : "Cosy Café",
    detail: name === work ? "Omarchy / Macarchy colors" : "Warm, relaxed colors · readable Pi panels",
    work: name === work,
  }));
}

export function paletteFor(choice, available, defaultTheme, dark) {
  const names = new Set(available.map(t => t.name));
  if (RELAXED.has(choice.name)) {
    if (!names.has("cosy")) throw new Error("The cosy palette is missing. Install the Cosy layout and its theme first.");
    return "cosy";
  }
  if (!choice.work) return null;
  const native = ["omarchy", "macarchy-current", "macarchy"].find(name => names.has(name));
  const fallback = typeof defaultTheme === "string" ? defaultTheme : defaultTheme?.[dark ? "dark" : "light"];
  const name = native ?? fallback;
  if (name && !names.has(name)) throw new Error(`The work palette ${name} is missing.`);
  return name ?? null;
}
