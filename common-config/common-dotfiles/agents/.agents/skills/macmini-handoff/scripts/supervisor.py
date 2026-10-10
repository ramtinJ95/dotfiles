import argparse
import fcntl
import hashlib
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("deadline must include a timezone")
    return parsed.timestamp()


def read_progress(root):
    root = root.resolve()
    task = json.loads((root / "STATUS.json").read_text())
    if task["status"] not in {"RUNNING", "PAUSED", "BLOCKED", "COMPLETE"}:
        raise ValueError("invalid task status")
    if not isinstance(task["progress_seq"], int) or task["progress_seq"] < 0:
        raise ValueError("progress_seq must be a nonnegative integer")
    if not isinstance(task["phase"], str) or not task["phase"]:
        raise ValueError("phase is required")
    evidence = task["evidence"]
    if not isinstance(evidence, list) or not 1 <= len(evidence) <= 32:
        raise ValueError("one to 32 evidence files are required")
    digest = hashlib.sha256()
    for name in sorted(evidence):
        path = Path(name)
        resolved = (root / path).resolve()
        if path.is_absolute() or ".." in path.parts or root not in resolved.parents:
            raise ValueError("evidence must remain inside the task directory")
        if path.name.startswith("SUPERVISOR") or path.name in {
            "STATUS.json",
            "PROGRESS.md",
        }:
            raise ValueError("status and supervisor heartbeats are not work evidence")
        with resolved.open("rb") as handle:
            size = handle.seek(0, os.SEEK_END)
            handle.seek(max(0, size - 65536))
            digest.update(handle.read())
        digest.update(f"{name}:{size}".encode())
    operation = task.get("operation")
    if operation is not None:
        if not isinstance(operation["id"], str) or not operation["id"]:
            raise ValueError("operation id is required")
        operation = {
            "id": operation["id"],
            "deadline": timestamp(operation["deadline_at"]),
        }
    report = root / "REPORT.md"
    return {
        "task_state": task["status"],
        "phase": task["phase"],
        "progress_key": digest.hexdigest(),
        "operation": operation,
        "report_ready": report.is_file() and bool(report.read_text().strip()),
        "paused": (root / "SUPERVISOR_PAUSED").exists(),
    }


def decide(observation, state, now, limits):
    result = {"status": "ACTIVE", "reason": "work evidence is recent", "resume": False}
    if not observation["identity_matches"]:
        return result | {"status": "UNKNOWN", "reason": "controller identity changed"}
    if observation["paused"] or observation["task_state"] == "PAUSED":
        return result | {
            "status": "PAUSED",
            "reason": "automatic continuation is paused",
        }
    if observation["controller_state"] == "blocked":
        return result | {
            "status": "BLOCKED",
            "reason": "controller requires input; no automatic response permitted",
        }
    if observation["task_state"] == "COMPLETE":
        return result | {
            "status": "COMPLETE" if observation["report_ready"] else "ATTENTION",
            "reason": "terminal claim; inspect report and acceptance evidence",
        }
    if observation["task_state"] == "BLOCKED":
        return result | {"status": "BLOCKED", "reason": "controller recorded a blocker"}
    if now >= limits["deadline"]:
        return result | {
            "status": "DEADLINE",
            "reason": "authorization expired; workload termination must be enforced separately",
        }
    if observation["controller_state"] not in {"working", "idle", "done"}:
        return result | {
            "status": "UNKNOWN",
            "reason": "controller lifecycle is not recognized",
        }
    if observation["progress_key"] != state.get("progress_key"):
        state.update(
            progress_key=observation["progress_key"],
            last_progress_at=now,
            phase_resumes=0,
        )
    state.setdefault("total_resumes", 0)
    operation = observation["operation"]
    if operation:
        previous = state.get("operation")
        if (
            previous
            and previous["id"] == operation["id"]
            and previous["deadline"] != operation["deadline"]
        ):
            return result | {
                "status": "ATTENTION",
                "reason": "operation deadline changed without a new attempt",
            }
        if operation["deadline"] > min(
            limits["deadline"], now + limits["max_operation_seconds"]
        ):
            return result | {
                "status": "ATTENTION",
                "reason": "operation exceeds approved time bounds",
            }
        state["operation"] = dict(operation)
    if observation["controller_state"] in {"idle", "done"}:
        if state.get("idle_since") is None:
            state["idle_since"] = now
        if now - state["idle_since"] < limits["idle_seconds"]:
            return result | {
                "status": "IDLE",
                "reason": "unfinished task; waiting through idle grace period",
            }
        if not limits["allow_resume"]:
            return result | {
                "status": "ATTENTION",
                "reason": "idle continuation was not authorized",
            }
        if (
            state["phase_resumes"] >= limits["max_resumes"]
            or state["total_resumes"] >= limits["max_total_resumes"]
        ):
            return result | {
                "status": "ATTENTION",
                "reason": "bounded continuation attempts exhausted",
            }
        state["phase_resumes"] += 1
        state["total_resumes"] += 1
        state["idle_since"] = now
        return result | {
            "status": "RESUMING",
            "reason": "one authorized continuation attempt; activity not yet verified",
            "resume": True,
        }
    state["idle_since"] = None
    if operation and now >= operation["deadline"]:
        return result | {
            "status": "STALLED",
            "reason": "active operation exceeded its deadline",
        }
    if now - state["last_progress_at"] >= limits["stale_seconds"]:
        return result | {
            "status": "STALLED",
            "reason": "working process has no advancing work evidence",
        }
    return result


def read_agent(session, agent):
    result = subprocess.run(
        ["herdr", "--session", session, "agent", "get", agent],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )
    observed = json.loads(result.stdout)["result"]["agent"]
    if not isinstance(observed, dict):
        raise ValueError("controller identity is unavailable")
    screen = subprocess.run(
        [
            "herdr",
            "--session",
            session,
            "agent",
            "read",
            agent,
            "--source",
            "detection",
            "--lines",
            "120",
        ],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    ).stdout
    if "Approve running this command?" in screen or (
        "Approve and run" in screen and "Enter confirm" in screen
    ):
        observed["agent_status"] = "blocked"
    return observed


def write_state(root, value):
    temporary = root / "SUPERVISOR.json.tmp"
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(root / "SUPERVISOR.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--agent", required=True)
    parser.add_argument("--agent-session", required=True)
    parser.add_argument("--deadline", required=True)
    parser.add_argument("--allow-resume", action="store_true")
    parser.add_argument("--interval", type=int, default=20)
    parser.add_argument("--idle-seconds", type=int, default=60)
    parser.add_argument("--stale-seconds", type=int, default=300)
    parser.add_argument("--max-operation-seconds", type=int, default=1800)
    parser.add_argument("--max-resumes", type=int, default=2)
    parser.add_argument("--max-total-resumes", type=int, default=10)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if any(
        value <= 0
        for value in [
            args.interval,
            args.idle_seconds,
            args.stale_seconds,
            args.max_operation_seconds,
            args.max_resumes,
            args.max_total_resumes,
        ]
    ):
        parser.error("time bounds and continuation budgets must be positive")
    root = args.root.expanduser().resolve(strict=True)
    limits = vars(args) | {"deadline": timestamp(args.deadline)}
    identity = {
        "root": str(root),
        "session": args.session,
        "agent": args.agent,
        "agent_session": args.agent_session,
    }
    with (root / "SUPERVISOR.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = root / "SUPERVISOR.json"
        state = {}
        if previous.exists():
            saved = json.loads(previous.read_text())
            if saved["identity"] != identity:
                raise ValueError(
                    "existing supervisor state belongs to a different controller"
                )
            state = saved["memory"]
        while True:
            now = time.time()
            snapshot = {
                "identity": identity,
                "pid": os.getpid(),
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "memory": state,
            }
            try:
                observed = read_progress(root)
                agent = read_agent(args.session, args.agent)
                observed["identity_matches"] = (agent.get("agent_session") or {}).get(
                    "value"
                ) == args.agent_session and agent.get("name") == args.agent
                observed["controller_state"] = agent.get("agent_status", "unknown")
                decision = decide(observed, state, now, limits)
                snapshot.update(
                    decision,
                    phase=observed["phase"],
                    controller_state=observed["controller_state"],
                )
                write_state(root, snapshot)
                if decision["resume"]:
                    current = read_agent(args.session, args.agent)
                    task = read_progress(root)
                    if (
                        time.time() >= limits["deadline"]
                        or current.get("agent_status") not in {"idle", "done"}
                        or (current.get("agent_session") or {}).get("value")
                        != args.agent_session
                        or current.get("name") != args.agent
                        or task["task_state"] != "RUNNING"
                        or task["paused"]
                    ):
                        snapshot.update(
                            status="OBSERVING",
                            reason="state changed before continuation; no input sent",
                            resume=False,
                        )
                    else:
                        prompt = "Authorized handoff continuation: this task is unfinished. Read HANDOFF.md, STATUS.json, and SUPERVISOR.json. Respect PREPARE/START: before START, perform only the explicitly authorized harmless supervision rehearsal, never implementation or workload execution. After START, own the next in-scope step and continue through implementation, validation, and reporting without milestone-only final turns. Inspect any expired operation or failed attempt before retrying; do not repeat a failed command blindly. Checkpoint real evidence and bounded active-operation metadata atomically. Stop with an explicit BLOCKED report if permission, safety, scope, or deadline prevents progress. Never bypass an approval, widen scope, launch another agent, or depend on the source machine."
                        subprocess.run(
                            [
                                "herdr",
                                "--session",
                                args.session,
                                "agent",
                                "prompt",
                                args.agent,
                                prompt,
                            ],
                            capture_output=True,
                            text=True,
                            timeout=15,
                            check=True,
                        )
            except (
                OSError,
                ValueError,
                KeyError,
                TypeError,
                subprocess.SubprocessError,
            ) as error:
                snapshot.update(
                    status="UNKNOWN",
                    reason=f"observation or continuation failed: {type(error).__name__}",
                    resume=False,
                )
            if time.time() >= limits["deadline"]:
                snapshot.update(
                    status="DEADLINE",
                    reason="authorization expired; workload termination must be enforced separately",
                    resume=False,
                )
            write_state(root, snapshot)
            with (root / "SUPERVISOR.events.jsonl").open("a") as events:
                events.write(json.dumps(snapshot, sort_keys=True) + "\n")
            print(json.dumps(snapshot, sort_keys=True), flush=True)
            if args.once or snapshot["status"] in {"COMPLETE", "DEADLINE"}:
                return
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
