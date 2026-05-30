#!/usr/bin/env python3
"""Guard against destructive infra commands in bypass permissions mode.

Ported from ~/.pi/agent/extensions/infra-command-guard/index.ts.

Exit 0 = allow, Exit 2 = block (Claude reads stderr as feedback).

One-time approval flow:
  1. Hook blocks a command
  2. User says "go ahead"
  3. Claude writes the exact command to ~/.claude/approval-cmd
  4. Claude retries; this hook consumes the approval and allows the call
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Iterable

APPROVAL_FILE = os.path.expanduser("~/.claude/approval-cmd")

INFRA_PATTERN_GLOBAL = re.compile(r"\b(?:kubectl|terraform)\b", re.IGNORECASE)

SHELL_RUNNERS = {
    "sh", "bash", "zsh", "dash", "fish",
    "xargs",
    "python", "python3", "python3.11", "python3.12",
    "node", "perl", "ruby",
}

SAFE_KUBECTL_TOP_LEVEL = {
    "api-resources", "api-versions", "describe", "diff", "explain",
    "get", "log", "logs", "port-forward", "top", "version", "wait",
}

SAFE_KUBECTL_NESTED = {
    "auth": {"can-i", "whoami"},
    "rollout": {"history", "status"},
}

SAFE_TERRAFORM_TOP_LEVEL = {
    "fmt", "graph", "init", "plan", "providers",
    "show", "validate", "version",
}

SAFE_TERRAFORM_NESTED = {
    "state": {"list", "show"},
    "workspace": {"list", "select", "show"},
}

KUBECTL_LEADING_BOOLEAN_OPTIONS = {
    "-A", "--all-namespaces", "--disable-compression",
    "--insecure-skip-tls-verify", "--match-server-version",
    "--warnings-as-errors",
}

KUBECTL_LEADING_VALUE_OPTIONS = {
    "-n", "--namespace", "-s", "--server", "--as", "--as-group",
    "--cache-dir", "--certificate-authority", "--client-certificate",
    "--client-key", "--cluster", "--context", "--kubeconfig",
    "--password", "--profile", "--profile-output", "--request-timeout",
    "--tls-server-name", "--token", "--user", "--username", "-v",
}

TERRAFORM_LEADING_BOOLEAN_OPTIONS = {
    "-help", "--help", "-version", "--version", "-no-color",
}
TERRAFORM_LEADING_VALUE_OPTIONS = {"-chdir"}

ENV_BOOLEAN_OPTIONS = {"-0", "-i", "--ignore-environment", "--null"}
ENV_VALUE_OPTIONS = {"-C", "-S", "-u", "--chdir", "--split-string", "--unset"}

SUDO_BOOLEAN_OPTIONS = {
    "-A", "-E", "-H", "-K", "-k", "-n", "-S", "-V",
    "-b", "-l", "-s", "-v",
    "--askpass", "--edit", "--list", "--non-interactive",
    "--preserve-env", "--remove-timestamp", "--reset-timestamp",
    "--shell", "--stdin", "--validate", "--version",
}

SUDO_VALUE_OPTIONS = {
    "-C", "-D", "-R", "-T", "-U",
    "-g", "-h", "-p", "-r", "-t", "-u",
    "--chdir", "--close-from", "--group", "--host",
    "--other-user", "--prompt", "--role", "--type", "--user",
}

TIME_BOOLEAN_OPTIONS = {"-p", "-v", "--portability", "--verbose"}
TIME_VALUE_OPTIONS = {"-f", "-o", "--format", "--output"}

SHELL_CONTROL_KEYWORDS = {
    "!", "if", "then", "elif", "else", "fi",
    "for", "while", "until", "do", "done",
    "case", "esac", "select", "function",
}

SHELL_EXECUTION_BUILTINS = {".", "source", "eval", "exec"}


class ParseError(Exception):
    pass


def strip_path(raw: str) -> str:
    normalized = str(raw or "")
    parts = re.split(r"[\\/]", normalized)
    return (parts[-1] if parts and parts[-1] else normalized).lower()


def is_assignment_word(word: str) -> bool:
    return bool(re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", word))


def is_secret_like_kubectl_target(word: str) -> bool:
    normalized = str(word or "").lower()
    for piece in normalized.split(","):
        piece = piece.strip()
        if (
            piece == "secret"
            or piece == "secrets"
            or piece.startswith("secret/")
            or piece.startswith("secrets/")
        ):
            return True
    return False


def has_raw_kubectl_flag(words: Iterable[str]) -> bool:
    return any(w == "--raw" or w.startswith("--raw=") for w in words)


def normalize_for_infra_scan(text: str) -> str:
    return re.sub(r"""["'\\]""", "", str(text or ""))


def contains_infra_text(text: str) -> bool:
    return bool(INFRA_PATTERN_GLOBAL.search(normalize_for_infra_scan(text)))


def is_kubectl_port_forward_only_command(command: str) -> bool:
    normalized = normalize_for_infra_scan(command).lower()
    kubectl_mentions = re.findall(r"\bkubectl\b(?=[\s;|&()<>]|$)", normalized)
    if not kubectl_mentions:
        return False
    if re.search(r"\bterraform\b", normalized):
        return False
    pf_pattern = re.compile(
        r"\bkubectl\b(?=[\s;|&()<>]|$)(?:(?!&&|\|\||[;&|\n]).)*\bport-forward\b"
    )
    pf_mentions = pf_pattern.findall(normalized)
    return len(pf_mentions) == len(kubectl_mentions)


def matches_leading_option(option: str, known: set[str]) -> bool:
    if option in known:
        return True
    if "=" in option:
        return option.split("=", 1)[0] in known
    return False


def classify_leading_option(option: str, booleans: set[str], values: set[str]) -> str:
    if matches_leading_option(option, booleans):
        return "boolean"
    if matches_leading_option(option, values):
        return "value"
    return "unknown"


def parse_simple_commands(command: str) -> list[tuple[list[str], str]]:
    segments: list[tuple[list[str], str]] = []
    words: list[str] = []
    bare_words: list[str] = []
    current = ""
    current_bare = ""
    in_single = False
    in_double = False
    escape_next = False
    skip_next_word = False
    in_comment = False

    def add(ch: str, quoted: bool):
        nonlocal current, current_bare
        current += ch
        if not quoted:
            current_bare += ch

    def push_word():
        nonlocal current, current_bare, skip_next_word
        if not current:
            current_bare = ""
            return
        if skip_next_word:
            skip_next_word = False
            current = ""
            current_bare = ""
            return
        words.append(current)
        bare_words.append(current_bare)
        current = ""
        current_bare = ""

    def push_segment():
        nonlocal words, bare_words
        push_word()
        if words:
            segments.append((words, " ".join(bare_words)))
            words = []
            bare_words = []

    i = 0
    length = len(command)
    while i < length:
        ch = command[i]
        nxt = command[i + 1] if i + 1 < length else ""

        if in_comment:
            if ch == "\n":
                in_comment = False
                if skip_next_word:
                    raise ParseError("Invalid redirection before comment")
                push_segment()
            i += 1
            continue

        if escape_next:
            add(ch, in_double)
            escape_next = False
            i += 1
            continue

        if in_single:
            if ch == "'":
                in_single = False
            else:
                add(ch, True)
            i += 1
            continue

        if in_double:
            if ch == '"':
                in_double = False
                i += 1
                continue
            if ch == "`":
                raise ParseError("Backtick command substitution is not supported")
            if ch == "$":
                if nxt == "(":
                    raise ParseError("Command substitution is not supported")
                add(ch, True)
                i += 1
                continue
            if ch == "\\":
                escape_next = True
                i += 1
                continue
            add(ch, True)
            i += 1
            continue

        if ch == "#" and not current:
            in_comment = True
            i += 1
            continue

        if ch == "\\":
            escape_next = True
            i += 1
            continue

        if ch == "'":
            in_single = True
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        if ch == "`":
            raise ParseError("Backtick command substitution is not supported")
        if ch == "$" and nxt == "(":
            raise ParseError("Command substitution is not supported")

        if ch in (" ", "\t", "\r"):
            push_word()
            i += 1
            continue

        if ch in ("\n", ";"):
            if skip_next_word:
                raise ParseError("Invalid redirection before command separator")
            push_segment()
            i += 1
            continue

        if ch == "&":
            if nxt == "&":
                if skip_next_word:
                    raise ParseError("Invalid redirection before command separator")
                push_segment()
                i += 2
                continue
            raise ParseError("Background execution is not supported by the infra guard parser")

        if ch == "|":
            if skip_next_word:
                raise ParseError("Invalid redirection before command separator")
            push_segment()
            if nxt in ("|", "&"):
                i += 2
            else:
                i += 1
            continue

        if ch in ("<", ">"):
            if nxt == "(":
                raise ParseError("Process substitution is not supported")
            if ch == "<" and nxt == "<":
                raise ParseError("Heredoc syntax is not supported")
            if re.fullmatch(r"\d+", current):
                current = ""
                current_bare = ""
            else:
                push_word()
            if nxt in (">", "&", "|"):
                i += 2
            else:
                i += 1
            skip_next_word = True
            continue

        if ch in ("(", ")", "{", "}"):
            raise ParseError(f"Unsupported shell grouping token: {ch}")

        add(ch, False)
        i += 1

    if escape_next:
        raise ParseError("Trailing escape is not supported")
    if in_single or in_double:
        raise ParseError("Unterminated quote")
    if skip_next_word and not current:
        raise ParseError("Redirection without a target is not supported")

    push_segment()
    return segments


def consume_known_options(
    words: list[str], start: int, booleans: set[str], values: set[str]
) -> int:
    index = start
    while index < len(words):
        word = words[index]
        if word == "--":
            return index + 1
        if not word.startswith("-"):
            break
        classification = classify_leading_option(word, booleans, values)
        if classification == "unknown":
            raise ParseError(f"Unsupported wrapper option: {word}")
        if classification == "boolean":
            index += 1
            continue
        if "=" in word:
            index += 1
            continue
        if index + 1 >= len(words):
            raise ParseError(f"Missing value for option: {word}")
        index += 2
    return index


class Invocation:
    def __init__(self, executable: str | None, args: list[str], words: list[str], wrappers: list[str]):
        self.executable = executable
        self.args = args
        self.words = words
        self.wrappers = wrappers


def extract_invocation(words: list[str]) -> Invocation:
    index = 0
    wrappers: list[str] = []

    while index < len(words):
        while index < len(words) and is_assignment_word(words[index]):
            index += 1
        if index >= len(words):
            return Invocation(None, [], [], wrappers)

        raw_exec = words[index]
        executable = strip_path(raw_exec)

        if executable == "env":
            wrappers.append(executable)
            index += 1
            index = consume_known_options(words, index, ENV_BOOLEAN_OPTIONS, ENV_VALUE_OPTIONS)
            while index < len(words) and is_assignment_word(words[index]):
                index += 1
            continue

        if executable == "sudo":
            wrappers.append(executable)
            index += 1
            index = consume_known_options(words, index, SUDO_BOOLEAN_OPTIONS, SUDO_VALUE_OPTIONS)
            while index < len(words) and is_assignment_word(words[index]):
                index += 1
            continue

        if executable == "time":
            wrappers.append(executable)
            index += 1
            index = consume_known_options(words, index, TIME_BOOLEAN_OPTIONS, TIME_VALUE_OPTIONS)
            continue

        if executable == "stdbuf":
            wrappers.append(executable)
            index += 1
            while index < len(words) and words[index].startswith("-"):
                option = words[index]
                if not (option.startswith("-i") or option.startswith("-o") or option.startswith("-e")):
                    raise ParseError(f"Unsupported stdbuf option: {option}")
                index += 1
            continue

        if executable == "nice":
            wrappers.append(executable)
            index += 1
            if index < len(words) and words[index].startswith("-"):
                option = words[index]
                if option in ("-n", "--adjustment"):
                    if index + 1 >= len(words):
                        raise ParseError(f"Missing value for option: {option}")
                    index += 2
                elif re.fullmatch(r"-\d+", option):
                    index += 1
                else:
                    raise ParseError(f"Unsupported nice option: {option}")
            continue

        if executable in ("command", "builtin"):
            wrappers.append(executable)
            index += 1
            while index < len(words) and words[index] == "--":
                index += 1
            continue

        if executable in ("nohup", "chronic", "setsid"):
            wrappers.append(executable)
            index += 1
            continue

        return Invocation(executable, words[index + 1:], words[index:], wrappers)

    return Invocation(None, [], [], wrappers)


def collect_positionals(
    words: list[str],
    *,
    max_positionals: int,
    leading_boolean_options: set[str],
    leading_value_options: set[str],
) -> list[str]:
    positionals: list[str] = []
    index = 0

    while index < len(words) and len(positionals) < max_positionals:
        word = words[index]
        if word == "--":
            index += 1
            while index < len(words) and len(positionals) < max_positionals:
                positionals.append(words[index])
                index += 1
            break

        if word.startswith("-"):
            if not positionals:
                classification = classify_leading_option(
                    word, leading_boolean_options, leading_value_options
                )
                if classification == "unknown":
                    raise ParseError(f"Unsupported leading option: {word}")
                if classification == "boolean":
                    index += 1
                    continue
                if "=" in word:
                    index += 1
                    continue
                if index + 1 >= len(words):
                    raise ParseError(f"Missing value for option: {word}")
                index += 2
                continue

            if "=" in word:
                index += 1
                continue

            if index + 1 < len(words) and not words[index + 1].startswith("-"):
                index += 2
            else:
                index += 1
            continue

        positionals.append(word)
        index += 1

    return positionals


class Decision:
    def __init__(self, allow: bool, reason: str | None = None):
        self.allow = allow
        self.reason = reason


def _allow() -> Decision:
    return Decision(True)


def _block(reason: str) -> Decision:
    return Decision(False, reason)


def evaluate_kubectl(inv: Invocation) -> Decision:
    if has_raw_kubectl_flag(inv.args):
        return _block("kubectl --raw is not on the low-risk allowlist")

    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=3,
            leading_boolean_options=KUBECTL_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=KUBECTL_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _block(f"kubectl uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()
    target = positionals[1] if len(positionals) > 1 else ""

    if not top_level:
        return _block("kubectl command could not be classified safely")

    if top_level in ("get", "describe"):
        if is_secret_like_kubectl_target(target):
            return _block(f"kubectl {top_level} against secrets may expose secret material")
        return _allow()

    if top_level == "auth":
        if nested in SAFE_KUBECTL_NESTED["auth"]:
            return _allow()
        return _block(f"kubectl auth {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "rollout":
        if nested in SAFE_KUBECTL_NESTED["rollout"]:
            return _allow()
        return _block(f"kubectl rollout {nested or '<unknown>'} may change workload state")

    if top_level == "cluster-info" and nested == "dump":
        return _block("kubectl cluster-info dump can expose sensitive cluster state")

    if top_level in SAFE_KUBECTL_TOP_LEVEL:
        return _allow()

    return _block(f"kubectl {top_level} is not on the low-risk allowlist")


def evaluate_terraform(inv: Invocation) -> Decision:
    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=2,
            leading_boolean_options=TERRAFORM_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=TERRAFORM_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _block(f"terraform uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()

    if not top_level:
        if any(a in ("-version", "--version") for a in inv.args):
            return _allow()
        return _block("terraform command could not be classified safely")

    if top_level == "state":
        if nested in SAFE_TERRAFORM_NESTED["state"]:
            return _allow()
        return _block(f"terraform state {nested or '<unknown>'} can mutate or rewrite state")

    if top_level == "workspace":
        if nested in SAFE_TERRAFORM_NESTED["workspace"]:
            return _allow()
        return _block(f"terraform workspace {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "output":
        return _block("terraform output may expose sensitive values")

    if top_level in SAFE_TERRAFORM_TOP_LEVEL:
        return _allow()

    return _block(f"terraform {top_level} is not on the low-risk allowlist")


def evaluate_command(command: str) -> Decision:
    if not contains_infra_text(command):
        return _allow()
    if is_kubectl_port_forward_only_command(command):
        return _allow()

    try:
        segments = parse_simple_commands(command)
    except ParseError as exc:
        return _block(
            f"This command uses shell syntax the infra guard cannot classify safely ({exc})"
        )

    for segment_words, segment_bare in segments:
        try:
            inv = extract_invocation(segment_words)
        except ParseError as exc:
            return _block(
                f"This command uses a wrapper the infra guard cannot classify safely ({exc})"
            )

        if not inv.executable:
            continue

        if inv.executable in SHELL_CONTROL_KEYWORDS:
            return _block(
                f"This command uses shell control flow ({inv.executable}), which requires manual approval"
            )

        if inv.executable in SHELL_EXECUTION_BUILTINS:
            return _block(
                f"This command uses shell execution syntax ({inv.executable}), which requires manual approval"
            )

        segment_text = " ".join(segment_words)
        segment_mentions_infra = contains_infra_text(segment_text)

        if inv.executable in SHELL_RUNNERS and segment_mentions_infra:
            return _block(
                f"This command delegates infra execution through {inv.executable}, which requires manual approval"
            )

        if inv.executable == "kubectl":
            decision = evaluate_kubectl(inv)
            if not decision.allow:
                return decision
            continue

        if inv.executable == "terraform":
            decision = evaluate_terraform(inv)
            if not decision.allow:
                return decision
            continue

        if contains_infra_text(segment_bare):
            return _block(
                f"This command invokes infra tooling through {inv.executable}, which requires manual approval"
            )

    return _allow()


def check_rm(command: str) -> Decision:
    if re.search(r"(^|[|;\n\r]|&&)\s*rm\s", command):
        return _block("rm command needs confirmation")
    return _allow()


def consume_one_time_approval(command: str) -> bool:
    try:
        with open(APPROVAL_FILE) as f:
            approved = f.read().rstrip("\n")
    except FileNotFoundError:
        return False
    if approved == command:
        try:
            os.remove(APPROVAL_FILE)
        except OSError:
            pass
        return True
    return False


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not isinstance(command, str) or not command:
        return 0

    if consume_one_time_approval(command):
        return 0

    rm_decision = check_rm(command)
    if not rm_decision.allow:
        emit_block(rm_decision.reason or "", command)
        return 2

    decision = evaluate_command(command)
    if decision.allow:
        return 0

    emit_block(decision.reason or "blocked", command)
    return 2


def emit_block(reason: str, command: str) -> None:
    lines = [
        f"BLOCKED — {reason}",
        f"Command: {command}",
        "",
        "Before retrying, you MUST present this through the AskUserQuestion tool",
        "(NOT a plain chat message). Follow these steps exactly:",
        "",
        "  1. Draft a plain-language explanation covering:",
        "       • what the command does and what each flag means",
        f"       • why the guard flagged it ({reason})",
        "       • the concrete blast radius (what changes / what data is exposed)",
        "",
        "  2. Call AskUserQuestion with ONE question:",
        '       • question:    "Approve running this command?"',
        '       • header:      "Approve cmd"',
        "       • multiSelect: false",
        "       • options:     exactly two —",
        '           - label: "Approve and run"   description: "Run the exact command as-is"',
        '           - label: "Cancel"            description: "Do not run the command"',
        "       • Put the full explanation in the `preview` field of the",
        '         "Approve and run" option. Markdown is rendered in a side panel,',
        "         so include the command in a fenced code block plus the risk summary.",
        "",
        '  3. If the user selects "Approve and run", write the EXACT command',
        f"     (byte-for-byte, no edits) to {APPROVAL_FILE} and retry the bash tool.",
        '  4. If the user selects "Cancel" or anything else, stop — do not retry.',
        "  5. Do NOT explain in chat first; the explanation must live inside the",
        "     AskUserQuestion preview so the user can review and approve in one UI.",
        "  6. Do NOT modify the command between explanation and retry.",
    ]
    for line in lines:
        print(line, file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
