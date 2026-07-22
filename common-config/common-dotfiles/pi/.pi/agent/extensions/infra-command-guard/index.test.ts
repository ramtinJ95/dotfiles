import assert from "node:assert/strict";
import createExtension, { _test } from "./index.ts";

const tests: Array<{ name: string; run: () => void | Promise<void> }> = [];

function test(name: string, run: () => void | Promise<void>): void {
	tests.push({ name, run });
}

const {
	evaluateCommandWithRm,
	executionIdentity,
	ApprovalStore,
	guardExecution,
	ensureCodeModeGuardInstalled,
	CODE_MODE_RUNTIME_KEY,
	CODE_MODE_GUARD_BRIDGE_KEY,
	APPROVAL_STORE_KEY,
	CODE_MODE_TOOL_WRAPPED,
} = _test;

test("rm classification covers executable paths and common wrappers", () => {
	for (const command of [
		"rm -rf target",
		"/bin/rm -rf target",
		"sudo rm -rf target",
		"env FOO=bar rm -rf target",
		"command rm -rf target",
		"xargs rm",
		"find . -exec rm {} ;",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, false, command);
	}

	assert.equal(evaluateCommandWithRm('printf "%s\\n" "rm"').allow, true);
	assert.equal(evaluateCommandWithRm("kubectl port-forward service/api 8080:80 && rm marker").allow, false);
});

test("kubectl and terraform retain their safe and approval-required behavior", () => {
	for (const command of [
		"kubectl get pods",
		"/usr/local/bin/kubectl --context prod get pods",
		"sudo -n kubectl -n production describe deployment/api",
		"kubectl logs deployment/api",
		"kubectl port-forward service/api 8080:80",
		"nohup kubectl port-forward service/api 8080:80 >port-forward.log 2>&1 &",
		"kubectl auth can-i get pods",
		"terraform plan",
		"terraform -chdir=infra plan",
		"env TF_IN_AUTOMATION=1 terraform show plan.out",
		"terraform state list",
		"terraform workspace show",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, true, command);
	}

	for (const command of [
		"kubectl delete pod api",
		"/usr/local/bin/kubectl --context prod apply -f deployment.yaml",
		"env KUBECONFIG=cluster.yaml kubectl patch deployment api -p {}",
		"kubectl get secrets",
		"kubectl describe secret/api-token",
		"kubectl --raw=/api/v1/namespaces/default/secrets",
		"kubectl rollout restart deployment/api",
		"terraform apply",
		"sudo terraform -chdir infra apply plan.out",
		"terraform destroy",
		"terraform output",
		'bash -lc "kubectl get pods"',
		'python -c "import os; os.system(\'terraform apply\')"',
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, false, command);
	}
});

test("guarded commands fail closed through shell composition and obfuscation", () => {
	for (const command of [
		"printf ready && kubectl delete pod api",
		"printf ready || terraform apply",
		"printf pod | xargs kubectl delete",
		"kubectl get pods & kubectl delete pod api",
		"$(kubectl delete pod api)",
		"`terraform apply`",
		"K=kubectl $K delete pod api",
		"K=kubectl; $K delete pod api",
		"kube\\ctl delete pod api",
		'ter"ra"form apply',
		"find . -exec /bin/rm -rf {} +",
		"printf target | xargs -n1 /bin/rm",
		"$TOOL delete pod api",
		'sudo "$TOOL" apply plan.out',
		'"${KUBECTL}" delete pod api',
		"$'r''m' -rf target",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, false, command);
	}

	for (const command of [
		'printf "%s\\n" "kubectl delete pod api"',
		'printf "%s\\n" "terraform apply"',
		'printf "%s\\n" "rm -rf target"',
		'printf "%s\\n" "$TOOL"',
		'echo "${HOME}"',
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, true, command);
	}
});

test("wrapper matrix cannot hide guarded executables", () => {
	const riskyCommands = [
		"kubectl delete pod api",
		"terraform apply plan.out",
		"rm -rf target",
	];
	const wrappers = [
		(command: string) => command,
		(command: string) => `sudo -n ${command}`,
		(command: string) => `env TEST_GUARD=1 ${command}`,
		(command: string) => `command ${command}`,
		(command: string) => `nice -n 5 ${command}`,
		(command: string) => `nohup ${command}`,
		(command: string) => `time -p ${command}`,
		(command: string) => `/usr/bin/env TEST_GUARD=1 ${command}`,
	];
	for (const risky of riskyCommands) {
		for (const wrap of wrappers) {
			const command = wrap(risky);
			assert.equal(evaluateCommandWithRm(command).allow, false, command);
		}
	}

	for (const command of [
		"sudo -n kubectl get pods",
		"env KUBECONFIG=test kubectl logs deployment/api",
		"command kubectl describe pod/api",
		"nice -n 5 terraform plan",
		"time -p terraform validate",
		"/usr/bin/env TF_IN_AUTOMATION=1 terraform state list",
	]) {
		assert.equal(evaluateCommandWithRm(command).allow, true, command);
	}
});

test("approval is bound to the blocked execution context and consumed once", () => {
	let now = 1_000;
	const store = new ApprovalStore(() => now, () => "request-1");
	const identity = executionIdentity(
		"code-mode-exec-command",
		{ cmd: "rm -rf build", workdir: "project", shell: "zsh", tty: false },
		"/tmp",
	)!;
	const blocked = guardExecution(store, identity, "tui");
	assert.equal(blocked.allow, false);
	assert.equal(blocked.requestId, "request-1");
	assert.match(blocked.reason, /Approval request: request-1/);

	assert.deepEqual(store.approve("request-1", identity.command, "wrong reason"), {
		ok: false,
		error: "Approval request does not match the guard reason. Do not retry the command.",
	});
	assert.deepEqual(store.approve("request-1", identity.command, "rm command needs confirmation"), { ok: true });
	assert.equal(store.consume({ ...identity, cwd: "/tmp/other" }), false);
	assert.equal(store.consume({ ...identity, shell: "bash" }), false);
	assert.equal(store.consume({ ...identity, source: "exec-command" }), false);
	assert.equal(store.consume({ ...identity, tty: true }), false);
	assert.equal(store.consume({ ...identity, login: false }), false);
	assert.equal(store.consume({ ...identity, command: `${identity.command} ` }), false);
	assert.equal(store.consume(identity), true);
	assert.equal(store.consume(identity), false);

	now += 11 * 60 * 1000;
	assert.equal(store.consume(identity), false);
});

test("approval validation rejects proactive, mismatched, cancelled, and expired grants", () => {
	let now = 10_000;
	let nextId = 0;
	const store = new ApprovalStore(() => now, () => `strict-${++nextId}`);
	const identity = executionIdentity("exec-command", { cmd: "kubectl delete pod api" }, "/tmp")!;
	assert.deepEqual(store.approve("invented", identity.command, "invented"), {
		ok: false,
		error: "Approval request is missing or expired. Retry the blocked shell call to create a new request.",
	});

	const blocked = guardExecution(store, identity, "tui");
	assert.equal(blocked.allow, false);
	assert.deepEqual(store.approve(blocked.requestId, `${identity.command} `, "kubectl delete is not on the low-risk allowlist"), {
		ok: false,
		error: "Approval request does not match the exact blocked command. Do not retry the command.",
	});
	store.cancel(blocked.requestId!);
	assert.deepEqual(store.approve(blocked.requestId, identity.command, "kubectl delete is not on the low-risk allowlist"), {
		ok: false,
		error: "Approval request is missing or expired. Retry the blocked shell call to create a new request.",
	});

	const expiring = guardExecution(store, identity, "tui");
	assert.equal(expiring.allow, false);
	assert.deepEqual(store.approve(expiring.requestId, identity.command, "kubectl delete is not on the low-risk allowlist"), { ok: true });
	now += 11 * 60 * 1000;
	assert.equal(store.consume(identity), false);
});

test("one approval cannot authorize two concurrent identical retries", () => {
	const store = new ApprovalStore(() => 1_000, () => "parallel-request");
	const identity = executionIdentity("exec-command", { cmd: "terraform apply" }, "/tmp")!;
	const blocked = guardExecution(store, identity, "tui");
	assert.equal(blocked.allow, false);
	assert.deepEqual(
		store.approve("parallel-request", identity.command, "terraform apply is not on the low-risk allowlist"),
		{ ok: true },
	);
	assert.deepEqual([store.consume(identity), store.consume(identity)].sort(), [false, true]);
});

test("legacy approval calls infer only one unambiguous pending request", () => {
	let nextId = 0;
	const store = new ApprovalStore(() => 1_000, () => `request-${++nextId}`);
	const first = executionIdentity("exec-command", { cmd: "rm target" }, "/tmp/one")!;
	guardExecution(store, first, "tui");
	assert.deepEqual(store.approve(undefined, first.command, "rm command needs confirmation"), { ok: true });
	assert.equal(store.consume(first), true);

	guardExecution(store, first, "tui");
	const second = { ...first, cwd: "/tmp/two" };
	guardExecution(store, second, "tui");
	assert.deepEqual(store.validate(undefined, first.command, "rm command needs confirmation"), {
		ok: false,
		error: "Multiple pending approvals match this command. Retry the blocked shell call and pass its request_id.",
	});
});

test("approval requests expire", () => {
	let now = 5_000;
	const store = new ApprovalStore(() => now, () => "expiring-request");
	const identity = executionIdentity("exec-command", { cmd: "rm old" }, "/tmp")!;
	guardExecution(store, identity, "tui");
	now += 11 * 60 * 1000;
	assert.deepEqual(store.approve("expiring-request", identity.command, "rm command needs confirmation"), {
		ok: false,
		error: "Approval request is missing or expired. Retry the blocked shell call to create a new request.",
	});
});

test("non-TUI calls fail closed without creating an unusable approval request", () => {
	const store = new ApprovalStore(() => 1_000, () => "must-not-be-created");
	const identity = executionIdentity("exec-command", { cmd: "rm target" }, "/tmp")!;
	const guarded = guardExecution(store, identity, "rpc");
	assert.equal(guarded.allow, false);
	assert.equal(guarded.requestId, undefined);
	assert.match(guarded.reason, /Approval is unavailable outside TUI mode/);
	assert.doesNotMatch(guarded.reason, /approve_infra_command/);
});

test("interactive interpreters are denied rather than approvable", () => {
	const store = new ApprovalStore(() => 1_000, () => "unused-request");
	for (const command of ["bash", "sudo /bin/zsh", "env python3.12", "exec node"]) {
		const identity = executionIdentity("code-mode-exec-command", { cmd: command, tty: true }, "/tmp")!;
		const guarded = guardExecution(store, identity, "tui");
		assert.equal(guarded.allow, false, command);
		assert.equal(guarded.requestId, undefined, command);
		assert.match(guarded.reason, /write_stdin input cannot be classified reliably/, command);
	}
	const nonInteractive = executionIdentity("code-mode-exec-command", { cmd: "bash -lc 'printf safe'" }, "/tmp")!;
	assert.deepEqual(guardExecution(store, nonInteractive, "tui"), { allow: true });
});

test("Code Mode provider wrapper blocks before invoke and reads the current reload bridge", async () => {
	let invokeCount = 0;
	const provider = {
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						invokeCount += 1;
						return "ran";
					},
				},
			];
		},
	};
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, provider]]) } },
	};
	events[CODE_MODE_GUARD_BRIDGE_KEY] = () => {
		throw new Error("blocked by test bridge");
	};

	assert.deepEqual(ensureCodeModeGuardInstalled(events, { cwd: "/tmp" }), { ok: true });
	assert.deepEqual(ensureCodeModeGuardInstalled(events, { cwd: "/tmp" }), { ok: true });
	const firstTool = provider.getTools()[0]!;
	assert.equal(Boolean(firstTool[CODE_MODE_TOOL_WRAPPED]), true);
	await assert.rejects(firstTool.invoke({ cmd: "rm target" }, { cwd: "/tmp" }), /blocked by test bridge/);
	assert.equal(invokeCount, 0);

	let bridgeCount = 0;
	events[CODE_MODE_GUARD_BRIDGE_KEY] = () => {
		bridgeCount += 1;
	};
	assert.equal(await firstTool.invoke({ cmd: "printf safe" }, { cwd: "/tmp" }), "ran");
	assert.equal(bridgeCount, 1);
	assert.equal(invokeCount, 1);

	delete events[CODE_MODE_GUARD_BRIDGE_KEY];
	await assert.rejects(firstTool.invoke({ cmd: "printf safe" }, { cwd: "/tmp" }), /bridge is unavailable/);
	assert.equal(invokeCount, 1);
});

test("Code Mode adapter supports legacy arrays and providers added after startup", async () => {
	const calls: string[] = [];
	const createProvider = (name: string) => ({
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						calls.push(name);
						return name;
					},
				},
			];
		},
	});
	const first = createProvider("first");
	const providers = new Map<object, ReturnType<typeof createProvider>>([[{}, first]]);
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers } },
		[CODE_MODE_GUARD_BRIDGE_KEY]: () => undefined,
	};
	assert.deepEqual(ensureCodeModeGuardInstalled(events, {}), { ok: true });
	assert.equal(await first.getTools()[0]!.invoke({}, {}), "first");

	const second = createProvider("second");
	providers.set({}, second);
	assert.deepEqual(ensureCodeModeGuardInstalled(events, {}), { ok: true });
	assert.equal(await second.getTools()[0]!.invoke({}, {}), "second");
	assert.deepEqual(calls, ["first", "second"]);

	const legacy = createProvider("legacy");
	const legacyEvents: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { providers: [legacy] },
		[CODE_MODE_GUARD_BRIDGE_KEY]: () => undefined,
	};
	assert.deepEqual(ensureCodeModeGuardInstalled(legacyEvents, {}), { ok: true });
	assert.equal(await legacy.getTools()[0]!.invoke({}, {}), "legacy");
});

test("Code Mode integration fails closed when private runtime internals are unavailable", () => {
	assert.deepEqual(ensureCodeModeGuardInstalled({}, { cwd: "/tmp" }), {
		ok: false,
		reason: "Code Mode runtime was not found",
	});
	assert.deepEqual(
		ensureCodeModeGuardInstalled({ [CODE_MODE_RUNTIME_KEY]: { runtime: {} } }, { cwd: "/tmp" }),
		{ ok: false, reason: "Code Mode provider registry has an unsupported shape" },
	);
	assert.deepEqual(
		ensureCodeModeGuardInstalled(
			{ [CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, { getTools: () => [] }]]) } } },
			{ cwd: "/tmp" },
		),
		{ ok: false, reason: "Code Mode nested exec_command provider was not found" },
	);
	assert.deepEqual(
		ensureCodeModeGuardInstalled(
			{
				[CODE_MODE_RUNTIME_KEY]: {
					runtime: {
						providers: new Map([
							[{}, { getTools: () => { throw new Error("provider failed"); } }],
						]),
					},
				},
			},
			{ cwd: "/tmp" },
		),
		{ ok: false, reason: "Code Mode guard installation failed: provider failed" },
	);
});

test("outer Code Mode calls fail closed when the private runtime is absent", async () => {
	const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
	const pi = {
		events: {},
		registerTool() {},
		on(name: string, handler: (event: any, context: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
	};
	createExtension(pi as never);
	const toolCall = handlers.get("tool_call")![0]!;
	for (const toolName of ["exec", "wait", "functions.exec", "functions.wait"]) {
		const decision = await toolCall({ toolName, input: {} }, { cwd: "/tmp", mode: "tui" });
		assert.deepEqual(decision, {
			block: true,
			reason: "BLOCKED — infra-command-guard cannot safely intercept Code Mode: Code Mode runtime was not found. Reload Pi or disable Code Mode before running commands.",
		});
	}
});

test("extension outer exec hook installs the nested guard before Code Mode collects tools", async () => {
	let invokeCount = 0;
	const provider = {
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						invokeCount += 1;
					},
				},
			];
		},
	};
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, provider]]) } },
	};
	const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
	const pi = {
		events,
		registerTool() {},
		on(name: string, handler: (event: any, context: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
	};
	createExtension(pi as never);
	const context = { cwd: "/tmp", mode: "tui" };
	for (const handler of handlers.get("before_agent_start") ?? []) {
		assert.equal(await handler({}, context), undefined);
	}
	const preparedNested = provider.getTools()[0]!;
	await assert.rejects(
		preparedNested.invoke(
			{ cmd: "rm prepared-target" },
			{ cwd: "/tmp", extensionContext: context },
		),
		/Approval request:/,
	);
	assert.equal(invokeCount, 0);
	for (const handler of handlers.get("tool_call") ?? []) {
		assert.equal(await handler({ toolName: "exec", input: { code: "dynamic" } }, context), undefined);
	}
	const nested = provider.getTools()[0]!;
	await assert.rejects(
		nested.invoke(
			{ cmd: "rm guarded-target" },
			{ cwd: "/tmp", extensionContext: context },
		),
		/Approval request:/,
	);
	assert.equal(invokeCount, 0);
});

test("Code Mode wrapper switches bridges safely across guard reloads", async () => {
	let invokeCount = 0;
	const provider = {
		getTools() {
			return [
				{
					name: "exec_command",
					async invoke() {
						invokeCount += 1;
					},
				},
			];
		},
	};
	const events: Record<PropertyKey, unknown> = {
		[CODE_MODE_RUNTIME_KEY]: { runtime: { providers: new Map([[{}, provider]]) } },
	};
	const createPi = () => {
		const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
		return {
			pi: {
				events,
				registerTool() {},
				on(name: string, handler: (event: any, context: any) => unknown) {
					handlers.set(name, [...(handlers.get(name) ?? []), handler]);
				},
			},
			handlers,
		};
	};
	const context = { cwd: "/tmp", mode: "tui" };
	const first = createPi();
	createExtension(first.pi as never);
	for (const handler of first.handlers.get("before_agent_start") ?? []) await handler({}, context);
	const wrappedBeforeReload = provider.getTools()[0]!;
	await assert.rejects(
		wrappedBeforeReload.invoke({ cmd: "rm first" }, { cwd: "/tmp", extensionContext: context }),
		/Approval request:/,
	);
	for (const handler of first.handlers.get("session_shutdown") ?? []) await handler({}, context);
	await assert.rejects(
		wrappedBeforeReload.invoke({ cmd: "printf safe" }, { cwd: "/tmp", extensionContext: context }),
		/bridge is unavailable/,
	);

	const second = createPi();
	createExtension(second.pi as never);
	for (const handler of second.handlers.get("before_agent_start") ?? []) await handler({}, context);
	await assert.rejects(
		wrappedBeforeReload.invoke({ cmd: "rm second" }, { cwd: "/tmp", extensionContext: context }),
		/Approval request:/,
	);
	assert.equal(invokeCount, 0);
});

test("stale approval tool closures follow the current reload store", async () => {
	const events: Record<PropertyKey, unknown> = {};
	const createPi = () => {
		const tools: any[] = [];
		return {
			pi: {
				events,
				registerTool(tool: any) {
					tools.push(tool);
				},
				on() {},
			},
			tools,
		};
	};
	const first = createPi();
	createExtension(first.pi as never);
	const firstStore = events[APPROVAL_STORE_KEY];
	const staleApprovalTool = first.tools.find((tool) => tool.name === "approve_infra_command")!;
	assert.ok(staleApprovalTool.parameters.required.includes("request_id"));

	const second = createPi();
	createExtension(second.pi as never);
	assert.notEqual(events[APPROVAL_STORE_KEY], firstStore);
	const bridge = events[CODE_MODE_GUARD_BRIDGE_KEY] as (input: unknown, context: unknown) => void;
	let blocked = "";
	try {
		bridge({ cmd: "rm stale-reload-test" }, { cwd: "/tmp", extensionContext: { mode: "tui" } });
	} catch (error) {
		blocked = error instanceof Error ? error.message : String(error);
	}
	const requestId = blocked.match(/Approval request: ([0-9a-f-]+)/)?.[1];
	assert.ok(requestId);
	const prepared = staleApprovalTool.prepareArguments({
		command: "rm stale-reload-test",
		reason: "rm command needs confirmation",
	});
	assert.equal(prepared.request_id, requestId);
	const result = await staleApprovalTool.execute(
		"approval-test",
		{
			request_id: requestId,
			command: "rm stale-reload-test",
			reason: "rm command needs confirmation",
			summary: "test",
			flags: [],
			blastRadius: "test",
		},
		undefined,
		undefined,
		{ mode: "rpc" },
	);
	assert.match(result.content[0].text, /TUI approval UI is not available/);
});

let failures = 0;
for (const testCase of tests) {
	try {
		await testCase.run();
		process.stdout.write(`ok - ${testCase.name}\n`);
	} catch (error) {
		failures += 1;
		process.stderr.write(`not ok - ${testCase.name}\n${error instanceof Error ? error.stack : String(error)}\n`);
	}
}
if (failures > 0) process.exitCode = 1;
