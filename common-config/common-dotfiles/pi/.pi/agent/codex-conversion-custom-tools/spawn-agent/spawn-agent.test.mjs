import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { resolveTargetAlias } from "../herdr-agent/herdr-agent.mjs";
import {
	buildAgentName,
	buildInteractivePiArgs,
	buildPiArgs,
	buildSpawnLabel,
	parseSpawnAgentRequest,
	resolveHerdrContext,
	runHerdrSpawn,
	startHerdrAgent,
	waitForHerdrAgentReady,
} from "./spawn-agent.mjs";

test("accepts and normalizes a task label", () => {
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "explorer",
			message: "Inspect it",
			label: "  Trace   authentication\nflow  ",
		}),
	);
	assert.equal(request.label, "Trace authentication flow");
	assert.equal(request.interactive, true);
	assert.equal(buildSpawnLabel(request, "/tmp/project"), "Explore · Trace authentication flow");
});

test("accepts an explicit headless request", () => {
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "reviewer",
			message: "Review it",
			interactive: false,
		}),
	);
	assert.equal(request.interactive, false);
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "reviewer",
					message: "Review it",
					interactive: "false",
				}),
			),
		/interactive must be a boolean/,
	);
});

test("requires explicit user-request declaration for worker agents", () => {
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({ agent_type: "worker", message: "Implement it" }),
			),
		/worker requires user_requested=true/,
	);
	const request = parseSpawnAgentRequest(
		JSON.stringify({
			agent_type: "worker",
			message: "Implement it",
			user_requested: true,
		}),
	);
	assert.equal(request.user_requested, true);
	assert.equal(buildSpawnLabel(request, "/tmp/project"), "Work · project");
	assert.throws(
		() =>
			parseSpawnAgentRequest(
				JSON.stringify({
					agent_type: "explorer",
					message: "Inspect it",
					user_requested: true,
				}),
			),
		/user_requested is only valid for the worker agent/,
	);
});

test("builds a worker Pi with the general-purpose worker prompt", () => {
	const args = buildInteractivePiArgs({ agent_type: "worker" });
	assert.equal(args.includes("--no-approve"), true);
	assert.equal(args.includes("--approve"), false);
	const extensions = args
		.map((arg, index) => (args[index - 1] === "--extension" ? arg : undefined))
		.filter(Boolean);
	assert.equal(extensions.length, 1);
	assert.equal(extensions[0].endsWith("/worker-profile"), true);
	assert.equal(args.includes("--skill"), false);
	const profile = JSON.parse(
		readFileSync(resolve(extensions[0], "package.json"), "utf8"),
	);
	assert.equal(profile.pi.extensions.length, 8);
	assert.deepEqual(
		profile.pi.skills.map((path) => path.split("/").at(-2)),
		["grok", "grilling", "lavish"],
	);
	for (const resource of [...profile.pi.extensions, ...profile.pi.skills])
		assert.equal(existsSync(resolve(extensions[0], resource)), true, resource);
	assert.equal(args.join(" ").length < 1_000, true);
	assert.deepEqual(
		args.slice(
			args.indexOf("--exclude-tools"),
			args.indexOf("--exclude-tools") + 2,
		),
		["--exclude-tools", "spawn_agent"],
	);
	assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 4), [
		"--model",
		"openai-codex/gpt-5.6-sol",
		"--thinking",
		"high",
	]);
	assert.match(args.at(-3), /worker\.prompt\.md$/);
	assert.match(args.at(-1), /coordination\.prompt\.md$/);
});

test("keeps the headless worker lean", () => {
	const args = buildPiArgs({ agent_type: "worker" }, "Implement it");
	assert.equal(args.filter((arg) => arg === "--extension").length, 1);
	assert.equal(args.includes("--skill"), false);
	assert.deepEqual(
		args.slice(
			args.indexOf("--exclude-tools"),
			args.indexOf("--exclude-tools") + 2,
		),
		["--exclude-tools", "spawn_agent"],
	);
});

test("builds an interactive isolated Pi with Herdr reporting", () => {
	const args = buildInteractivePiArgs({ agent_type: "reviewer" });
	assert.equal(args.includes("--print"), false);
	assert.equal(args.includes("--no-session"), false);
	assert.equal(args.includes("--no-extensions"), true);
	assert.equal(args.includes("--no-approve"), true);
	assert.equal(args.filter((arg) => arg === "--extension").length, 2);
	assert.match(args.at(-1), /coordination\.prompt\.md$/);
});

test("uses a valid stable Herdr agent name separate from the display label", () => {
	assert.equal(
		buildAgentName({ agent_type: "explorer" }, "w1:p42"),
		"explorer-w1-p42",
	);
});

test("resolves the spawned child parent alias without exposing its pane id to the model", () => {
	assert.equal(
		resolveTargetAlias("parent", {
			SPAWN_AGENT_PARENT_PANE_ID: "pane-parent",
		}),
		"pane-parent",
	);
	assert.equal(resolveTargetAlias("pane-child", {}), "pane-child");
	assert.throws(() => resolveTargetAlias("parent", {}), /only to a spawned subagent/);
});

test("uses headless mode only when Herdr is disabled", () => {
	assert.equal(resolveHerdrContext({}), undefined);
	assert.throws(
		() => resolveHerdrContext({ HERDR_ENV: "1" }),
		/HERDR_SOCKET_PATH or HERDR_PANE_ID is missing/,
	);
	assert.deepEqual(
		resolveHerdrContext({
			HERDR_ENV: "1",
			HERDR_SOCKET_PATH: "/tmp/herdr.sock",
			HERDR_PANE_ID: "pane-parent",
		}),
		{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
	);
});

test("waits for a newly-created tab shell before starting its agent", async () => {
	let attempts = 0;
	const client = {
		async request(method) {
			assert.equal(method, "agent.start");
			attempts += 1;
			if (attempts === 1) throw new Error("agent target pane is not an available shell");
			return { started: true };
		},
	};
	const waits = [];
	const result = await startHerdrAgent(
		client,
		{ pane_id: "pane-child" },
		Date.now() + 1_000,
		async (milliseconds) => waits.push(milliseconds),
	);
	assert.deepEqual(result, { started: true });
	assert.equal(attempts, 2);
	assert.deepEqual(waits, [100]);
});

test("waits for Herdr launch detection before prompting the agent", async () => {
	let attempts = 0;
	const client = {
		async request(method) {
			assert.equal(method, "agent.get");
			attempts += 1;
			return {
				agent:
					attempts === 1
						? { launch_pending: true }
						: { interactive_ready: true, launch_pending: false },
			};
		},
	};
	const waits = [];
	const ready = await waitForHerdrAgentReady(
		client,
		"pane-child",
		Date.now() + 1_000,
		async (milliseconds) => waits.push(milliseconds),
	);
	assert.equal(ready.interactive_ready, true);
	assert.equal(attempts, 2);
	assert.deepEqual(waits, [100]);
});

test("creates a background tab, starts Pi, prompts it, and returns its session result", async () => {
	const calls = [];
	const client = {
		async request(method, params) {
			calls.push({ method, params });
			if (method === "agent.get" && params.target === "pane-parent") {
				return { agent: { agent: "pi", workspace_id: "workspace-1" } };
			}
			if (method === "tab.create") {
				return {
					tab: { tab_id: "tab-child" },
					root_pane: { pane_id: "pane-child" },
				};
			}
			if (method === "agent.start" || method === "agent.prompt") return {};
			if (method === "agent.get" && params.target === "pane-child") {
				return {
					agent: {
						agent: "pi",
						agent_status: "idle",
						interactive_ready: true,
						launch_pending: false,
						agent_session: { kind: "path", value: "/tmp/child.jsonl" },
					},
				};
			}
			throw new Error(`unexpected ${method}`);
		},
	};
	const reader = {
		reads: 0,
		async read(path) {
			assert.equal(path, "/tmp/child.jsonl");
			this.reads += 1;
			if (this.reads === 1) {
				return { path, leaf_id: "initial" };
			}
			return {
				path,
				assistant: { id: "reply-1", text: "Found it" },
				assistant_entry: { id: "reply-1", stop_reason: "stop" },
			};
		},
	};
	const output = await runHerdrSpawn(
		{ agent_type: "explorer", label: "Trace auth" },
		{ cwd: "/repo", message: "Inspect auth" },
		{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
		client,
		reader,
		async () => ({ pane: "pane-child", status: "idle", text: "Found it" }),
	);
	assert.deepEqual(JSON.parse(output), {
		tab: "tab-child",
		pane: "pane-child",
		label: "Explore · Trace auth",
		status: "idle",
		text: "Found it",
	});
	assert.deepEqual(
		calls.map(({ method }) => method),
		[
			"agent.get",
			"tab.create",
			"agent.start",
			"agent.get",
			"agent.prompt",
			"agent.get",
		],
	);
	assert.equal(calls[1].params.focus, false);
	assert.equal(calls[1].params.workspace_id, "workspace-1");
	assert.equal(calls[2].params.pane_id, "pane-child");
	assert.equal(calls[2].params.name, "explorer-pane-child");
	assert.equal(calls[4].params.text, "Inspect auth");
});

test("closes a newly-created tab when Pi fails to start", async () => {
	const calls = [];
	const client = {
		async request(method, params) {
			calls.push({ method, params });
			if (method === "agent.get") {
				return { agent: { agent: "pi", workspace_id: "workspace-1" } };
			}
			if (method === "tab.create") {
				return {
					tab: { tab_id: "tab-child" },
					root_pane: { pane_id: "pane-child" },
				};
			}
			if (method === "agent.start") throw new Error("Pi did not become ready");
			if (method === "tab.close") return {};
			throw new Error(`unexpected ${method}`);
		},
	};
	await assert.rejects(
		runHerdrSpawn(
			{ agent_type: "reviewer", label: "Review auth" },
			{ cwd: "/repo", message: "Review auth" },
			{ socketPath: "/tmp/herdr.sock", parentPaneId: "pane-parent" },
			client,
			{},
		),
		/Pi did not become ready/,
	);
	assert.equal(calls.at(-1).method, "tab.close");
});
