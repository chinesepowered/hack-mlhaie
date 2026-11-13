#!/usr/bin/env bash
# One-command re-render of the CapyWorks demo video.
# Usage (from anywhere): bash video/scripts/render.sh [--mix-only]
#   --mix-only  re-mix the music over the last voice-only render, without re-rendering the picture
#
# 1. build.mjs fills the composition with run data and narration timings
# 2. HyperFrames renders the picture and the narration
# 3. ffmpeg lays audio/music.mp3 underneath: about 19 dB below the speech, ducked further
#    while Capy talks (sidechain keyed by the narration), 1.5 s fade-in, 3 s fade-out
set -euo pipefail
cd "$(dirname "$0")/.."

export HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1 HYPERFRAMES_NO_OPTIONAL_INSTALL=1
headless_shell=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
if [[ -x "$headless_shell" ]]; then
  export HYPERFRAMES_BROWSER_PATH="$headless_shell" PRODUCER_LOW_MEMORY_MODE=false
fi

MUSIC_UNDER_VOICE_DB=15  # vs the voice track's mean, which includes pauses: lands ~19 dB under speech
voice_cut=.hyperframes/capyworks-voice.mp4  # kept (gitignored) so --mix-only can re-mix
final=out/capyworks-demo.mp4

if [[ "${1:-}" != "--mix-only" ]]; then
  [[ -d node_modules ]] || npm install --no-audit --no-fund
  node build.mjs
  npx hyperframes lint
  mkdir -p .hyperframes
  npx hyperframes render --output "$voice_cut" --quiet
fi

mean_db() {
  ffmpeg -hide_banner -nostats -i "$1" -map 0:a:0 -af volumedetect -f null - 2>&1 |
    sed -n 's/.*mean_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p'
}

if [[ -f audio/music.mp3 ]]; then
  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$voice_cut")
  voice_db=$(mean_db "$voice_cut")
  music_db=$(mean_db audio/music.mp3)
  gain_db=$(python3 -c "print(round(${voice_db} - ${MUSIC_UNDER_VOICE_DB} - (${music_db}), 2))")
  fade_out_at=$(python3 -c "print(round(max(0.0, ${duration} - 3), 3))")
  ffmpeg -y -loglevel error -i "$voice_cut" -i audio/music.mp3 -filter_complex "\
[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${gain_db}dB,afade=t=in:st=0:d=1.5,afade=t=out:st=${fade_out_at}:d=3[music];\
[0:a]asplit=2[voice][key];\
[music][key]sidechaincompress=threshold=0.03:ratio=3:attack=25:release=500[ducked];\
[voice][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mix]" \
    -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$final"
  echo "music: ${gain_db} dB gain (voice mean ${voice_db} dB, music mean ${music_db} dB), ducked under the narration"
else
  cp "$voice_cut" "$final"
fi

ffprobe -v error -show_entries format=duration,size -of compact "$final"
