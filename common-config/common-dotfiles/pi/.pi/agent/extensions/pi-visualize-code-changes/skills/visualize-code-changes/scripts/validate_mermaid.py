#!/usr/bin/env python3
"""Validate every Mermaid block in a Markdown (or .mmd) file.

A diagram that does not parse is worse than no diagram: it renders as a red
error box on GitHub and silently wastes the reader's time. This script is the
cheap way to be certain before you hand the file over.

Two modes, chosen automatically:

  render   Pipes each diagram through `mmdc` (mermaid-cli), which is the real
           Mermaid parser. Authoritative -- if it passes here it renders.
  lint     Fallback when mmdc or a Chrome binary is unavailable. Pure-Python
           heuristics covering the failure modes that actually bite. Catches
           most breakage but cannot promise a clean render.

Usage:
    python3 validate_mermaid.py docs/diagrams/auth.md
    python3 validate_mermaid.py --render-to out/ docs/diagrams/auth.md
    python3 validate_mermaid.py --lint-only docs/diagrams/auth.md

Exit code is 0 when every block is valid, 1 otherwise. Error line numbers are
reported against the source file, not the extracted block, so they are
directly actionable.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Block extraction
# ---------------------------------------------------------------------------

FENCE_RE = re.compile(r"^(?P<indent>[ \t]*)(?P<fence>`{3,}|~{3,})[ \t]*mermaid[ \t]*$", re.I)
COLON_OPEN_RE = re.compile(r"^[ \t]*:::[ \t]*mermaid[ \t]*$", re.I)
COLON_CLOSE_RE = re.compile(r"^[ \t]*:::[ \t]*$")


@dataclass
class Block:
    """One Mermaid diagram lifted out of a source file."""

    index: int
    body: str
    start_line: int  # 1-based source line of the diagram's FIRST content line
    heading: str = ""
    errors: list[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        where = f"line {self.start_line}"
        if self.heading:
            return f"block {self.index} ({self.heading}, {where})"
        return f"block {self.index} ({where})"


def _nearest_heading(lines: list[str], upto: int) -> str:
    for i in range(upto - 1, -1, -1):
        line = lines[i].strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return ""


def extract_blocks(path: Path) -> list[Block]:
    """Pull Mermaid diagrams out of Markdown, or treat a .mmd file as one block."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    if path.suffix.lower() in {".mmd", ".mermaid"}:
        return [Block(index=1, body=text, start_line=1)]

    blocks: list[Block] = []
    i = 0
    n = 0
    while i < len(lines):
        fence_match = FENCE_RE.match(lines[i])
        colon_match = COLON_OPEN_RE.match(lines[i])

        if not (fence_match or colon_match):
            i += 1
            continue

        if fence_match:
            fence = fence_match.group("fence")
            closer = re.compile(rf"^[ \t]*{re.escape(fence[0])}{{{len(fence)},}}[ \t]*$")
        else:
            closer = COLON_CLOSE_RE

        body_start = i + 1
        j = body_start
        while j < len(lines) and not closer.match(lines[j]):
            j += 1

        n += 1
        blocks.append(
            Block(
                index=n,
                body="\n".join(lines[body_start:j]),
                start_line=body_start + 1,  # 1-based
                heading=_nearest_heading(lines, i),
            )
        )
        i = j + 1

    return blocks


# ---------------------------------------------------------------------------
# Renderer discovery
# ---------------------------------------------------------------------------

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_mmdc() -> str | None:
    found = shutil.which("mmdc")
    if found:
        return found
    # nvm installs often sit outside a non-login shell's PATH.
    for base in (Path.home() / ".nvm/versions/node").glob("*/bin/mmdc"):
        if os.access(base, os.X_OK):
            return str(base)
    return None


def mmdc_env(mmdc: str) -> dict:
    """Environment for running mmdc.

    `mmdc` is a Node script whose shebang resolves `node` through PATH. When we
    discover it inside an nvm directory that PATH doesn't contain, node isn't
    reachable either, and the script dies with "env: node: No such file or
    directory". Putting its own bin directory on PATH fixes that.
    """
    env = os.environ.copy()
    bindir = str(Path(mmdc).parent)
    if bindir not in env.get("PATH", "").split(os.pathsep):
        env["PATH"] = bindir + os.pathsep + env.get("PATH", "")
    return env


# Signatures meaning "the renderer could not start", as opposed to "your
# diagram is wrong". Confusing the two is the worst thing this script can do:
# reporting a valid diagram as broken sends the caller off fixing nothing.
INFRA_ERROR_MARKERS = (
    "env: node", "node: No such file", "command not found",
    "Could not find chrome", "Failed to launch", "spawn ",
    "cannot open display", "ENOENT",
)


def looks_like_infra_failure(stderr: str) -> bool:
    if "Parse error" in stderr or "Syntax error" in stderr:
        return False
    return any(m.lower() in stderr.lower() for m in INFRA_ERROR_MARKERS)


PROBE = 'flowchart TD\n  A["probe"] --> B["ok"]\n'


def renderer_works(mmdc: str, pptr_cfg: Path | None) -> tuple[bool, str]:
    """Render a trivial known-good diagram to prove the toolchain runs."""
    with tempfile.TemporaryDirectory() as td:
        src, dst = Path(td) / "probe.mmd", Path(td) / "probe.svg"
        src.write_text(PROBE, encoding="utf-8")
        cmd = [mmdc, "-i", str(src), "-o", str(dst), "-q"]
        if pptr_cfg:
            cmd += ["-p", str(pptr_cfg)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  timeout=180, env=mmdc_env(mmdc))
        except (subprocess.TimeoutExpired, OSError) as exc:
            return False, str(exc)
        if proc.returncode == 0 and dst.exists():
            return True, ""
        return False, (proc.stderr or proc.stdout).strip().splitlines()[0][:200] if (proc.stderr or proc.stdout) else "unknown failure"


def puppeteer_has_browser() -> bool:
    """True when Puppeteer already downloaded its own Chrome; no config needed."""
    cache = Path(os.environ.get("PUPPETEER_CACHE_DIR", Path.home() / ".cache/puppeteer"))
    if not cache.is_dir():
        return False
    return any(cache.glob("chrome*/**/*"))


def find_chrome() -> str | None:
    for env in ("PUPPETEER_EXECUTABLE_PATH", "CHROME_PATH"):
        val = os.environ.get(env)
        if val and Path(val).exists():
            return val
    for cand in CHROME_CANDIDATES:
        if Path(cand).exists():
            return cand
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        found = shutil.which(name)
        if found:
            return found
    return None


# ---------------------------------------------------------------------------
# Render-based validation (authoritative)
# ---------------------------------------------------------------------------

PARSE_LINE_RE = re.compile(r"(Parse error on line )(\d+)", re.I)


def _clean_error(stderr: str, block: Block) -> str:
    """Trim mmdc's stack trace to the useful part, remapping line numbers."""
    keep: list[str] = []
    for line in stderr.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("at ") or "node_modules" in s or s.startswith("file://"):
            continue
        if "Generating single mermaid chart" in s:
            continue
        keep.append(s)
        if len(keep) >= 8:
            break
    msg = "\n".join(keep) if keep else stderr.strip()[:600]

    # Mermaid reports lines relative to the block; translate to the real file.
    def shift(m: re.Match) -> str:
        return f"{m.group(1)}{int(m.group(2)) + block.start_line - 1}"

    return PARSE_LINE_RE.sub(shift, msg)


def render_block(
    mmdc: str, block: Block, pptr_cfg: Path | None, out_path: Path
) -> tuple[bool, str]:
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "d.mmd"
        src.write_text(block.body, encoding="utf-8")
        cmd = [mmdc, "-i", str(src), "-o", str(out_path), "-q"]
        if pptr_cfg:
            cmd += ["-p", str(pptr_cfg)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  timeout=120, env=mmdc_env(mmdc))
        except subprocess.TimeoutExpired:
            return False, "mmdc timed out after 120s"
        except OSError as exc:
            return False, f"could not run mmdc: {exc}"

    if proc.returncode == 0 and out_path.exists():
        return True, ""
    return False, _clean_error(proc.stderr or proc.stdout, block)


# ---------------------------------------------------------------------------
# Heuristic linting (fallback)
# ---------------------------------------------------------------------------

VALID_HEADERS = (
    "flowchart", "graph", "sequencediagram", "classdiagram", "statediagram",
    "statediagram-v2", "erdiagram", "journey", "gantt", "pie", "quadrantchart",
    "requirementdiagram", "gitgraph", "mindmap", "timeline", "zenuml",
    "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "architecture-beta",
    "c4context", "c4container", "c4component", "c4dynamic", "kanban", "radar-beta",
    "treemap-beta", "flowchart-elk",
)

NATIVE_C4_HEADERS = {
    "c4context", "c4container", "c4component", "c4dynamic",
    "c4deployment",
}
C4_PREFIX_RE = re.compile(r"\b(?:Person|System|Container|Component|External):")
FLOWCHART_DIRECTIONS = {"tb", "td", "bt", "lr", "rl"}

# Characters that terminate a label early unless the label is quoted.
RISKY_IN_LABEL = set("()[]{}<>|;")

SHAPE_OPENERS = [
    ("[[", "]]"), ("[(", ")]"), ("[/", "/]"), ("[\\", "\\]"),
    ("([", "])"), ("((", "))"), ("{{", "}}"), ("(-", "-)"),
    ("[", "]"), ("(", ")"), ("{", "}"),
]

# Node ids start with a letter/underscore. Crucially the id must NOT be allowed
# to begin with '-', or the '--' of an arrow gets read as an id.
NODE_DECL_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])(?P<id>[A-Za-z_][A-Za-z0-9_.-]*)"
    r"(?P<open>\[\[|\[\(|\[/|\[\\|\(\[|\(\(|\{\{|\[|\(|\{)"
)

# Every arrow/link form Mermaid accepts, longest first.
ARROW_RE = re.compile(
    r"(<-->|<==>|-\.->|-\.-|={2,}>|={3,}|-{2,}>|-{3,}|--[xo]|==[xo]|~~~)"
)


def _blank_edge_syntax(s: str) -> str:
    """Remove arrows and |edge labels| so only node declarations remain.

    Without this, `A --> B["x"]` reads the `--` as a node id and the `>` as a
    shape opener, producing nonsense diagnostics.
    """
    s = ARROW_RE.sub(lambda m: " " * len(m.group(0)), s)
    s = re.sub(r"\|[^|]*\|", lambda m: " " * len(m.group(0)), s)
    return s


def _strip_quoted(s: str) -> str:
    """Blank out quoted spans so their contents don't trip other checks."""
    out, in_q, i = [], False, 0
    while i < len(s):
        c = s[i]
        if c == '"':
            in_q = not in_q
            out.append('"')
        else:
            out.append(" " if in_q else c)
        i += 1
    return "".join(out)


def lint_block(block: Block) -> list[str]:
    problems: list[str] = []
    raw_lines = block.body.splitlines()

    content = [
        (n, ln) for n, ln in enumerate(raw_lines, start=1)
        if ln.strip() and not ln.strip().startswith("%%")
    ]
    if not content:
        return ["empty diagram (no content lines)"]

    def at(n: int) -> int:
        return block.start_line + n - 1

    # 1. Header must name a real diagram type.
    first_no, first = content[0]
    head = first.strip().split()[0].lower().rstrip(":")
    if head not in VALID_HEADERS:
        problems.append(
            f"line {at(first_no)}: '{first.strip()[:40]}' does not start with a known "
            f"diagram type (flowchart, sequenceDiagram, stateDiagram-v2, ...)"
        )

    is_flowchart = head in ("flowchart", "graph", "flowchart-elk")

    if head in NATIVE_C4_HEADERS:
        problems.append(
            f"line {at(first_no)}: native Mermaid C4 syntax is outside the portable "
            "C4 profile -- use an ordinary flat flowchart"
        )

    is_c4_profile = is_flowchart and any(C4_PREFIX_RE.search(ln) for _, ln in content)

    if is_c4_profile:
        header_parts = first.strip().split()
        if len(header_parts) < 2 or header_parts[1].lower() not in FLOWCHART_DIRECTIONS:
            problems.append(
                f"line {at(first_no)}: the C4 profile requires one global flowchart "
                "direction (TB, TD, BT, LR, or RL)"
            )

        for n, ln in content[1:]:
            low = ln.strip().lower()
            if low.startswith("subgraph"):
                problems.append(
                    f"line {at(n)}: the C4 profile uses flat flowcharts, not subgraph "
                    "boundaries -- encode ownership in node labels"
                )
                break
            if low.startswith("direction "):
                problems.append(
                    f"line {at(n)}: the C4 profile allows only the global direction "
                    "from the flowchart header"
                )
                break

        for n, ln in content[1:]:
            low = ln.strip().lower()
            if low.startswith(("classdef", "class ", "style ", "linkstyle", "click")):
                continue
            if ARROW_RE.search(_strip_quoted(ln)) and not re.search(r"\|[^|]*\S[^|]*\|", ln):
                problems.append(
                    f"line {at(n)}: every C4 profile relationship needs a non-empty "
                    "intent, protocol, or data-flow label"
                )

    # 2. subgraph / end must balance.
    depth = 0
    for n, ln in content:
        s = ln.strip()
        low = s.lower()
        if low.startswith("subgraph"):
            depth += 1
        elif low == "end":
            depth -= 1
            if depth < 0:
                problems.append(f"line {at(n)}: 'end' without a matching 'subgraph'")
                depth = 0
    if depth > 0:
        problems.append(f"{depth} unclosed 'subgraph' block(s) -- each needs a matching 'end'")

    # 3. Unquoted risky characters inside node labels (the #1 real-world break).
    if is_flowchart:
        for n, ln in content:
            s = ln.strip()
            if s.lower().startswith(("classdef", "class ", "style ", "linkstyle", "subgraph", "click")):
                continue
            s = _blank_edge_syntax(s)
            for m in NODE_DECL_RE.finditer(s):
                opener = m.group("open")
                closer = next((c for o, c in SHAPE_OPENERS if o == opener), None)
                if closer is None:
                    continue
                inner_start = m.end()
                depth_b, k, in_q, end = 1, inner_start, False, -1
                while k < len(s):
                    if s[k] == '"':
                        in_q = not in_q
                        k += 1
                        continue
                    if not in_q:
                        if s.startswith(closer, k):
                            depth_b -= 1
                            if depth_b == 0:
                                end = k
                                break
                            k += len(closer)
                            continue
                        if s.startswith(opener, k):
                            depth_b += 1
                            k += len(opener)
                            continue
                    k += 1
                if end == -1:
                    continue
                label = s[inner_start:end].strip()
                if not label or (label.startswith('"') and label.endswith('"')):
                    continue
                bad = sorted(RISKY_IN_LABEL & set(label))
                if bad:
                    problems.append(
                        f"line {at(n)}: label {label[:38]!r} contains {''.join(bad)} "
                        f'-- wrap it in double quotes: {m.group("id")}{opener}"{label}"{closer}'
                    )

    # 4. Every :::class / class stmt should point at a defined classDef.
    defined = set()
    for _, ln in content:
        m = re.match(r"\s*classDef\s+([A-Za-z0-9_,-]+)", ln)
        if m:
            defined.update(p.strip() for p in m.group(1).split(","))
    used: dict[str, int] = {}
    for n, ln in content:
        for m in re.finditer(r":::([A-Za-z0-9_]+)", ln):
            used.setdefault(m.group(1), n)
        m = re.match(r"\s*class\s+[A-Za-z0-9_,\s.-]+\s+([A-Za-z0-9_]+)\s*;?\s*$", ln)
        if m:
            used.setdefault(m.group(1), n)
    for name, n in used.items():
        if name not in defined and name != "default":
            problems.append(
                f"line {at(n)}: style class '{name}' is used but never defined "
                f"-- add a `classDef {name} ...` line"
            )

    # 5. linkStyle indices must exist.
    arrow_re = re.compile(r"(-{2,3}>|-{3,}|-\.->|-\.-|={2,}>|={3,}|--[xo]|<-->|<==>)")
    edges = sum(len(arrow_re.findall(_strip_quoted(ln))) for _, ln in content
                if not ln.strip().lower().startswith(("classdef", "linkstyle", "style ")))
    for n, ln in content:
        m = re.match(r"\s*linkStyle\s+([\d,\s]+)", ln)
        if m and edges:
            for part in re.findall(r"\d+", m.group(1)):
                if int(part) >= edges:
                    problems.append(
                        f"line {at(n)}: linkStyle {part} but the diagram only has "
                        f"{edges} link(s) (indices are 0-based, in declaration order)"
                    )

    # 6. `end` as a bare node id breaks the flowchart parser.
    if is_flowchart:
        for n, ln in content:
            if re.search(r"(^|[\s>-])end([\s\[({]|$)", ln) and ln.strip().lower() != "end":
                problems.append(
                    f"line {at(n)}: 'end' is reserved -- rename the node "
                    f"(e.g. 'endNode') or capitalise it"
                )
                break

    return problems


def semantic_lint_block(block: Block) -> list[str]:
    """Checks a successful Mermaid render cannot prove on its own."""
    return [
        problem for problem in lint_block(block)
        if "style class" in problem
        or "linkStyle" in problem
        or "C4 profile" in problem
    ]


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Validate Mermaid blocks in Markdown/.mmd files.")
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--lint-only", action="store_true",
                    help="Skip rendering; use heuristics only (fast, no browser).")
    ap.add_argument("--render-to", type=Path, metavar="DIR",
                    help="Also keep the rendered SVGs in DIR.")
    ap.add_argument("--quiet", action="store_true", help="Only print failures.")
    args = ap.parse_args()

    mmdc = None if args.lint_only else find_mmdc()
    pptr_cfg_file = None
    tmpdir = tempfile.mkdtemp(prefix="mermaid-validate-")
    mode = "lint"

    fallback_reason = ""
    if mmdc:
        if not puppeteer_has_browser():
            chrome = find_chrome()
            if chrome:
                cfg = Path(tmpdir) / "pptr.json"
                cfg.write_text(json.dumps({
                    "executablePath": chrome,
                    "headless": "new",
                    "args": ["--no-sandbox", "--disable-setuid-sandbox"],
                }), encoding="utf-8")
                pptr_cfg_file = cfg
            else:
                fallback_reason = "no Chrome/Chromium found"

        if not fallback_reason:
            # Prove the toolchain actually runs before trusting its verdicts.
            # Without this probe, an unlaunchable mmdc reports every diagram as
            # a parse failure and sends the caller chasing imaginary bugs.
            ok, why = renderer_works(mmdc, pptr_cfg_file)
            mode = "render" if ok else "lint"
            if not ok:
                fallback_reason = f"mmdc could not run ({why})"
    elif not args.lint_only:
        fallback_reason = "mmdc not found"

    if not args.quiet:
        if mode == "render":
            print("validating with mmdc (authoritative render check)\n")
        elif args.lint_only:
            print("lint-only mode (heuristics)\n")
        else:
            print(f"NOTE: {fallback_reason} -- falling back to heuristic lint.\n"
                  f"      Diagrams below are checked by rules, not a real render.\n"
                  f"      For a guaranteed-renders check: npm i -g @mermaid-js/mermaid-cli\n")

    if args.render_to:
        args.render_to.mkdir(parents=True, exist_ok=True)

    total = failed = 0
    for path in args.files:
        if not path.exists():
            print(f"FAIL {path}: file not found")
            failed += 1
            total += 1
            continue

        blocks = extract_blocks(path)
        if not blocks:
            print(f"WARN {path}: no mermaid blocks found")
            continue

        print(f"{path}  ({len(blocks)} diagram{'s' if len(blocks) != 1 else ''})")
        for b in blocks:
            total += 1
            if mode == "render" and mmdc:
                dest = ((args.render_to / f"{path.stem}-{b.index}.svg")
                        if args.render_to else Path(tmpdir) / f"{path.stem}-{b.index}.svg")
                ok, err = render_block(mmdc, b, pptr_cfg_file, dest)
                b.errors = [err] if err else []
                # A clean render still benefits from the semantic checks
                # (undefined classes and unsupported C4 profiles still render).
                if ok:
                    b.errors = semantic_lint_block(b)
                    ok = not b.errors
            else:
                b.errors = lint_block(b)
                ok = not b.errors

            if ok:
                if not args.quiet:
                    print(f"  ok   {b.label}")
            else:
                failed += 1
                print(f"  FAIL {b.label}")
                for e in b.errors:
                    for ln in e.splitlines():
                        print(f"         {ln}")
        print()

    if not (args.render_to and mode == "render"):
        shutil.rmtree(tmpdir, ignore_errors=True)

    if failed:
        print(f"{failed} of {total} diagram(s) failed validation.")
        return 1
    print(f"All {total} diagram(s) valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
