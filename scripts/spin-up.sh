#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
orchestrator="${script_dir}/spin-up.mjs"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Opsiforce Quickstart supports macOS only (detected $(uname -s))." >&2
  exit 1
fi

auto_yes=0
for arg in "$@"; do
  case "$arg" in
    -y | --yes) auto_yes=1 ;;
  esac
done

confirm() {
  if [ "$auto_yes" -eq 1 ]; then
    return 0
  fi
  printf '%s [Y/n] ' "$1" >&2
  read -r reply || reply=""
  case "$reply" in
    [Nn]*) return 1 ;;
    *) return 0 ;;
  esac
}

load_brew_shellenv() {
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_homebrew() {
  command -v brew >/dev/null 2>&1 && return 0
  load_brew_shellenv
  command -v brew >/dev/null 2>&1 && return 0

  echo "Opsiforce Quickstart installs prerequisites with Homebrew, which isn't installed yet." >&2
  if ! confirm "Install Homebrew now? It will prompt for your password."; then
    echo "Aborted. Install Homebrew from https://brew.sh and re-run 'yarn dev'." >&2
    exit 1
  fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  load_brew_shellenv
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew install did not complete. Install it from https://brew.sh and re-run 'yarn dev'." >&2
    exit 1
  fi
}

ensure_node() {
  command -v node >/dev/null 2>&1 && return 0

  echo "Node.js isn't installed yet; the Quickstart's orchestrator needs it to run." >&2
  if ! confirm "Install Node (brew install node@24) now?"; then
    echo "Aborted. Install Node 24 (e.g. 'brew install node@24') and re-run 'yarn dev'." >&2
    exit 1
  fi
  brew install node@24
  brew link --overwrite --force node@24 >/dev/null 2>&1 || true
  load_brew_shellenv
  if ! command -v node >/dev/null 2>&1; then
    echo "Node still isn't on PATH after install. Open a new terminal and re-run 'yarn dev'." >&2
    exit 1
  fi
}

ensure_homebrew
ensure_node

exec node "$orchestrator" "$@"
