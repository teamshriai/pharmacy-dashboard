#!/usr/bin/env bash
# Downloads the offline speech model used by the Dashboard To-do (voice) into
# public/voice/, packed the way vosk-browser expects (a .tar.gz of the model folder).
# About 36 MB. Run once before `npm run build`; the file is not kept in git.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=vosk-model-small-en-in-0.4
OUT=public/voice/$NAME.tar.gz
if [ -f "$OUT" ]; then echo "Already there: $OUT"; exit 0; fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "Downloading $NAME (about 36 MB)…"
curl -fL --retry 3 -o "$TMP/model.zip" "https://alphacephei.com/vosk/models/$NAME.zip"
unzip -q "$TMP/model.zip" -d "$TMP"
mkdir -p public/voice
tar -czf "$OUT" -C "$TMP" "$NAME"
echo "Saved $OUT ($(du -h "$OUT" | cut -f1))"
