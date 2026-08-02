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
