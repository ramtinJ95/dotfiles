#!/usr/bin/env python3
"""Guard against destructive infra and local-file commands in bypass permissions mode.

Ported from ~/personal/pi-infra-command-guard (extensions/infra-command-guard).
Scope is deliberately narrower than the pi extension: no docker/git/vault/cloud
policies, no config file, no notifications.

Exit 0 = allow, Exit 2 = block (Claude reads stderr as feedback).

Classification basis
--------------------
Every block carries a basis:

  known_risk    the command was positively recognized as dangerous
  unclassified  the guard could not prove the command is safe

GUARD_UNCLASSIFIED_COMMANDS decides what happens to `unclassified`. It is False
here, matching ~/.pi/agent/infra-command-guard.json: uncertainty alone runs.
Shell syntax the parser rejects, opaque shell runners (`bash -lc '...'`,
`xargs ...`), dynamic executables (`$TOOL ...`), and unknown subcommands are
allowed. Positively recognized risk always blocks.

One-time approval flow
----------------------
  1. Hook blocks a command and records a pending request (id, command, cwd,
     session, timestamp) in PENDING_FILE.
  2. User approves via AskUserQuestion.
  3. Claude writes the request id to APPROVAL_TOKEN_FILE.
  4. Claude retries; the hook consumes the token and allows the call only if the
     command, cwd and session still match and the request is under 10 minutes
     old. The token is single-use.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
import sys
from typing import Callable, Iterable, Sequence

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# False = classified-dangerous-only mode. Uncertainty runs without approval.
GUARD_UNCLASSIFIED_COMMANDS = False

APPROVAL_TOKEN_FILE = os.path.expanduser("~/.claude/infra-guard-approval")
PENDING_FILE = os.path.expanduser("~/.claude/infra-guard-pending.json")
APPROVAL_TTL_SECONDS = 10 * 60

GUARDED_EXECUTABLES = (
    "kubectl",
    "terraform",
    "helm",
    "argocd",
    "find",
    "rmdir",
    "rm",
    "rsync",
    "shred",
    "truncate",
    "unlink",
)

# Tool names used for narrow local-file actions are also common search terms, so
# the conservative bare-text fallback only fires for the infrastructure tools.
INDIRECT_TEXT_GUARDS = ("kubectl", "terraform", "helm", "argocd", "rm")

GUARDED_PATTERN = re.compile(r"\b(?:%s)\b" % "|".join(GUARDED_EXECUTABLES), re.IGNORECASE)
INDIRECT_TEXT_PATTERN = re.compile(r"\b(?:%s)\b" % "|".join(INDIRECT_TEXT_GUARDS), re.IGNORECASE)
OTHER_GUARDED_PATTERN = re.compile(
    r"\b(?:%s)\b" % "|".join(e for e in GUARDED_EXECUTABLES if e != "kubectl")
)
RSYNC_DELEGATED_PATTERN = re.compile(
    r"\b(?:%s)\b" % "|".join(e for e in GUARDED_EXECUTABLES if e != "rsync")
)

# ---------------------------------------------------------------------------
# Shell lexing
# ---------------------------------------------------------------------------

SHELL_RUNNERS = {
    "sh", "bash", "zsh", "dash", "fish",
    "xargs",
    "python", "python3", "python3.11", "python3.12",
    "node", "perl", "ruby",
}

SHELL_CONTROL_KEYWORDS = {
    "!", "if", "then", "elif", "else", "fi",
    "for", "while", "until", "do", "done",
    "case", "esac", "select", "function",
}

SHELL_EXECUTION_BUILTINS = {".", "source", "eval", "exec"}

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


class ParseError(Exception):
    pass


def strip_path(raw: str) -> str:
    normalized = str(raw or "")
    parts = re.split(r"[\\/]", normalized)
    return (parts[-1] if parts and parts[-1] else normalized).lower()


def is_assignment_word(word: str) -> bool:
    return bool(re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", word))


def normalize_for_scan(text: str) -> str:
    return re.sub(r"""["'\\]""", "", str(text or ""))


def contains_guarded_text(text: str, pattern: re.Pattern[str] = GUARDED_PATTERN) -> bool:
    return bool(pattern.search(normalize_for_scan(text)))


def parse_simple_commands(command: str) -> list[tuple[list[str], str]]:
    """Split a command into simple-command segments of (words, bare_text).

    `bare_text` drops quoted characters, so quoting cannot hide a guarded name
    from the indirect-invocation fallback.
    """
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

        # `{}` is find's path placeholder, not shell grouping.
        if ch == "{" and nxt == "}":
            add(ch, False)
            add(nxt, False)
            i += 2
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
    """Peel wrappers (sudo, env, busybox, …) off a segment to find the real executable."""
    index = 0
    wrappers: list[str] = []

    while index < len(words):
        while index < len(words) and is_assignment_word(words[index]):
            index += 1
        if index >= len(words):
            return Invocation(None, [], [], wrappers)

        raw_exec = words[index]
        executable = strip_path(raw_exec)

        if executable == "toybox":
            applet_index = index + 1
            while applet_index < len(words) and words[applet_index] == "--long":
                applet_index += 1
            if applet_index < len(words) and not words[applet_index].startswith("-"):
                wrappers.append(executable)
                index = applet_index
                continue

        if (
            executable == "busybox"
            and index + 1 < len(words)
            and not words[index + 1].startswith("-")
        ):
            wrappers.append(executable)
            index += 1
            continue

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


def has_dynamic_executable(command: str) -> bool:
    if "$" not in str(command or ""):
        return False
    try:
        segments = parse_simple_commands(command)
    except ParseError:
        return False
    for segment_words, _bare in segments:
        try:
            inv = extract_invocation(segment_words)
        except ParseError:
            continue
        if inv.executable and "$" in inv.executable:
            return True
    return False


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
            classification = classify_leading_option(
                word, leading_boolean_options, leading_value_options
            )
            if classification != "unknown":
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

            if not positionals:
                raise ParseError(f"Unsupported leading option: {word}")

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


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------

class Decision:
    def __init__(self, allow: bool, reason: str | None = None, basis: str | None = None):
        self.allow = allow
        self.reason = reason
        self.basis = basis


def _allow() -> Decision:
    return Decision(True)


def _known_risk(reason: str) -> Decision:
    return Decision(False, reason, "known_risk")


def _unclassified(reason: str) -> Decision:
    return Decision(False, reason, "unclassified")


# ---------------------------------------------------------------------------
# Tool policies: kubectl / terraform / helm / argocd
# ---------------------------------------------------------------------------

SAFE_KUBECTL_TOP_LEVEL = {
    "api-resources", "api-versions", "describe", "diff", "explain",
    "get", "log", "logs", "port-forward", "top", "version", "wait",
}
SAFE_KUBECTL_NESTED = {
    "auth": {"can-i", "whoami"},
    "rollout": {"history", "status"},
}
RISKY_KUBECTL_TOP_LEVEL = {
    "annotate", "apply", "attach", "autoscale", "certificate", "cordon", "cp", "create", "debug",
    "delete", "drain", "edit", "exec", "expose", "label", "patch", "replace", "run", "scale",
    "set", "taint", "uncordon",
}
RISKY_KUBECTL_ROLLOUT_ACTIONS = {"pause", "restart", "resume", "undo"}

SAFE_TERRAFORM_TOP_LEVEL = {
    "fmt", "graph", "init", "plan", "providers", "show", "validate", "version",
}
SAFE_TERRAFORM_NESTED = {
    "state": {"list", "show"},
    "workspace": {"list", "select", "show"},
}
RISKY_TERRAFORM_TOP_LEVEL = {
    "apply", "console", "destroy", "force-unlock", "import", "login", "logout",
    "refresh", "taint", "test", "untaint",
}
RISKY_TERRAFORM_NESTED = {
    "state": {"mv", "pull", "push", "replace-provider", "rm"},
    "workspace": {"delete", "new"},
}

SAFE_HELM_TOP_LEVEL = {
    "completion", "env", "help", "history", "lint", "list",
    "search", "show", "status", "template", "verify", "version",
}
SAFE_HELM_NESTED = {
    "dependency": {"list"},
    "plugin": {"list"},
    "repo": {"list"},
}
RISKY_HELM_TOP_LEVEL = {"install", "push", "rollback", "test", "uninstall", "upgrade"}
RISKY_HELM_NESTED = {
    "dependency": {"build", "update"},
    "plugin": {"install", "uninstall", "update"},
    "registry": {"login", "logout"},
    "repo": {"add", "index", "remove", "rm", "update"},
}

SAFE_ARGOCD_TOP_LEVEL = {"completion", "help", "version"}
SAFE_ARGOCD_NESTED = {
    "account": {"can-i", "get", "list"},
    "app": {"get", "history", "list", "logs", "resources", "wait"},
    "cert": {"list"},
    "cluster": {"get", "list"},
    "gpg": {"list"},
    "proj": {"get", "list"},
    "repo": {"get", "list"},
}
RISKY_ARGOCD_TOP_LEVEL = {"login", "logout"}
RISKY_ARGOCD_NESTED = {
    "account": {"delete-token", "generate-token", "update-password"},
    "admin": {"cluster", "dashboard", "export", "import", "initial-password", "notifications"},
    "app": {"create", "delete", "patch", "patch-resource", "rollback", "set", "sync",
            "terminate-op", "unset"},
    "cluster": {"add", "rm", "rotate-auth"},
    "proj": {"add-destination", "add-source", "create", "delete", "remove-destination",
             "remove-source", "set"},
    "repo": {"add", "rm"},
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

TERRAFORM_LEADING_BOOLEAN_OPTIONS = {"-help", "--help", "-version", "--version", "-no-color"}
TERRAFORM_LEADING_VALUE_OPTIONS = {"-chdir"}

HELM_LEADING_BOOLEAN_OPTIONS = {"-h", "--help", "--debug", "--kube-insecure-skip-tls-verify"}
HELM_LEADING_VALUE_OPTIONS = {
    "-n", "--namespace", "--burst-limit", "--kube-apiserver", "--kube-as-group",
    "--kube-as-user", "--kube-ca-file", "--kube-context", "--kube-tls-server-name",
    "--kube-token", "--kubeconfig", "--registry-config", "--repository-cache",
    "--repository-config",
}

ARGOCD_LEADING_BOOLEAN_OPTIONS = {
    "-h", "--help", "--core", "--grpc-web", "--insecure", "--plaintext", "--port-forward",
}
ARGOCD_LEADING_VALUE_OPTIONS = {
    "--auth-token", "--client-crt", "--client-crt-key", "--config",
    "--controller-name", "--grpc-web-root-path", "--http-retry-max",
    "--kube-context", "--logformat", "--loglevel", "--port-forward-namespace",
    "--redis-compress", "--redis-haproxy-name", "--redis-name",
    "--repo-server-name", "--server", "--server-crt", "--server-name",
}

PORT_FORWARD_KUBECTL_MENTION = re.compile(r"\bkubectl\b(?=[\s;|&()<>]|$)")
PORT_FORWARD_KUBECTL_USE = re.compile(
    r"\bkubectl\b(?=[\s;|&()<>]|$)(?:(?!&&|\|\||[;&|\n]).)*\bport-forward\b"
)


def is_secret_like_kubectl_target(word: str) -> bool:
    normalized = str(word or "").lower()
    for piece in normalized.split(","):
        piece = piece.strip()
        if piece in ("secret", "secrets") or piece.startswith("secret/") or piece.startswith("secrets/"):
            return True
    return False


def has_raw_kubectl_flag(words: Iterable[str]) -> bool:
    return any(w == "--raw" or w.startswith("--raw=") for w in words)


def is_kubectl_port_forward_only_command(command: str) -> bool:
    """Fast path for kubectl port-forward, commonly backgrounded with `&` (syntax
    the parser rejects). Allowed only when every kubectl mention in the command
    is a port-forward and no other guarded tool appears."""
    normalized = normalize_for_scan(command).lower()
    mentions = PORT_FORWARD_KUBECTL_MENTION.findall(normalized)
    if not mentions:
        return False
    if OTHER_GUARDED_PATTERN.search(normalized):
        return False
    port_forwards = PORT_FORWARD_KUBECTL_USE.findall(normalized)
    return len(port_forwards) == len(mentions)


def evaluate_kubectl(inv: Invocation) -> Decision:
    if has_raw_kubectl_flag(inv.args):
        return _known_risk("kubectl --raw is not on the low-risk allowlist")

    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=3,
            leading_boolean_options=KUBECTL_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=KUBECTL_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _unclassified(f"kubectl uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()
    target = positionals[1] if len(positionals) > 1 else ""

    if not top_level:
        return _unclassified("kubectl command could not be classified safely")

    if top_level in ("get", "describe"):
        if is_secret_like_kubectl_target(target):
            return _known_risk(f"kubectl {top_level} against secrets may expose secret material")
        return _allow()

    if top_level == "auth":
        if nested in SAFE_KUBECTL_NESTED["auth"]:
            return _allow()
        return _unclassified(f"kubectl auth {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "rollout":
        if nested in SAFE_KUBECTL_NESTED["rollout"]:
            return _allow()
        if nested in RISKY_KUBECTL_ROLLOUT_ACTIONS:
            return _known_risk(f"kubectl rollout {nested} may change workload state")
        return _unclassified(f"kubectl rollout {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "cluster-info" and nested == "dump":
        return _known_risk("kubectl cluster-info dump can expose sensitive cluster state")

    if top_level in SAFE_KUBECTL_TOP_LEVEL:
        return _allow()
    if top_level in RISKY_KUBECTL_TOP_LEVEL:
        return _known_risk(f"kubectl {top_level} is not on the low-risk allowlist")
    return _unclassified(f"kubectl {top_level} is not on the low-risk allowlist")


def evaluate_terraform(inv: Invocation) -> Decision:
    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=2,
            leading_boolean_options=TERRAFORM_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=TERRAFORM_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _unclassified(f"terraform uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()

    if not top_level:
        if any(a in ("-version", "--version") for a in inv.args):
            return _allow()
        return _unclassified("terraform command could not be classified safely")

    if top_level == "state":
        if nested in SAFE_TERRAFORM_NESTED["state"]:
            return _allow()
        if nested in RISKY_TERRAFORM_NESTED["state"]:
            return _known_risk(f"terraform state {nested} can mutate or rewrite state")
        return _unclassified(f"terraform state {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "workspace":
        if nested in SAFE_TERRAFORM_NESTED["workspace"]:
            return _allow()
        if nested in RISKY_TERRAFORM_NESTED["workspace"]:
            return _known_risk(f"terraform workspace {nested} is not on the low-risk allowlist")
        return _unclassified(f"terraform workspace {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level == "output":
        return _known_risk("terraform output may expose sensitive values")

    if top_level in SAFE_TERRAFORM_TOP_LEVEL:
        return _allow()
    if top_level in RISKY_TERRAFORM_TOP_LEVEL:
        return _known_risk(f"terraform {top_level} is not on the low-risk allowlist")
    return _unclassified(f"terraform {top_level} is not on the low-risk allowlist")


def evaluate_helm(inv: Invocation) -> Decision:
    if any(a == "--post-renderer" or a.startswith("--post-renderer=") for a in inv.args):
        return _known_risk("helm --post-renderer can execute an external program")

    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=2,
            leading_boolean_options=HELM_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=HELM_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _unclassified(f"helm uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()

    if not top_level:
        if any(a in ("-h", "--help") for a in inv.args):
            return _allow()
        return _unclassified("helm command could not be classified safely")

    if top_level == "get":
        return _known_risk("helm get may expose stored release values or rendered secrets")

    if top_level in SAFE_HELM_NESTED:
        if nested in SAFE_HELM_NESTED[top_level]:
            return _allow()
        if nested in RISKY_HELM_NESTED.get(top_level, set()):
            return _known_risk(f"helm {top_level} {nested} changes Helm or repository state")
        return _unclassified(f"helm {top_level} {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level in SAFE_HELM_TOP_LEVEL:
        return _allow()
    if nested in RISKY_HELM_NESTED.get(top_level, set()):
        return _known_risk(f"helm {top_level} {nested} changes Helm or registry state")
    if top_level in RISKY_HELM_TOP_LEVEL:
        return _known_risk(f"helm {top_level} changes release or registry state")
    return _unclassified(f"helm {top_level} is not on the low-risk allowlist")


def evaluate_argocd(inv: Invocation) -> Decision:
    try:
        positionals = collect_positionals(
            inv.args,
            max_positionals=3,
            leading_boolean_options=ARGOCD_LEADING_BOOLEAN_OPTIONS,
            leading_value_options=ARGOCD_LEADING_VALUE_OPTIONS,
        )
    except ParseError as exc:
        return _unclassified(f"argocd uses an unsupported flag layout ({exc})")

    top_level = (positionals[0] if len(positionals) > 0 else "").lower()
    nested = (positionals[1] if len(positionals) > 1 else "").lower()
    action = (positionals[2] if len(positionals) > 2 else "").lower()

    if not top_level:
        if any(a in ("-h", "--help", "--version") for a in inv.args):
            return _allow()
        return _unclassified("argocd command could not be classified safely")

    if top_level == "app" and nested in ("diff", "manifests"):
        return _known_risk(f"argocd app {nested} may expose rendered secret material")

    if top_level == "app" and nested == "actions":
        if action == "list":
            return _allow()
        if action == "run":
            return _known_risk("argocd app actions run may execute a resource action")
        return _unclassified(f"argocd app actions {action or '<unknown>'} is not on the low-risk allowlist")

    if top_level in SAFE_ARGOCD_NESTED:
        if nested in SAFE_ARGOCD_NESTED[top_level]:
            return _allow()
        if nested in RISKY_ARGOCD_NESTED.get(top_level, set()):
            return _known_risk(f"argocd {top_level} {nested} changes Argo CD state or credentials")
        return _unclassified(f"argocd {top_level} {nested or '<unknown>'} is not on the low-risk allowlist")

    if top_level in SAFE_ARGOCD_TOP_LEVEL:
        return _allow()
    if nested in RISKY_ARGOCD_NESTED.get(top_level, set()):
        return _known_risk(f"argocd {top_level} {nested} changes Argo CD state or credentials")
    if top_level in RISKY_ARGOCD_TOP_LEVEL:
        return _known_risk(f"argocd {top_level} changes authentication state")
    return _unclassified(f"argocd {top_level} is not on the low-risk allowlist")


# ---------------------------------------------------------------------------
# Tool policies: destructive local-file commands
# ---------------------------------------------------------------------------

HELP_OR_VERSION_ARGUMENTS = {"--help", "--version"}

RSYNC_DELETION_OPTIONS = {
    "--del", "--delete", "--delete-after", "--delete-before", "--delete-delay",
    "--delete-during", "--delete-excluded", "--delete-missing-args",
    "--remove-sent-files", "--remove-source-files",
}
RSYNC_LONG_VALUE_OPTIONS = {
    "--address", "--backup-dir", "--block-size", "--bwlimit", "--chown", "--chmod",
    "--compare-dest", "--checksum-choice", "--checksum-seed", "--compress-choice",
    "--compress-level", "--config", "--contimeout", "--copy-as", "--copy-dest", "--debug",
    "--early-input", "--exclude", "--exclude-from", "--files-from", "--filter", "--groupmap",
    "--iconv", "--include", "--include-from", "--info", "--link-dest", "--log-file",
    "--log-file-format", "--log-format", "--max-alloc", "--max-delete", "--max-size",
    "--min-size", "--modify-window", "--only-write-batch", "--out-format", "--partial-dir",
    "--password-file", "--port", "--protocol", "--read-batch", "--remote-option",
    "--rsync-path", "--rsh", "--skip-compress", "--sockopts", "--stderr", "--stop-after",
    "--stop-at", "--suffix", "--temp-dir", "--timeout", "--usermap", "--write-batch",
}
RSYNC_SHORT_VALUE_OPTIONS = {"B", "e", "f", "M", "T"}

RSYNC_EXECUTABLE_VALUE_SHELL_CHARS = re.compile(r"[;&|`$()<>\r\n]")
RSYNC_EXECUTABLE_VALUE_INTERPRETERS = re.compile(
    r"\b(?:bash|busybox|dash|eval|exec|fish|node|perl|python|python3|ruby|sh|toybox|zsh)\b"
)

FIND_DELEGATION_ACTIONS = {"-exec", "-execdir", "-ok", "-okdir"}
FIND_RUNNER_CODE_FLAGS = {
    "bash": ["-c"], "dash": ["-c"], "fish": ["-c"], "sh": ["-c"], "zsh": ["-c"],
    "node": ["-e", "--eval", "-p", "--print"],
    "perl": ["-e"], "ruby": ["-e"],
    "python": ["-c"], "python3": ["-c"], "python3.11": ["-c"], "python3.12": ["-c"],
}


def option_name(word: str) -> str:
    return word.split("=", 1)[0] if "=" in word else word


def matches_rsync_long_option(name: str, candidate: str) -> bool:
    """rsync accepts unambiguous long-option abbreviations (--del-exc, --dry)."""
    return name == candidate or (len(name) >= 4 and candidate.startswith(name))


def is_rsync_long_value_option(name: str) -> bool:
    return any(matches_rsync_long_option(name, c) for c in RSYNC_LONG_VALUE_OPTIONS)


def matching_rsync_deletion_options(option: str) -> list[str]:
    if option in RSYNC_DELETION_OPTIONS:
        return [option]
    if len(option) < 4:
        return []
    return [c for c in RSYNC_DELETION_OPTIONS if c.startswith(option)]


def analyze_rsync_options(args: list[str]) -> tuple[str | None, bool]:
    """Return (first enabled deletion option, dry_run)."""
    dry_run = False
    enabled: list[str] = []
    index = 0
    while index < len(args):
        word = args[index]
        if word == "--":
            break
        if word.startswith("--"):
            name = option_name(word)
            if matches_rsync_long_option(name, "--dry-run"):
                dry_run = True
            if matches_rsync_long_option(name, "--no-dry-run"):
                dry_run = False
            if name.startswith("--no-"):
                negated = matching_rsync_deletion_options("--" + name[5:])
                if "--delete" in negated or "--del" in negated:
                    enabled = [o for o in enabled if not o.startswith("--del")]
                elif any(o.startswith("--remove-") for o in negated):
                    enabled = [o for o in enabled if not o.startswith("--remove-")]
                else:
                    enabled = [o for o in enabled if o not in negated]
            else:
                for option in matching_rsync_deletion_options(name):
                    if option not in enabled:
                        enabled.append(option)
            if "=" not in word and is_rsync_long_value_option(name):
                index += 1
            index += 1
            continue
        if not word.startswith("-") or word == "-":
            index += 1
            continue
        short_options = word[1:]
        for short_index, short_option in enumerate(short_options):
            if short_option == "n":
                dry_run = True
            if short_option not in RSYNC_SHORT_VALUE_OPTIONS:
                continue
            if short_index == len(short_options) - 1:
                index += 1
            break
        index += 1
    return (enabled[0] if enabled else None), dry_run


def rsync_executable_option_values(args: list[str]) -> list[str]:
    """Values of --rsh/-e and --rsync-path, which name a program rsync will run."""
    values: list[str] = []
    index = 0
    while index < len(args):
        word = args[index]
        if word == "--":
            break
        if word.startswith("--"):
            name = option_name(word)
            if matches_rsync_long_option(name, "--rsh") or matches_rsync_long_option(name, "--rsync-path"):
                if "=" in word:
                    values.append(word.split("=", 1)[1])
                else:
                    index += 1
                    if index < len(args):
                        values.append(args[index])
                index += 1
                continue
            if "=" not in word and is_rsync_long_value_option(name):
                index += 1
            index += 1
            continue
        if not word.startswith("-") or word == "-":
            index += 1
            continue
        short_options = word[1:]
        for short_index, short_option in enumerate(short_options):
            if short_option not in RSYNC_SHORT_VALUE_OPTIONS:
                continue
            attached = re.sub(r"^=", "", short_options[short_index + 1:])
            if attached:
                value = attached
            else:
                index += 1
                value = args[index] if index < len(args) else None
            if short_option == "e" and value is not None:
                values.append(value)
            break
        index += 1
    return values


def evaluate_rsync_executable_option_risk(inv: Invocation) -> Decision | None:
    for value in rsync_executable_option_values(inv.args):
        normalized = normalize_for_scan(value).lower()
        if (
            RSYNC_EXECUTABLE_VALUE_SHELL_CHARS.search(value)
            or RSYNC_EXECUTABLE_VALUE_INTERPRETERS.search(value)
            or RSYNC_DELEGATED_PATTERN.search(normalized)
        ):
            return _known_risk("rsync executable option can run behavior hidden from command policy")
    return None


def evaluate_rsync(inv: Invocation) -> Decision:
    executable_option_risk = evaluate_rsync_executable_option_risk(inv)
    if executable_option_risk:
        return executable_option_risk
    destructive, dry_run = analyze_rsync_options(inv.args)
    if dry_run:
        return _allow()
    if destructive:
        return _known_risk(f"rsync {destructive} command needs confirmation")
    return _allow()


def evaluate_always_destructive(executable: str, inv: Invocation) -> Decision:
    if len(inv.args) == 1 and inv.args[0] in HELP_OR_VERSION_ARGUMENTS:
        return _allow()
    return _known_risk(f"{executable} command needs confirmation")


def evaluate_find(inv: Invocation) -> Decision:
    if "-delete" in inv.args:
        return _known_risk("find -delete command needs confirmation")
    return _allow()


def find_runner_code_uses_placeholder(inv: Invocation) -> bool:
    code_flags = FIND_RUNNER_CODE_FLAGS.get(inv.executable or "", [])
    for index, argument in enumerate(inv.args):
        if any(argument != flag and argument.startswith(flag) for flag in code_flags):
            return "{}" in argument
        if argument in code_flags and index + 1 < len(inv.args) and "{}" in inv.args[index + 1]:
            return True
    return False


def evaluate_find_delegated_commands(inv: Invocation) -> Decision | None:
    """Classify the commands find runs via -exec/-execdir/-ok/-okdir."""
    uncertainty: Decision | None = None
    index = 0
    while index < len(inv.args):
        if inv.args[index] not in FIND_DELEGATION_ACTIONS:
            index += 1
            continue
        end = next(
            (i for i in range(index + 1, len(inv.args)) if inv.args[i] in (";", "+")),
            -1,
        )
        nested_words = inv.args[index + 1:] if end == -1 else inv.args[index + 1:end]
        if nested_words:
            try:
                nested_inv = extract_invocation(nested_words)
                placeholder = (
                    (nested_inv.executable and "{}" in nested_inv.executable)
                    or find_runner_code_uses_placeholder(nested_inv)
                )
            except ParseError:
                nested_inv = None
                placeholder = False
            if placeholder:
                if uncertainty is None:
                    uncertainty = _unclassified(
                        "find delegates execution through a path placeholder, which requires manual approval"
                    )
            else:
                nested_command = " ".join(json.dumps(word) for word in nested_words)
                decision = classify_command(nested_command)
                if not decision.allow:
                    if decision.basis != "unclassified":
                        return decision
                    if uncertainty is None:
                        uncertainty = decision
        index = index + 1 if end == -1 else end
    return uncertainty


TOOL_EVALUATORS: dict[str, Callable[[Invocation], Decision]] = {
    "argocd": evaluate_argocd,
    "find": evaluate_find,
    "helm": evaluate_helm,
    "kubectl": evaluate_kubectl,
    "rm": lambda _inv: _known_risk("rm command needs confirmation"),
    "rmdir": lambda inv: evaluate_always_destructive("rmdir", inv),
    "rsync": evaluate_rsync,
    "shred": lambda inv: evaluate_always_destructive("shred", inv),
    "terraform": evaluate_terraform,
    "truncate": lambda inv: evaluate_always_destructive("truncate", inv),
    "unlink": lambda inv: evaluate_always_destructive("unlink", inv),
}


# ---------------------------------------------------------------------------
# Command classification
# ---------------------------------------------------------------------------

def classify_command(command: str) -> Decision:
    """Positively recognized risk returns immediately; uncertainty is collected
    and only reported when nothing worse is found."""
    uncertainty: Decision | None = (
        _unclassified("This command resolves its executable through a shell variable, which requires manual approval")
        if has_dynamic_executable(command)
        else None
    )

    if not contains_guarded_text(command) and uncertainty is None:
        return _allow()

    if is_kubectl_port_forward_only_command(command):
        return _allow()

    try:
        segments = parse_simple_commands(command)
    except ParseError as exc:
        return _unclassified(
            f"This command uses shell syntax the infra guard cannot classify safely ({exc})"
        )

    for segment_words, segment_bare in segments:
        try:
            inv = extract_invocation(segment_words)
        except ParseError as exc:
            if uncertainty is None:
                uncertainty = _unclassified(
                    f"This command uses a wrapper the infra guard cannot classify safely ({exc})"
                )
            continue

        segment_text = " ".join(segment_words)

        if not inv.executable:
            if contains_guarded_text(segment_text):
                if uncertainty is None:
                    uncertainty = _unclassified(
                        "This command assigns guarded tooling for indirect shell execution, which requires manual approval"
                    )
            continue

        if inv.executable in SHELL_CONTROL_KEYWORDS:
            if uncertainty is None:
                uncertainty = _unclassified(
                    f"This command uses shell control flow ({inv.executable}), which requires manual approval"
                )
            continue

        if inv.executable in SHELL_EXECUTION_BUILTINS:
            if uncertainty is None:
                uncertainty = _unclassified(
                    f"This command uses shell execution syntax ({inv.executable}), which requires manual approval"
                )
            continue

        if inv.executable in SHELL_RUNNERS and contains_guarded_text(segment_text):
            if uncertainty is None:
                uncertainty = _unclassified(
                    f"This command delegates guarded execution through {inv.executable}, which requires manual approval"
                )
            continue

        if inv.executable == "find":
            delegated = evaluate_find_delegated_commands(inv)
            if delegated is not None and not delegated.allow:
                if delegated.basis != "unclassified":
                    return delegated
                if uncertainty is None:
                    uncertainty = delegated

        if inv.executable == "rsync":
            if any(
                contains_guarded_text(value, RSYNC_DELEGATED_PATTERN)
                for value in rsync_executable_option_values(inv.args)
            ):
                return _known_risk(
                    "rsync executable option delegates to guarded tooling, which requires manual approval"
                )

        evaluator = TOOL_EVALUATORS.get(inv.executable)
        if evaluator:
            decision = evaluator(inv)
            if not decision.allow:
                if decision.basis != "unclassified":
                    return decision
                if uncertainty is None:
                    uncertainty = decision
            continue

        if contains_guarded_text(segment_bare, INDIRECT_TEXT_PATTERN):
            if uncertainty is None:
                uncertainty = _unclassified(
                    f"This command invokes guarded tooling through {inv.executable}, which requires manual approval"
                )

    return uncertainty if uncertainty is not None else _allow()


def evaluate_command(command: str) -> Decision:
    decision = classify_command(command)
    if not decision.allow and decision.basis == "unclassified" and not GUARD_UNCLASSIFIED_COMMANDS:
        return _allow()
    return decision


# ---------------------------------------------------------------------------
# One-time approvals
# ---------------------------------------------------------------------------

def _load_pending() -> dict[str, dict]:
    try:
        with open(PENDING_FILE) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    now = time.time()
    return {
        request_id: record
        for request_id, record in data.items()
        if isinstance(record, dict) and now - record.get("created_at", 0) < APPROVAL_TTL_SECONDS
    }


def _save_pending(pending: dict[str, dict]) -> None:
    try:
        with open(PENDING_FILE, "w") as f:
            json.dump(pending, f)
    except OSError:
        pass


def create_pending(command: str, cwd: str, session_id: str, reason: str) -> str:
    pending = _load_pending()
    request_id = uuid.uuid4().hex[:12]
    pending[request_id] = {
        "command": command,
        "cwd": cwd,
        "session_id": session_id,
        "reason": reason,
        "created_at": time.time(),
    }
    _save_pending(pending)
    return request_id


def consume_one_time_approval(command: str, cwd: str, session_id: str) -> bool:
    """Consume the approval token if it names a live request matching this exact
    command, working directory and session. Single use, ten minute TTL."""
    try:
        with open(APPROVAL_TOKEN_FILE) as f:
            token = f.read().strip()
    except (FileNotFoundError, OSError):
        return False

    try:
        os.remove(APPROVAL_TOKEN_FILE)
    except OSError:
        pass

    pending = _load_pending()
    record = pending.pop(token, None)
    _save_pending(pending)
    if not record:
        return False
    return (
        record.get("command") == command
        and record.get("cwd") == cwd
        and record.get("session_id") == session_id
    )


def emit_block(reason: str, command: str, request_id: str) -> None:
    lines = [
        f"BLOCKED — {reason}",
        f"Command: {command}",
        f"Approval request: {request_id}",
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
        '  3. If the user selects "Approve and run", write ONLY the approval request',
        f"     id above to {APPROVAL_TOKEN_FILE}, then retry the bash tool with the",
        "     EXACT command, byte-for-byte. The guard compares the retry against the",
        "     recorded command, directory and session, so any edit blocks again.",
        '  4. If the user selects "Cancel" or anything else, stop — do not retry.',
        "  5. Do NOT explain in chat first; the explanation must live inside the",
        "     AskUserQuestion preview so the user can review and approve in one UI.",
        "  6. The approval expires in 10 minutes and works once.",
    ]
    for line in lines:
        print(line, file=sys.stderr)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not isinstance(command, str) or not command:
        return 0

    cwd = payload.get("cwd") or ""
    session_id = payload.get("session_id") or ""

    if consume_one_time_approval(command, cwd, session_id):
        return 0

    decision = evaluate_command(command)
    if decision.allow:
        return 0

    reason = decision.reason or "blocked"
    request_id = create_pending(command, cwd, session_id, reason)
    emit_block(reason, command, request_id)
    return 2


if __name__ == "__main__":
    sys.exit(main())
