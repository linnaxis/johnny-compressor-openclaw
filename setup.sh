#!/usr/bin/env bash
# setup.sh — One-command bootstrap for Johnny prompt compressor
# Usage: ./setup.sh [--skip-model] [--skip-plugin]
#
# Steps:
#   1. Check Ollama is installed
#   2. Check Ollama is running (attempt to start if not)
#   3. Create the johnny model from Modelfile (if missing)
#   4. Install the OpenClaw plugin (if openclaw CLI available)

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SKIP_MODEL=false
SKIP_PLUGIN=false

for arg in "$@"; do
  case "$arg" in
    --skip-model)  SKIP_MODEL=true ;;
    --skip-plugin) SKIP_PLUGIN=true ;;
    --help|-h)
      echo "Usage: ./setup.sh [--skip-model] [--skip-plugin]"
      echo ""
      echo "  --skip-model   Skip Ollama model creation"
      echo "  --skip-plugin  Skip OpenClaw plugin installation"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./setup.sh [--skip-model] [--skip-plugin]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELFILE="$SCRIPT_DIR/core/Modelfile"

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; }

echo -e "${BOLD}Johnny Setup${NC}"
echo ""

# --- 1. Check Ollama installed ---
info "Checking for Ollama..."
if command -v ollama &>/dev/null; then
  ok "Ollama found: $(command -v ollama)"
else
  fail "Ollama is not installed."
  echo ""
  echo "  Install Ollama:"
  echo "    macOS:  brew install ollama"
  echo "    Linux:  curl -fsSL https://ollama.com/install.sh | sh"
  echo "    Other:  https://ollama.com/download"
  echo ""
  exit 1
fi

# --- 2. Check Ollama running ---
info "Checking if Ollama is running..."
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama is running."
else
  warn "Ollama is not responding. Attempting to start..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!

  # Wait up to 10 seconds for Ollama to start
  for i in $(seq 1 10); do
    if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      ok "Ollama started (pid $OLLAMA_PID)."
      break
    fi
    sleep 1
  done

  if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    fail "Could not start Ollama. Start it manually: ollama serve"
    exit 1
  fi
fi

# --- 3. Create johnny model ---
if [ "$SKIP_MODEL" = false ]; then
  info "Checking for johnny model..."

  if ollama list 2>/dev/null | grep -q "^johnny"; then
    ok "Model 'johnny' already exists."
  else
    if [ ! -f "$MODELFILE" ]; then
      fail "Modelfile not found at: $MODELFILE"
      echo "  Make sure you're running setup.sh from the johnny-compressor-openclaw directory."
      exit 1
    fi

    info "Creating johnny model from Modelfile..."
    if ollama create johnny -f "$MODELFILE"; then
      ok "Model 'johnny' created."
    else
      fail "Failed to create johnny model."
      echo "  Try manually: ollama create johnny -f core/Modelfile"
      exit 1
    fi
  fi
else
  info "Skipping model creation (--skip-model)."
fi

# --- 4. Install OpenClaw plugin ---
if [ "$SKIP_PLUGIN" = false ]; then
  info "Checking for OpenClaw CLI..."

  if command -v openclaw &>/dev/null; then
    ok "OpenClaw CLI found: $(command -v openclaw)"
    info "Installing Johnny plugin..."

    if openclaw plugins install "$SCRIPT_DIR/openclaw"; then
      ok "Johnny plugin installed."
    else
      warn "Plugin install failed. You can install manually:"
      echo "  openclaw plugins install $SCRIPT_DIR/openclaw"
    fi
  else
    info "OpenClaw CLI not found. Skipping plugin install."
    echo ""
    echo "  To install manually when openclaw is available:"
    echo "    openclaw plugins install $SCRIPT_DIR/openclaw"
  fi
else
  info "Skipping plugin installation (--skip-plugin)."
fi

# --- Summary ---
echo ""
echo -e "${BOLD}Setup complete!${NC}"
echo ""
echo "  Next steps:"
echo "    - Test compression:  echo 'your verbose prompt' | ollama run johnny"
echo "    - CLI tool:          ./core/compress -v 'your verbose prompt'"
if command -v openclaw &>/dev/null 2>&1 && [ "$SKIP_PLUGIN" = false ]; then
  echo "    - OpenClaw:          /johnny status"
fi
echo ""
