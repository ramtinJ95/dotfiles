export function tabRows(spaces, panes, spaceId) {
  const space = spaces.find(s => s.id === spaceId);
  return (space?.tabs ?? []).filter(tab => !tab.settled).map(tab => {
    const mine = panes.filter(p => p.tab === tab.id);
    const program = mine.find(p => p.program?.agent)?.program ?? mine[0]?.program;
    const title = mine.find(p => p.title)?.title;
    return {
      id: `tab:${tab.id}`, number: tab.index,
      label: tab.named ? tab.name : title || program?.name || `Tab ${tab.index}`,
      detail: [space.name, tab.name, program?.name, mine[0]?.cwd].filter(Boolean).join(" · "),
      status: tab.status, current: tab.active,
      action: { command: "tab.select", args: { id: tab.id } },
    };
  });
}

export function agentRows(agents, terminals, spaceId) {
  const children = new Map();
  for (const terminal of terminals) {
    if (terminal.state !== "live" || !terminal.parent || !terminal.program?.agent) continue;
    if (!children.has(terminal.parent)) children.set(terminal.parent, []);
    children.get(terminal.parent).push(terminal);
  }
  const known = new Map(agents.map(a => [a.address, a]));
  const rows = [], seen = new Set();
  function add(agent, nested = false) {
    if (seen.has(agent.address)) return;
    seen.add(agent.address);
    rows.push({
      id: `agent:${agent.address}`, space: agent.space,
      label: agent.title || agent.tab_name || agent.program?.name || agent.address,
      detail: [agent.space_name, agent.tab_name, agent.program?.name, agent.address,
        nested ? "sub-agent" : null].filter(Boolean).join(" · "),
      status: agent.status === "error" ? "blocked" : agent.status,
      current: Boolean(agent.focused),
      action: { command: "agent.focus", args: { terminal: agent.address } },
    });
    for (const terminal of children.get(agent.address) ?? []) {
      add(known.get(terminal.address) ?? {
        ...agent, address: terminal.address, title: terminal.name || terminal.program?.name,
        program: terminal.program, status: terminal.status, focused: false,
      }, true);
    }
  }
  for (const agent of agents) add(agent);
  // Current space first; never sort by status or recency. Looking at a done
  // agent changes its status, but must not move the target under the cursor.
  return [...rows.filter(r => r.space === spaceId), ...rows.filter(r => r.space !== spaceId)];
}

export function filterRows(rows, query) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => words.every(word =>
    `${row.label} ${row.detail} ${row.status ?? ""}`.toLocaleLowerCase().includes(word)));
}

export function agentCounts(rows) {
  return rows.reduce((counts, row) => {
    counts.all++;
    if (["blocked", "done", "working", "idle"].includes(row.status)) counts[row.status]++;
    return counts;
  }, { all: 0, blocked: 0, done: 0, working: 0, idle: 0 });
}

// Traverse the stable list after the current agent, wrapping once. Do not
// revisit the current agent just because it is the only eligible result.
export function nextStatusRow(rows, status, currentId) {
  const index = rows.findIndex(row => row.id === currentId);
  const candidates = index < 0 ? rows : [...rows.slice(index + 1), ...rows.slice(0, index)];
  return candidates.find(row => row.status === status) ?? null;
}

export function focusTarget(focus, panes, agents, terminals = []) {
  if (!focus) return null;
  const terminal = focus.shown || focus.terminal;
  if (terminal && (agents.some(a => a.address === terminal)
    || terminals.some(t => t.address === terminal && t.state === "live" && t.program?.agent))) {
    return { id: `agent:${terminal}`, action: { command: "agent.focus", args: { terminal } } };
  }
  if (focus.pane && panes.some(p => p.pane === focus.pane)) {
    return { id: `pane:${focus.pane}`, action: { command: "pane.focus", args: { pane: focus.pane } } };
  }
  return null;
}

export function targetAlive(target, panes, terminals) {
  return target.action.command === "agent.focus"
    ? terminals.some(t => t.address === target.action.args.terminal && t.state === "live")
    : panes.some(p => p.pane === target.action.args.pane);
}

export class FocusHistory {
  constructor() { this.items = []; }

  observe(target) {
    if (!target || this.items[0]?.id === target.id) return;
    this.items = [target, ...this.items.filter(t => t.id !== target.id)].slice(0, 40);
  }

  previous(current, alive) {
    this.observe(current);
    this.items = this.items.filter(alive);
    return this.items.find(t => t.id !== current?.id) ?? null;
  }
}
