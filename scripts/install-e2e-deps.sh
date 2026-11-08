#!/usr/bin/env bash
# System packages for headless Obsidian E2E tests (Xvfb + Electron runtime libraries).
# Idempotent; run by the devcontainer's postCreateCommand.
set -euo pipefail

packages=(
  xvfb xauth
  libnss3 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libxtst6 libsecret-1-0
  libdrm2 libxkbcommon0 libatk-bridge2.0-0t64 libcups2t64
)

if dpkg -s "${packages[@]}" >/dev/null 2>&1; then
  echo "E2E dependencies already installed"
  exit 0
fi

sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${packages[@]}"
