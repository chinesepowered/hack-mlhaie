#!/usr/bin/env bash
# One-command re-render of the CapyWorks demo video.
# Usage (from anywhere): bash video/scripts/render.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1 HYPERFRAMES_NO_OPTIONAL_INSTALL=1
headless_shell=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
if [[ -x "$headless_shell" ]]; then
  export HYPERFRAMES_BROWSER_PATH="$headless_shell" PRODUCER_LOW_MEMORY_MODE=false
fi

[[ -d node_modules ]] || pnpm install --frozen-lockfile
node build.mjs
pnpm exec hyperframes lint
pnpm exec hyperframes render --output out/capyworks-demo.mp4 --quiet
ffprobe -v error -show_entries format=duration,size -of compact out/capyworks-demo.mp4
