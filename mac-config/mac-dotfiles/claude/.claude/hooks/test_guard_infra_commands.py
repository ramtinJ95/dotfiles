#!/usr/bin/env python3
"""Tests for guard_infra_commands.py.

Mirrors the decision corpus of ~/personal/pi-infra-command-guard for the subset
of tools this hook ports. Run: python3 ~/.claude/hooks/test_guard_infra_commands.py
"""

from __future__ import annotations

import importlib.util
import json
import os
import tempfile

_spec = importlib.util.spec_from_file_location(
    "guard_infra_commands", os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard_infra_commands.py")
)
guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(guard)

failures: list[str] = []


def expect_block(command: str, *, basis: str = "known_risk") -> None:
    decision = guard.evaluate_command(command)
    if decision.allow:
        failures.append(f"expected BLOCK, got ALLOW: {command!r}")
    elif decision.basis != basis:
        failures.append(f"expected basis {basis}, got {decision.basis}: {command!r}")


def expect_allow(command: str) -> None:
    decision = guard.evaluate_command(command)
    if not decision.allow:
        failures.append(f"expected ALLOW, got BLOCK ({decision.reason}): {command!r}")


def expect_classify(command: str, basis: str) -> None:
    """Assert the underlying basis regardless of GUARD_UNCLASSIFIED_COMMANDS."""
    decision = guard.classify_command(command)
    actual = "allow" if decision.allow else decision.basis
    if actual != basis:
        failures.append(f"expected classification {basis}, got {actual}: {command!r}")


# --- rm and wrapped rm ------------------------------------------------------
for command in [
    "rm -rf target",
    "rm target",
    "sudo rm -rf /tmp/x",
    "/bin/rm -rf /tmp/x",
    "sudo /bin/rm -rf /tmp/x",
    "env rm -rf /tmp/x",
    "env FOO=bar rm -rf /tmp/x",
    "nohup rm -rf /tmp/x",
    "time rm -rf /tmp/x",
    "command rm -rf /tmp/x",
    "busybox rm -rf /tmp/x",
    "mkdir build && rm -rf dist",
    "find . -exec rm {} ;",
    "find . -exec rm -rf {} \\;",
    "find . -exec /bin/rm -rf {} +",
    "find . -execdir unlink {} \\;",
]:
    expect_block(command)

# --- other destructive local-file tools -------------------------------------
for command in [
    "unlink target",
    "sudo /usr/bin/unlink target",
    "rmdir empty-directory",
    "shred secrets.txt",
    "shred -u secrets.txt",
    "truncate -s 0 database.sqlite",
    "find . -type f -delete",
    "find . -name '*.log' -delete",
    "busybox find . -delete",
    "toybox find . -delete",
    "toybox --long unlink target",
]:
    expect_block(command)

for command in [
    "unlink --help",
    "rmdir --version",
    "shred --help",
    "truncate --version",
    "find . -type f -name '*.tmp' -print",
    "find . -type f -exec python process.py {} \\;",
    "busybox find . -type f -print",
    "toybox --long find . -type f -print",
    "printf '%s\\n' unlink truncate rsync",
    'printf "%s\\n" "rm -rf target"',
]:
    expect_allow(command)

# --- rsync ------------------------------------------------------------------
for command in [
    "rsync -a --delete source/ destination/",
    "rsync -a --delete-b source/ destination/",
    "rsync --delete-before source/ destination/",
    "rsync --delete-during source/ destination/",
    "rsync --delete-delay source/ destination/",
    "rsync --delete-after source/ destination/",
    "rsync --delete-excluded source/ destination/",
    "rsync --delete-missing-args source/ destination/",
    "rsync --remove-source-files source/ destination/",
    "rsync --rsync-path='rm -rf target; rsync' source/ host:destination/",
    "rsync -e \"sh -c 'rm -rf target'\" source/ host:destination/",
    "rsync --rs=\"sh -c 'rm -rf target'\" source/ host:destination/",
    # Values consumed by an option are not active dry-run flags.
    "rsync -e --dry-run --delete source/ destination/",
    "rsync --filter --dry-run --delete source/ destination/",
    "rsync --bw --dry-run --delete source/ destination/",
    "rsync --dry-run --no-dry-run --delete source/ destination/",
    "rsync -n --no-dry --delete source/ destination/",
    "rsync --delete --delete-excluded --no-delete-excluded source/ destination/",
]:
    expect_block(command)

for command in [
    "rsync -a source/ destination/",
    "rsync -e ssh source/ host:destination/",
    "rsync --rsh='ssh -p 2222' source/ host:destination/",
    "rsync --rsync-path=/usr/local/bin/rsync source/ host:destination/",
    "rsync --delete --no-delete source/ destination/",
    "rsync --delete-excluded --no-delete-excluded source/ destination/",
    "rsync --remove-source-files --no-remove-source-files source/ destination/",
    "rsync --dry-run --delete source/ destination/",
    "rsync -an --delete source/ destination/",
    "rsync --no-dry-run --dry-run --delete source/ destination/",
]:
    expect_allow(command)

# --- kubectl ----------------------------------------------------------------
for command in [
    "kubectl delete pod api",
    "kubectl apply -f manifest.yaml",
    "kubectl -n prod exec deploy/api -- sh",
    "kubectl drain node-1",
    "kubectl rollout restart deploy/api",
    "kubectl rollout undo deploy/api",
    "kubectl get secrets",
    "kubectl get secret/db-password -o yaml",
    "kubectl describe secrets -n prod",
    "kubectl --raw /api/v1/namespaces",
    "kubectl cluster-info dump",
    "sudo kubectl --context production delete pod api",
]:
    expect_block(command)

for command in [
    "kubectl get pods -A",
    "kubectl -n prod describe deploy api",
    "kubectl logs -f deploy/api",
    "kubectl top nodes",
    "kubectl auth can-i create pods",
    "kubectl auth whoami",
    "kubectl rollout status deploy/api",
    "kubectl rollout history deploy/api",
    "kubectl diff -f manifest.yaml",
    "kubectl wait --for=condition=Ready pod/api",
    "kubectl api-resources",
    "kubectl version",
    "kubectl port-forward svc/argocd-server 8080:443 -n argocd &",
    "nohup kubectl port-forward svc/api 8080:80 &",
]:
    expect_allow(command)

# --- terraform --------------------------------------------------------------
for command in [
    "terraform apply",
    "terraform destroy -auto-approve",
    "terraform import aws_s3_bucket.b my-bucket",
    "terraform force-unlock 1234",
    "terraform output",
    "terraform output -json",
    "terraform state rm aws_s3_bucket.b",
    "terraform state push state.tfstate",
    "terraform workspace delete staging",
    "terraform -chdir=envs/prod apply",
]:
    expect_block(command)

for command in [
    "terraform plan",
    "terraform -chdir=envs/prod plan",
    "terraform init",
    "terraform validate",
    "terraform fmt -check",
    "terraform show",
    "terraform state list",
    "terraform state show aws_s3_bucket.b",
    "terraform workspace list",
    "terraform workspace select prod",
    "terraform version",
]:
    expect_allow(command)

# --- helm -------------------------------------------------------------------
for command in [
    "helm upgrade api ./chart",
    "helm install api ./chart",
    "helm uninstall api",
    "helm rollback api 3",
    "helm get values api",
    "helm get manifest api",
    "helm repo add stable https://charts.example.com",
    "helm repo update",
    "helm plugin install https://example.com/plugin",
    "helm template ./chart --post-renderer ./kustomize.sh",
    "helm registry login registry.example.com",
]:
    expect_block(command)

for command in [
    "helm list -n prod",
    "helm status api",
    "helm history api",
    "helm template ./chart",
    "helm lint ./chart",
    "helm show values ./chart",
    "helm search repo nginx",
    "helm repo list",
    "helm dependency list ./chart",
    "helm plugin list",
    "helm version",
    "helm env",
]:
    expect_allow(command)

# --- argocd -----------------------------------------------------------------
for command in [
    "argocd app sync api",
    "argocd app delete api",
    "argocd app set api --revision main",
    "argocd app rollback api 3",
    "argocd app diff api",
    "argocd app manifests api",
    "argocd app actions run api restart",
    "argocd login argocd.example.com",
    "argocd cluster add prod",
    "argocd repo rm https://github.com/example/repo",
    "argocd account generate-token",
    "argocd admin export",
]:
    expect_block(command)

for command in [
    "argocd app list",
    "argocd app get api",
    "argocd app history api",
    "argocd app logs api",
    "argocd app resources api",
    "argocd app wait api",
    "argocd app actions list api",
    "argocd cluster list",
    "argocd proj get default",
    "argocd repo list",
    "argocd account can-i sync applications '*'",
    "argocd cert list",
    "argocd version",
]:
    expect_allow(command)

# --- unrelated commands are untouched ---------------------------------------
for command in [
    "ls -la",
    "git status",
    "npm run build",
    "docker ps",
    "git commit -m 'fix rm handling in the parser'",
    "grep -rn 'kubectl' docs/",
    "cat helm/values.yaml",
    "curl https://argocd.example.com/api/v1/session",
]:
    expect_allow(command)

# --- classified-dangerous-only mode: uncertainty runs -----------------------
# These are the deliberate holes of GUARD_UNCLASSIFIED_COMMANDS = False.
for command in [
    "echo /tmp/x | xargs rm -rf",
    "bash -lc 'kubectl delete pod api'",
    "K=kubectl; $K delete pod api",
    "eval 'rm -rf target'",
    "for f in *; do rm $f; done",
    "kubectl $(cat verb) pod api",
    "helm inspect values ./chart",
]:
    expect_classify(command, "unclassified")
    expect_allow(command)

# Positively classified risk still blocks inside the same shapes.
expect_block("find . -exec rm -rf {} \\;")
expect_block("rsync --rsync-path='rm -rf target; rsync' src/ host:dst/")

# --- conservative mode flips only the unclassified set ----------------------
guard.GUARD_UNCLASSIFIED_COMMANDS = True
try:
    for command in [
        "echo /tmp/x | xargs rm -rf",
        "bash -lc 'kubectl delete pod api'",
        "K=kubectl; $K delete pod api",
        "kubectl $(cat verb) pod api",
    ]:
        expect_block(command, basis="unclassified")
    expect_allow("kubectl get pods -A")
    expect_block("kubectl delete pod api")
finally:
    guard.GUARD_UNCLASSIFIED_COMMANDS = False

# --- approval token: exact command, cwd, session, single use ----------------
with tempfile.TemporaryDirectory() as tmp:
    guard.APPROVAL_TOKEN_FILE = os.path.join(tmp, "approval")
    guard.PENDING_FILE = os.path.join(tmp, "pending.json")

    def grant(command: str, cwd: str, session: str) -> str:
        request_id = guard.create_pending(command, cwd, session, "test reason")
        with open(guard.APPROVAL_TOKEN_FILE, "w") as f:
            f.write(request_id)
        return request_id

    grant("rm -rf target", "/repo", "s1")
    if not guard.consume_one_time_approval("rm -rf target", "/repo", "s1"):
        failures.append("approval: matching retry was not accepted")
    if guard.consume_one_time_approval("rm -rf target", "/repo", "s1"):
        failures.append("approval: token was reusable")

    grant("rm -rf target", "/repo", "s1")
    if guard.consume_one_time_approval("rm -rf target ", "/repo", "s1"):
        failures.append("approval: edited command was accepted")

    grant("rm -rf target", "/repo", "s1")
    if guard.consume_one_time_approval("rm -rf target", "/other", "s1"):
        failures.append("approval: wrong cwd was accepted")

    grant("rm -rf target", "/repo", "s1")
    if guard.consume_one_time_approval("rm -rf target", "/repo", "s2"):
        failures.append("approval: wrong session was accepted")

    request_id = grant("rm -rf target", "/repo", "s1")
    pending = guard._load_pending()
    pending[request_id]["created_at"] -= guard.APPROVAL_TTL_SECONDS + 1
    guard._save_pending(pending)
    if guard.consume_one_time_approval("rm -rf target", "/repo", "s1"):
        failures.append("approval: expired request was accepted")

    with open(guard.APPROVAL_TOKEN_FILE, "w") as f:
        f.write("not-a-real-request-id")
    if guard.consume_one_time_approval("rm -rf target", "/repo", "s1"):
        failures.append("approval: unknown token was accepted")

# --- end-to-end payload handling --------------------------------------------
def run_main(payload: dict) -> int:
    import io
    import sys

    stdin, stderr = sys.stdin, sys.stderr
    sys.stdin = io.StringIO(json.dumps(payload))
    sys.stderr = io.StringIO()
    try:
        return guard.main()
    finally:
        sys.stdin, sys.stderr = stdin, stderr


with tempfile.TemporaryDirectory() as tmp:
    guard.APPROVAL_TOKEN_FILE = os.path.join(tmp, "approval")
    guard.PENDING_FILE = os.path.join(tmp, "pending.json")
    if run_main({"tool_input": {"command": "ls -la"}, "cwd": "/repo", "session_id": "s1"}) != 0:
        failures.append("main: safe command did not exit 0")
    if run_main({"tool_input": {"command": "rm -rf target"}, "cwd": "/repo", "session_id": "s1"}) != 2:
        failures.append("main: blocked command did not exit 2")
    if run_main({"tool_input": {}, "cwd": "/repo", "session_id": "s1"}) != 0:
        failures.append("main: empty command did not exit 0")


if failures:
    print(f"FAILED ({len(failures)})")
    for failure in failures:
        print(f"  {failure}")
    raise SystemExit(1)
print("all guard tests passed")
