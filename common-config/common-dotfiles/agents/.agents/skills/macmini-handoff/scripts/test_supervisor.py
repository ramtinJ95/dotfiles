import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from supervisor import decide, main, read_agent, read_progress


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.state = {}
        self.limits = {
            "deadline": 10000,
            "idle_seconds": 30,
            "stale_seconds": 120,
            "max_operation_seconds": 600,
            "allow_resume": True,
            "max_resumes": 2,
            "max_total_resumes": 4,
        }
        self.observation = {
            "identity_matches": True,
            "controller_state": "working",
            "task_state": "RUNNING",
            "progress_key": "evidence-a",
            "phase": "validation",
            "report_ready": False,
            "paused": False,
            "operation": None,
        }

    def check(self, seconds=0):
        return decide(self.observation, self.state, self.now + seconds, self.limits)

    def test_working_without_progress_becomes_stalled(self):
        self.assertEqual(self.check()["status"], "ACTIVE")
        self.assertEqual(self.check(121)["status"], "STALLED")
        self.assertFalse(self.check(122)["resume"])

    def test_idle_gets_bounded_continuation_not_completion(self):
        self.observation["controller_state"] = "idle"
        self.assertEqual(self.check()["status"], "IDLE")
        self.assertTrue(self.check(31)["resume"])
        self.assertFalse(self.check(32)["resume"])
        self.assertTrue(self.check(62)["resume"])
        self.assertEqual(self.check(93)["status"], "ATTENTION")

    def test_no_automatic_resume_without_authority(self):
        self.limits["allow_resume"] = False
        self.observation["controller_state"] = "done"
        self.check()
        result = self.check(31)
        self.assertEqual(result["status"], "ATTENTION")
        self.assertFalse(result["resume"])

    def test_approval_and_unknown_states_never_receive_input(self):
        for controller_state in ["blocked", "unknown", "unexpected"]:
            with self.subTest(controller_state=controller_state):
                self.observation["controller_state"] = controller_state
                self.assertFalse(self.check(200)["resume"])
                self.assertNotEqual(self.check(200)["status"], "ACTIVE")

    def test_replaced_agent_never_receives_input(self):
        self.observation.update(identity_matches=False, controller_state="idle")
        self.assertEqual(self.check()["status"], "UNKNOWN")
        self.assertFalse(self.check(200)["resume"])

    def test_pause_marker_prevents_resumption(self):
        self.observation.update(paused=True, controller_state="idle")
        self.assertEqual(self.check(200)["status"], "PAUSED")
        self.assertFalse(self.check(200)["resume"])

    def test_terminal_task_states_are_respected(self):
        self.observation.update(task_state="BLOCKED", controller_state="idle")
        self.assertEqual(self.check(200)["status"], "BLOCKED")
        self.observation["task_state"] = "COMPLETE"
        self.assertEqual(self.check(200)["status"], "ATTENTION")
        self.observation["report_ready"] = True
        self.assertEqual(self.check(200)["status"], "COMPLETE")

    def test_visible_approval_prevents_terminal_completion_claim(self):
        self.observation.update(
            task_state="COMPLETE", report_ready=True, controller_state="blocked"
        )
        self.assertEqual(self.check()["status"], "BLOCKED")

    def test_deadline_never_prompts_or_claims_work_stopped(self):
        self.observation["controller_state"] = "idle"
        result = self.check(10000)
        self.assertEqual(result["status"], "DEADLINE")
        self.assertFalse(result["resume"])

    def test_real_progress_resets_phase_budget_not_total_budget(self):
        self.observation["controller_state"] = "idle"
        self.check()
        self.check(31)
        self.observation["progress_key"] = "evidence-b"
        self.check(32)
        self.assertEqual(self.state["phase_resumes"], 0)
        self.assertEqual(self.state["total_resumes"], 1)

    def test_restart_preserves_resume_budget(self):
        self.observation["controller_state"] = "idle"
        self.check()
        self.check(31)
        self.state = json.loads(json.dumps(self.state))
        self.check(62)
        self.assertEqual(self.check(93)["status"], "ATTENTION")

    def test_operation_deadline_cannot_be_renewed_in_place(self):
        self.observation["operation"] = {"id": "build-1", "deadline": 1100}
        self.check()
        self.observation["operation"]["deadline"] = 1200
        self.assertEqual(self.check(10)["status"], "ATTENTION")

    def test_operation_timeout_beats_new_output(self):
        self.observation["operation"] = {"id": "build-1", "deadline": 1050}
        self.check()
        self.observation["progress_key"] = "evidence-b"
        self.assertEqual(self.check(51)["status"], "STALLED")

    def test_operation_requires_an_approved_bound(self):
        self.observation["operation"] = {"id": "build-1", "deadline": 2000}
        self.assertEqual(self.check()["status"], "ATTENTION")

    def test_timestamp_and_sequence_churn_are_not_progress(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "result.log").write_text("one completed test\n")
            status = {
                "status": "RUNNING",
                "phase": "tests",
                "progress_seq": 1,
                "evidence": ["result.log"],
            }
            (root / "STATUS.json").write_text(json.dumps(status))
            before = read_progress(root)["progress_key"]
            status.update(progress_seq=2, updated_at="later")
            (root / "STATUS.json").write_text(json.dumps(status))
            self.assertEqual(before, read_progress(root)["progress_key"])
            (root / "result.log").write_text("two completed tests\n")
            self.assertNotEqual(before, read_progress(root)["progress_key"])

    def test_evidence_cannot_escape_task_or_use_supervisor_heartbeat(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "SUPERVISOR.json").write_text("{}")
            for evidence in [
                "../outside",
                "/etc/passwd",
                "SUPERVISOR.json",
                "STATUS.json",
            ]:
                with self.subTest(evidence=evidence):
                    (root / "STATUS.json").write_text(
                        json.dumps(
                            {
                                "status": "RUNNING",
                                "phase": "tests",
                                "progress_seq": 1,
                                "evidence": [evidence],
                            }
                        )
                    )
                    with self.assertRaises(ValueError):
                        read_progress(root)

    def test_cli_rechecks_identity_and_persists_budget_before_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "result.log").write_text("completed first phase\n")
            (root / "STATUS.json").write_text(
                json.dumps(
                    {
                        "status": "RUNNING",
                        "phase": "tests",
                        "progress_seq": 1,
                        "evidence": ["result.log"],
                    }
                )
            )
            identity = {
                "root": str(root),
                "session": "test-session",
                "agent": "test-controller",
                "agent_session": "test-native-session",
            }
            state = {
                "progress_key": read_progress(root)["progress_key"],
                "last_progress_at": time.time() - 120,
                "idle_since": time.time() - 120,
                "phase_resumes": 0,
                "total_resumes": 0,
            }
            (root / "SUPERVISOR.json").write_text(
                json.dumps({"identity": identity, "memory": state})
            )
            agent = {
                "name": "test-controller",
                "agent_status": "idle",
                "agent_session": {"value": "test-native-session"},
            }
            argv = [
                "supervisor.py",
                "--root",
                str(root),
                "--session",
                "test-session",
                "--agent",
                "test-controller",
                "--agent-session",
                "test-native-session",
                "--deadline",
                "2099-01-01T00:00:00Z",
                "--allow-resume",
                "--once",
            ]

            def fail_delivery(*args, **kwargs):
                saved = json.loads((root / "SUPERVISOR.json").read_text())
                self.assertEqual(saved["memory"]["total_resumes"], 1)
                self.assertEqual(
                    args[0][:5],
                    ["herdr", "--session", "test-session", "agent", "prompt"],
                )
                raise subprocess.TimeoutExpired(args[0], 15)

            with (
                patch.object(sys, "argv", argv),
                patch("supervisor.read_agent", return_value=agent) as observed,
                patch("supervisor.subprocess.run", side_effect=fail_delivery),
                redirect_stdout(io.StringIO()),
            ):
                main()
            self.assertEqual(observed.call_count, 2)
            saved = json.loads((root / "SUPERVISOR.json").read_text())
            self.assertEqual(saved["status"], "UNKNOWN")
            self.assertEqual(saved["memory"]["total_resumes"], 1)

    def test_visible_approval_overrides_stale_working_label(self):
        metadata = subprocess.CompletedProcess(
            [],
            0,
            json.dumps(
                {
                    "result": {
                        "agent": {"name": "test-controller", "agent_status": "working"}
                    }
                }
            ),
            "",
        )
        screen = subprocess.CompletedProcess(
            [], 0, "Approve and run\nEnter confirm", ""
        )
        with patch("supervisor.subprocess.run", side_effect=[metadata, screen]):
            self.assertEqual(
                read_agent("test-session", "test-controller")["agent_status"], "blocked"
            )

    def test_cli_never_prompts_a_new_approval_dialog(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "result.log").write_text("completed first phase\n")
            (root / "STATUS.json").write_text(
                json.dumps(
                    {
                        "status": "RUNNING",
                        "phase": "tests",
                        "progress_seq": 1,
                        "evidence": ["result.log"],
                    }
                )
            )
            identity = {
                "root": str(root),
                "session": "test-session",
                "agent": "test-controller",
                "agent_session": "test-native-session",
            }
            state = {
                "progress_key": read_progress(root)["progress_key"],
                "last_progress_at": time.time() - 120,
                "idle_since": time.time() - 120,
                "phase_resumes": 0,
                "total_resumes": 0,
            }
            (root / "SUPERVISOR.json").write_text(
                json.dumps({"identity": identity, "memory": state})
            )
            agent = {
                "name": "test-controller",
                "agent_status": "idle",
                "agent_session": {"value": "test-native-session"},
            }
            argv = [
                "supervisor.py",
                "--root",
                str(root),
                "--session",
                "test-session",
                "--agent",
                "test-controller",
                "--agent-session",
                "test-native-session",
                "--deadline",
                "2099-01-01T00:00:00Z",
                "--allow-resume",
                "--once",
            ]
            with (
                patch.object(sys, "argv", argv),
                patch(
                    "supervisor.read_agent",
                    side_effect=[agent, agent | {"agent_status": "blocked"}],
                ),
                patch("supervisor.subprocess.run") as prompt,
                redirect_stdout(io.StringIO()),
            ):
                main()
            prompt.assert_not_called()
            self.assertEqual(
                json.loads((root / "SUPERVISOR.json").read_text())["status"],
                "OBSERVING",
            )

    def test_launcher_stops_after_three_failed_process_starts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_python = root / "python3"
            fake_python.write_text(
                "#!/bin/sh\nprintf 'started\\n' >> \"$START_RECORD\"\nexit 7\n"
            )
            fake_python.chmod(0o700)
            fake_sleep = root / "sleep"
            fake_sleep.write_text("#!/bin/sh\nexit 0\n")
            fake_sleep.chmod(0o700)
            record = root / "starts"
            environment = os.environ | {
                "PATH": f"{root}:/usr/bin:/bin",
                "START_RECORD": str(record),
            }
            result = subprocess.run(
                ["bash", str(Path(__file__).with_name("run_supervisor.sh"))],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 7)
            self.assertEqual(record.read_text().splitlines(), ["started"] * 3)
            self.assertIn("attempt=3/3", result.stderr)

    def test_launcher_does_not_restart_clean_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake_python = root / "python3"
            fake_python.write_text(
                "#!/bin/sh\nprintf 'started\\n' >> \"$START_RECORD\"\nexit 0\n"
            )
            fake_python.chmod(0o700)
            record = root / "starts"
            environment = os.environ | {
                "PATH": f"{root}:/usr/bin:/bin",
                "START_RECORD": str(record),
            }
            result = subprocess.run(
                ["bash", str(Path(__file__).with_name("run_supervisor.sh"))],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 0)
            self.assertEqual(record.read_text().splitlines(), ["started"])


if __name__ == "__main__":
    unittest.main()
