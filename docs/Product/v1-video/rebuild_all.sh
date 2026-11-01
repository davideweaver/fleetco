#!/usr/bin/env bash
# Rebuilds every V1 guide video and picture from source.
# Usage: ./rebuild_all.sh <kokoro_model_dir> <scratch_dir>
# Runs narration first, then records videos in two parallel lanes, then shoots all pictures.
set -euo pipefail
cd "$(dirname "$0")"
M=$1; W=$2; OUT=../v1-index/media
mkdir -p "$W"

# id | narration | page | output
VIDEOS=(
  "overview|narration.json|screens.html|v1-walkthrough.mp4"
  "tech|narration-doing-the-job.json|screens.html|doing-the-job.mp4"
  "1.1|flows/1-estimates/1.1.json|flows/1-estimates/1-estimates.html|$OUT/1.1.mp4"
  "1.3|flows/1-estimates/1.3.json|flows/1-estimates/1-estimates.html|$OUT/1.3.mp4"
  "2.2|flows/2-jobs/2.2.json|flows/2-jobs/2-jobs.html|$OUT/2.2.mp4"
  "4.1|flows/4-invoicing/4.1.json|flows/4-invoicing/4-invoicing.html|$OUT/4.1.mp4"
  "4.3|flows/4-invoicing/4.3.json|flows/4-invoicing/4-invoicing.html|$OUT/4.3.mp4"
  "5.3|flows/5-materials/5.3.json|flows/5-materials/5-materials.html|$OUT/5.3.mp4"
  "6.1|flows/6-payroll/6.1.json|flows/6-payroll/6-payroll.html|$OUT/6.1.mp4"
  "8.1|flows/8-setup/8.1.json|flows/8-setup/8-setup.html|$OUT/8.1.mp4"
)

for v in "${VIDEOS[@]}"; do IFS="|" read -r id nar page out <<<"$v"
  python3 -I make_audio.py "$M" "$nar" "$W/audio-$id" >/dev/null 2>&1; echo "audio $id"; done

lane() { for v in "$@"; do IFS="|" read -r id nar page out <<<"$v"
  node record.mjs "$W/audio-$id" "$out" "$nar" "$page" > "$W/rec-$id.log" 2>&1 && echo "video $id $(grep -o '([0-9.]*s)' "$W/rec-$id.log")"; done; }
lane "${VIDEOS[@]:0:5}" & lane "${VIDEOS[@]:5}" & wait

for m in flows/*/manifest.json; do
  page=$(ls "$(dirname "$m")"/*.html | head -1)
  ids=$(python3 -c "import json,sys;print(' '.join(e['key'] for e in json.load(open(sys.argv[1])) if e['kind']=='picture'))" "$m")
  [ -n "$ids" ] && node shoot.mjs "$page" "$OUT" $ids | tr '\n' ' ' && echo
done
