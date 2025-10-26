#!/usr/bin/env bash
set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check for npm
if ! command -v npm >/dev/null 2>&1; then
  echo_error "npm is required to install the token analyzer dependencies"
  exit 1
fi

# Determine installation directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${1:-$SCRIPT_DIR}"

echo_info "Installing Token Analyzer Plugin dependencies..."
echo_info "Target directory: $TARGET_ROOT"

PLUGIN_DIR="$TARGET_ROOT"
VENDOR_DIR="$PLUGIN_DIR/vendor"

# Create vendor directory
mkdir -p "$VENDOR_DIR"

# Install plugin dependencies if package.json exists
if [ -f "$PLUGIN_DIR/package.json" ]; then
  echo_info "Installing plugin dependencies..."
  npm install --omit=dev --no-audit --loglevel=error --prefix "$PLUGIN_DIR" >/dev/null 2>&1 || {
    echo_warn "Plugin dependencies installation had warnings (this is usually okay)"
  }
  rm -f "$PLUGIN_DIR/package-lock.json" "$PLUGIN_DIR/npm-shrinkwrap.json"
fi

# Install tokenizer dependencies
echo_info "Installing tokenizer libraries (this may take a minute)..."
npm install "js-tiktoken@latest" "@huggingface/transformers@^3.3.3" \
  --omit=dev --no-audit --loglevel=error --prefix "$VENDOR_DIR" >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo_info "Tokenizers installed successfully!"
else
    echo_error "Failed to install tokenizer dependencies"
    exit 1
fi

# Clean up
rm -f "$VENDOR_DIR/package-lock.json" "$VENDOR_DIR/npm-shrinkwrap.json"

echo_info "✓ Installation complete!"
echo_info "Plugin files: $PLUGIN_DIR"
echo_info "Tokenizers: $VENDOR_DIR"
echo ""
echo_info "Restart OpenCode and use the /tokens command to analyze token usage"
