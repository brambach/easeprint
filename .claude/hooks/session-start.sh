#!/bin/bash
# Installs dependencies in Claude Code cloud sessions so tests, lint and build work straight away.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
pnpm install --frozen-lockfile || pnpm install
