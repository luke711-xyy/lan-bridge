#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION_HINT="${NODE_VERSION_HINT:-20}"
ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ELECTRON_CACHE="${REPO_ROOT}/.electron-cache"
NPM_CACHE="${REPO_ROOT}/.npm-cache"

step() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "node was not found. Install Node.js ${NODE_VERSION_HINT}+ first, then rerun this script."
  fi

  if ! command -v npm >/dev/null 2>&1; then
    fail "npm was not found. Install Node.js ${NODE_VERSION_HINT}+ first, then rerun this script."
  fi
}

step "Checking node and npm"
ensure_node
printf 'node: %s\n' "$(node -v)"
printf 'npm:  %s\n' "$(npm -v)"

step "Configuring Electron mirror and caches"
mkdir -p "${ELECTRON_CACHE}" "${NPM_CACHE}"
export ELECTRON_MIRROR
export ELECTRON_CACHE
export npm_config_cache="${NPM_CACHE}"

step "Installing npm dependencies"
cd "${REPO_ROOT}"
npm install --no-audit --no-fund

step "Validating Electron binary"
npx electron --version

step "Validating project build"
npm run build

printf '\nSetup complete.\n'
printf 'Next steps:\n'
printf '1. cd "%s"\n' "${REPO_ROOT}"
printf '2. npm run dev\n'
