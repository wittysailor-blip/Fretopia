#!/bin/sh
# Builds the guitar test fixtures from the app's sample set (sounds/guitar,
# University of Iowa MIS recordings via tonejs-instruments, CC BY 3.0):
# open strings, 48 kHz mono 16-bit WAV. Hashes are recorded in fixtures/SHA256SUMS.
set -e
cd "$(dirname "$0")"
mkdir -p fixtures
for n in E2 A2 D3 G3 B3 E4; do
  ffmpeg -loglevel error -y -i ../../sounds/guitar/$n.mp3 -ac 1 -ar 48000 -c:a pcm_s16le fixtures/guitar_$n.wav
done
(cd fixtures && sha256sum guitar_*.wav > SHA256SUMS)
