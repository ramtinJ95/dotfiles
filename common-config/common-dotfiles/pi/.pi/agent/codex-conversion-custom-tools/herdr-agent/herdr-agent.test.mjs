import assert from "node:assert/strict";
import test from "node:test";
import {
	inspectAskScreen,
	detectDelivery,
	herdrHelp,
	isBusyScreen,
	parseRequest,
	parseSessionLines,
	planAskAnswer,
	promptAgent,
	resolveTargetAlias,
	resolveSendDisposition,
	settledOutput,
} from "./herdr-agent.mjs";

const line = (value) => JSON.stringify(value);

test("request parser rejects action-specific unknown fields", () => {
	assert.throws(
		() => parseRequest('{"action":"find","text":"no"}'),
		/unknown find field/,
	);
	assert.deepEqual(parseRequest('{"action":"read","target":"w1:p1"}'), {
		action: "read",
		target: "w1:p1",
		source: "latest",
		lines: 40,
	});
	assert.throws(() => parseRequest('{"action":"toString"}'), /action must be/);
	assert.deepEqual(parseRequest("help"), { action: "help" });
	assert.deepEqual(parseRequest('{"action":"help"}'), { action: "help" });
	assert.deepEqual(
		parseRequest(
			'{"action":"send","target":"w1:p1","text":"hello","wait":false}',
		),
		{
			action: "send",
			target: "w1:p1",
			text: "hello",
			queue: false,
			wait: false,
			timeout_ms: 300_000,
		},
	);
});

test("help documents the spawned-subagent parent target", () => {
	assert.equal(
		herdrHelp().call,
		"await tools.herdr_agent(JSON.stringify(request))",
	);
	assert.match(herdrHelp().actions.send.request.target, /parent/);
	assert.match(herdrHelp().actions.answer.request.answers, /selections/);
});

test("parent resolves only for spawned subagents", () => {
	assert.equal(
		resolveTargetAlias("parent", { SPAWN_AGENT_PARENT_PANE_ID: "w1:p1" }),
		"w1:p1",
	);
	assert.equal(resolveTargetAlias("w1:p2", {}), "w1:p2");
	assert.throws(() => resolveTargetAlias("parent", {}), /only to a spawned subagent/);
});

test("send automatically prompts or steers, reserving follow-up for queue", () => {
	assert.deepEqual(resolveSendDisposition({ busy: false, queue: false }), {
		keybinding: "tui.input.submit",
		fallback: "enter",
		mode: "prompt",
	});
	assert.equal(
		resolveSendDisposition({ busy: true, queue: false }).mode,
		"steer",
	);
	assert.deepEqual(resolveSendDisposition({ busy: true, queue: true }), {
		keybinding: "app.message.followUp",
		fallback: "alt+enter",
		mode: "follow_up",
	});
	assert.equal(
		resolveSendDisposition({ busy: false, queue: true }).mode,
		"prompt",
	);
});

test("server-settled output reads the new transcript reply directly", async () => {
	const output = await settledOutput(
		{
			read: async () => ({
				path: "session.jsonl",
				assistant_entry: { id: "assistant-new", stop_reason: "stop" },
				assistant: { id: "assistant-new", text: "done" },
			}),
		},
		{
			pane_id: "w1:p2",
			agent_status: "done",
			agent_session: { kind: "path", value: "session.jsonl" },
		},
		{
			path: "session.jsonl",
			assistant_entry_id: "assistant-old",
			reply_id: "assistant-old",
		},
		true,
	);
	assert.deepEqual(output, { pane: "w1:p2", status: "done", text: "done" });
});

test("session parser follows the active branch", () => {
	const view = parseSessionLines([
		line({
			id: "root",
			parentId: null,
			message: { role: "assistant", content: [{ type: "text", text: "root" }] },
		}),
		line({
			id: "side",
			parentId: "root",
			message: { role: "assistant", content: [{ type: "text", text: "side" }] },
		}),
		line({
			id: "active",
			parentId: "root",
			message: { role: "assistant", content: [{ type: "text", text: "active" }] },
		}),
		line({ id: "leaf", parentId: "active" }),
	]);
	assert.equal(view.assistant.text, "active");
});

test("delivery detection requires a new session message or Pi queue marker", () => {
	const baseline = { user: { id: "old", text: "hello" } };
	assert.equal(
		detectDelivery(
			baseline,
			{ user: { id: "new", text: "hello" } },
			"",
			"hello",
		),
		"delivered",
	);
	assert.equal(
		detectDelivery(baseline, baseline, "Follow-up: hello", "hello"),
		"queued_follow_up",
	);
	assert.equal(detectDelivery(baseline, baseline, "Working...", "hello"), undefined);
});

test("session parser exposes only unresolved asks", () => {
	const ask = line({
		id: "ask",
		parentId: null,
		message: {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: "call-1",
					name: "ask",
					arguments: { prompts: [{ title: "Ship?", choices: [{ label: "Yes" }] }] },
				},
			],
		},
	});
	assert.equal(parseSessionLines([ask]).ask.prompts[0].title, "Ship?");
	assert.equal(
		parseSessionLines([
			ask,
			line({
				id: "result",
				parentId: "ask",
				message: { role: "toolResult", toolCallId: "call-1" },
			}),
		]).ask,
		undefined,
	);
});

test("ask planner handles choices and free text", () => {
	const prompts = [
		{
			title: "Mode",
			multiple: false,
			choices: [{ label: "Safe" }, { label: "Fast" }],
		},
		{ title: "Notes", multiple: false, choices: [] },
	];
	assert.deepEqual(
		planAskAnswer(prompts, [
			{ selections: ["Fast"] },
			{ other: "Keep logs." },
		]),
		[
			{ keys: ["down", "enter"] },
			{ keys: ["tab"] },
			{ keys: ["enter"] },
			{ text: "Keep logs.", keys: ["enter"] },
			{ keys: ["tab"] },
			{ keys: ["enter"], final: true },
		],
	);
});

test("ask inspection recognizes the initial pi-ask frame", () => {
	const ask = {
		prompts: [
			{
				title: "Mode",
				choices: [{ label: "Safe" }, { label: "Fast" }],
			},
		],
	};
	const screen = [
		"□ 1   Review",
		"",
		"Mode",
		">   Safe",
		"    Fast",
		"    Other/rephrase",
		"Comment (optional)",
	].join("\n");
	assert.deepEqual(inspectAskScreen(screen, ask), {
		recognized: true,
		current_prompt: "Mode",
		selected: "Safe",
	});
});

test("ask inspection recognizes the review frame", () => {
	assert.deepEqual(
		inspectAskScreen(
			"□ 1  □ 2  Review\n\nReview\n\n1. Mode\n   Fast\n\nenter submit • left previous prompt",
			{ prompts: [{ title: "Mode" }] },
		),
		{ recognized: true, current_prompt: "Review", selected: undefined },
	);
});

test("busy fallback catches compaction but not an idle footer", () => {
	assert.equal(isBusyScreen("Queued message for after compaction\nAuto-compacting..."), true);
	assert.equal(isBusyScreen("Done.\n────────\n↑12k ↓2k"), false);
});

test("shared prompt helper waits server-side with a longer transport deadline", async () => {
	const panel = { pane_id: "pane-child", terminal_id: "terminal-child" };
	const completed = { ...panel, agent_status: "done" };
	const result = await promptAgent({
		async request(method, params, timeoutMs) {
			assert.equal(method, "agent.prompt");
			assert.deepEqual(params, {
				target: "pane-child", text: "Inspect it",
				wait: { until: ["idle", "done", "blocked"], timeout_ms: 30_000 },
			});
			assert.equal(timeoutMs, 35_000);
			return { agent: completed };
		},
	}, panel, "Inspect it", 30_000);
	assert.equal(result, completed);
});

test("shared prompt helper preserves nonblocking prompt delivery", async () => {
	const panel = { pane_id: "pane-child", terminal_id: "terminal-child" };
	await promptAgent({
		async request(method, params, timeoutMs) {
			assert.equal(method, "agent.prompt");
			assert.deepEqual(params, { target: "pane-child", text: "Follow up" });
			assert.equal(timeoutMs, 10_000);
			return { agent: panel };
		},
	}, panel, "Follow up");
});

test("shared prompt helper rejects replaced or missing terminal identity", async () => {
	for (const terminal_id of ["replacement", undefined]) {
		await assert.rejects(promptAgent({
			request: async () => ({ agent: { terminal_id } }),
		}, { pane_id: "pane-child", terminal_id: "original" }, "Inspect it", 30_000),
			/no longer hosts the targeted Pi agent/);
	}
	await assert.rejects(promptAgent({ request: async () => ({ agent: {} }) },
		{ pane_id: "pane-child" }, "Inspect it"), /no longer hosts the targeted Pi agent/);
});

test("shared prompt helper preserves server timeout and transport errors", async () => {
	for (const code of ["timeout", "ECONNRESET"]) {
		const error = Object.assign(new Error(code), { code });
		await assert.rejects(promptAgent({ request: async () => { throw error; } },
			{ pane_id: "pane-child", terminal_id: "original" }, "Inspect it", 30_000),
			(actual) => actual === error);
	}
});

test("settled output bounds coordination replies but allows full spawn replies", async () => {
	const text = "x".repeat(40_000);
	const reader = { read: async () => ({
		path: "session.jsonl",
		assistant_entry: { id: "new", stop_reason: "stop" },
		assistant: { id: "new", text },
	}) };
	const panel = {
		pane_id: "pane-child", agent_status: "idle",
		agent_session: { kind: "path", value: "session.jsonl" },
	};
	const baseline = { path: "session.jsonl", assistant_entry_id: "old", reply_id: "old" };
	const bounded = await settledOutput(reader, panel, baseline, true);
	assert.equal(bounded.truncated, true);
	assert.ok(bounded.text.length < text.length);
	const full = await settledOutput(reader, panel, baseline, true, { fullText: true });
	assert.equal(full.text, text);
	assert.equal(full.truncated, undefined);
});

test("settled output uses the completion session even if the live pane has advanced", async () => {
	const completed = {
		pane_id: "pane-child", terminal_id: "original", agent_status: "done",
		agent_session: { kind: "path", value: "completed.jsonl" },
	};
	const client = {
		async request(method) {
			assert.equal(method, "agent.prompt", "never refetch the live panel after completion");
			return { agent: completed };
		},
	};
	const resultPanel = await promptAgent(client, completed, "Inspect it", 30_000);
	let reads = 0;
	const output = await settledOutput({
		async read(path) {
			assert.equal(path, "completed.jsonl");
			assert.equal(++reads, 1);
			return {
				path, assistant_entry: { id: "completed" },
				assistant: { id: "completed", text: "Original result" },
			};
		},
	}, resultPanel, { path: "completed.jsonl", reply_id: "old", assistant_entry_id: "old" }, true);
	assert.equal(output.text, "Original result");
});

test("settled output reports persistence lag rather than returning an old reply", async () => {
	const output = await settledOutput({ read: async () => ({
		path: "session.jsonl", assistant_entry: { id: "old" },
		assistant: { id: "old", text: "stale" },
	}) }, {
		pane_id: "pane-child", agent_status: "idle",
		agent_session: { kind: "path", value: "session.jsonl" },
	}, { path: "session.jsonl", assistant_entry_id: "old", reply_id: "old" }, true);
	assert.deepEqual(output, { pane: "pane-child", status: "idle", transcript_pending: true });
});
