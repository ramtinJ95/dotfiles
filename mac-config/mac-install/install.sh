#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOTFILES_HELPER="$REPO_ROOT/scripts/dotfiles"

usage() {
    cat <<'EOF'
Usage: mac-config/mac-install/install.sh [--apply <Macarchy approval options>]

Prepare the Macarchy profile and personal dotfiles, then show the native setup
plan. No provider/package/preference approvals are inferred from that plan.

After reviewing the plan, rerun with --apply and its exact approval options,
or run macarchy setup apply directly. Native Macarchy revalidates all approvals.

Homebrew and Xcode Command Line Tools must already be installed.
EOF
}

apply=false
case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    --apply) apply=true; shift ;;
    '') ;;
    *) usage >&2; exit 2 ;;
esac

if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 || "$(sw_vers -productVersion)" != 26.* ]]; then
    echo "Macarchy requires Apple Silicon running macOS 26." >&2
    exit 1
fi
if ! xcode-select --print-path >/dev/null 2>&1; then
    echo "Install Xcode Command Line Tools with xcode-select --install, then rerun." >&2
    exit 1
fi
if [[ ! -x /opt/homebrew/bin/brew ]]; then
    echo "Install Homebrew using its official instructions at https://brew.sh, then rerun." >&2
    exit 1
fi
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

# Only these bootstrap tools are installed here. Macarchy owns the selected
# package plan; the legacy Brewfile, Lua bar helpers and defaults script are inert.
bootstrap=()
command -v stow >/dev/null 2>&1 || bootstrap+=(stow)
command -v macarchy >/dev/null 2>&1 || bootstrap+=(ramtinj95/tap/macarchy)
if [[ "${#bootstrap[@]}" -gt 0 ]]; then
    printf "Missing bootstrap formulae: %s\n" "${bootstrap[*]}"
    echo "Homebrew may acquire the Macarchy tap and required dependencies."
    if [[ ! -t 0 ]]; then
        echo "Install these formulae explicitly or rerun in a terminal to approve." >&2
        exit 1
    fi
    read -r -p "Install the listed bootstrap formulae with Homebrew? [y/N] " answer
    case "$answer" in
        y|Y|yes|YES)
            HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_AUTOREMOVE=1 \
            HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_INSTALL_UPGRADE=1 \
                brew install --formula "${bootstrap[@]}"
            ;;
        *) echo "Bootstrap installation cancelled."; exit 1 ;;
    esac
fi

"$DOTFILES_HELPER" stow mac

echo "Review the Macarchy plan, including package and existing-config adoption:"
macarchy setup plan
if [[ "$apply" == true ]]; then
    macarchy setup apply "$@"
else
    cat <<'EOF'

Profile and dotfiles are prepared. Macarchy setup has NOT been applied.
Run macarchy setup apply with the exact approval flags shown by the plan.
Missing manual prerequisites (including Pi, Spotify/Spicetify initialization,
and Accessibility) must be completed before a successful apply.

Installed themes and generated state stay in the local ~/.config/macarchy tree.
Herdr/Pi/Codex native configs are local copies; restow never overwrites them.
EOF
fi
