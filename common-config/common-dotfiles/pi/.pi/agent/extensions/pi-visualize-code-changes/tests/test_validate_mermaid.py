from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "skills/visualize-code-changes/scripts/validate_mermaid.py"
FIXTURES = ROOT / "tests/fixtures"


def validate(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), "--lint-only", "--quiet", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )


class C4ProfileValidationTests(unittest.TestCase):
    def test_accepts_flat_labeled_profile(self) -> None:
        result = validate(FIXTURES / "c4-profile-valid.mmd")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_example_document_passes(self) -> None:
        result = validate(ROOT / "docs/diagrams/c4-dependency-profile.md")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_native_mermaid_c4(self) -> None:
        result = validate(FIXTURES / "c4-native-invalid.mmd")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("native Mermaid C4 syntax", result.stdout)

        with tempfile.TemporaryDirectory() as directory:
            for header in ("C4Container", "C4Component", "C4Dynamic", "C4Deployment"):
                with self.subTest(header=header):
                    path = Path(directory) / f"{header}.mmd"
                    path.write_text(f"{header}\n", encoding="utf-8")
                    result = validate(path)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("native Mermaid C4 syntax", result.stdout)

    def test_rejects_subgraph_boundaries(self) -> None:
        result = validate(FIXTURES / "c4-subgraph-invalid.mmd")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("flat flowcharts", result.stdout)

    def test_requires_relationship_labels(self) -> None:
        result = validate(FIXTURES / "c4-unlabeled-edge-invalid.mmd")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("relationship needs a non-empty", result.stdout)


if __name__ == "__main__":
    unittest.main()
