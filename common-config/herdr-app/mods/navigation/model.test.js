import test from "node:test";
import assert from "node:assert/strict";
import { agentCounts, agentRows, filterRows, FocusHistory, focusTarget, nextStatusRow, tabRows, targetAlive } from "./model.js";

const agent = (address, over = {}) => ({ address, pane: `p-${address}`, space: "work",
  space_name: "Work", tab: "tab1", tab_name: "Feature", program: { name: "Pi", agent: true },
  title: "Implement navigation", status: "idle", ...over });
const target = id => ({ id: `pane:${id}`, action: { command: "pane.focus", args: { pane: id } } });

test("tab search stays within the captured space and skips settled tabs", () => {
  const spaces = [{ id: "work", name: "Work", tabs: [
    { id: "t1", index: 1, name: "1", active: true },
    { id: "t2", index: 2, name: "Retired", named: true, settled: true },
    { id: "t3", index: 3, name: "Review", named: true },
  ] }, { id: "personal", tabs: [{ id: "other" }] }];
  const rows = tabRows(spaces, [{ tab: "t1", title: "Navigation", program: { name: "Pi", agent: true } }], "work");
  assert.deepEqual(rows.map(r => r.id), ["tab:t1", "tab:t3"]);
  assert.deepEqual(rows.map(r => r.number), [1, 3]);
  assert.equal(rows[0].label, "Navigation");
  assert.deepEqual(rows[1].action, { command: "tab.select", args: { id: "t3" } });
  assert.deepEqual(tabRows(spaces, [], "closed-space"), []);
});

test("agent order is current-space first, stable across statuses, and targets exact agents", () => {
  const all = [agent("remote/a", { space: "personal" }), agent("b"), agent("c", { status: "done" })];
  const before = agentRows(all, [], "work");
  const after = agentRows(all.map(a => ({ ...a, status: "idle", seq: 99 })), [], "work");
  assert.deepEqual(before.map(r => r.id), ["agent:b", "agent:c", "agent:remote/a"]);
  assert.deepEqual(after.map(r => r.id), before.map(r => r.id));
  assert.deepEqual(before[1].action, { command: "agent.focus", args: { terminal: "c" } });
});

test("nested agents without panes appear once beneath their parent", () => {
  const rows = agentRows([agent("parent"), agent("kept-child")], [
    { address: "child", parent: "parent", state: "live", program: { name: "Claude", agent: true }, status: "working" },
    { address: "kept-child", parent: "parent", state: "live", program: { agent: true } },
    { address: "grandchild", parent: "child", state: "live", program: { agent: true }, status: "error" },
    { address: "old", parent: "parent", state: "exited", program: { agent: true } },
    { address: "shell", parent: "parent", state: "live", program: { agent: false } },
  ], "work");
  assert.deepEqual(rows.map(r => r.id), ["agent:parent", "agent:child", "agent:grandchild", "agent:kept-child"]);
  assert.equal(rows[2].status, "blocked");
  assert.equal(rows[1].action.args.terminal, "child");
});

test("search matches multiple terms across task, space, machine/address and status", () => {
  const rows = agentRows([agent("home/a"), agent("b", { title: "Fix build" })], [], "work");
  assert.deepEqual(filterRows(rows, "HOME navigation").map(r => r.id), ["agent:home/a"]);
  assert.deepEqual(filterRows(rows, "build idle").map(r => r.id), ["agent:b"]);
  assert.deepEqual(filterRows(rows, "unmatched"), []);
  assert.deepEqual(filterRows(rows, "  "), rows);
});

test("status counts include every nested/remote row and tolerate unknown status", () => {
  const rows = agentRows([agent("a", { status: "blocked" }), agent("remote/b", { status: "done", space: "other" }),
    agent("c", { status: "working" }), agent("d"), agent("e", { status: "unknown" })], [], "work");
  assert.deepEqual(agentCounts(rows), { all: 5, blocked: 1, done: 1, working: 1, idle: 1 });
});

test("status jumps traverse after current, wrap, skip current, and use latest statuses", () => {
  const rows = agentRows([agent("a", { status: "done" }), agent("b", { status: "working" }),
    agent("c", { status: "done" })], [], "work");
  assert.equal(nextStatusRow(rows, "done", "agent:a").id, "agent:c");
  assert.equal(nextStatusRow(rows, "done", "agent:c").id, "agent:a");
  assert.equal(nextStatusRow(rows, "done", "not-in-list").id, "agent:a");
  rows[0].status = "idle"; // a viewed completion has been acknowledged
  assert.equal(nextStatusRow(rows, "done", "agent:c"), null);
  assert.equal(nextStatusRow(rows, "done", "agent:b").id, "agent:c");
  assert.equal(nextStatusRow(rows, "blocked", "agent:a"), null);
  assert.equal(nextStatusRow([], "done", null), null);
});

test("focus tracking distinguishes agents in the same pane and handles mod panes", () => {
  const panes = [{ pane: "p1", terminal: "parent" }, { pane: "files", terminal: null }];
  const terminals = [{ address: "child", state: "live", program: { agent: true } }];
  assert.equal(focusTarget({ pane: "p1", terminal: "parent" }, panes, [agent("parent")]).id, "agent:parent");
  assert.equal(focusTarget({ pane: "p1", terminal: "parent", shown: "child" }, panes, [], terminals).id, "agent:child");
  assert.equal(focusTarget({ pane: "files" }, panes, []).id, "pane:files");
  assert.equal(focusTarget(null, panes, []), null);
});

test("jump-back toggles the two last actual targets rather than consuming a stack", () => {
  const history = new FocusHistory();
  const a = target("a"), b = target("b"), c = target("c");
  history.observe(a); history.observe(b); history.observe(c);
  assert.equal(history.previous(c, () => true).id, b.id);
  history.observe(b); // actual focus changed after the command succeeded
  assert.equal(history.previous(b, () => true).id, c.id);
  history.observe(c);
  assert.equal(history.previous(c, () => true).id, b.id);
});

test("jump-back skips closed targets, tolerates no history, and stays bounded", () => {
  const history = new FocusHistory();
  assert.equal(history.previous(target("a"), () => true), null);
  history.observe(target("b")); history.observe(target("c"));
  assert.equal(history.previous(target("c"), t => t.id !== "pane:b").id, "pane:a");
  for (let i = 0; i < 60; i++) history.observe(target(String(i)));
  assert.equal(history.items.length, 40);
  assert.equal(targetAlive(target("files"), [{ pane: "files" }], []), true);
  assert.equal(targetAlive({ action: { command: "agent.focus", args: { terminal: "gone" } } }, [], []), false);
});
