# V1 walkthrough video

A narrated, ~3 minute wireframe video of graphics V1: one job from estimate to paid invoice,
then division terminology and what is not in V1.

| File | What it is |
|---|---|
| `v1-walkthrough.mp4` | The rendered video |
| `screens.html` | The wireframe screens plus the scripted cursor (`SCENES`) |
| `narration.json` | Voiceover text, one entry per scene. Scene ids match `SCENES` |
| `make_audio.py` | Turns `narration.json` into one WAV per scene (Kokoro TTS, offline) |
| `record.mjs` | Plays each scene in Chromium, records it, lays the narration under it |

## Rebuild

```sh
pip install kokoro-onnx soundfile
# model files: kokoro-v1.0.int8.onnx (saved as kokoro.onnx) and voices-v1.0.bin
# from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
python3 make_audio.py <model_dir> narration.json <audio_dir> [voice]
node record.mjs <audio_dir> v1-walkthrough.mp4
```

Changing narration: edit `narration.json`, rerun both steps. A scene lasts as long as its
narration or its on-screen actions, whichever is longer.

Terminology lives in `DIVISIONS` at the top of `screens.html`. The UI reads all division-specific
words (work record, board, stages, asset types, field worker) from there.
