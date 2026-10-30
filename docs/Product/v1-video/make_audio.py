"""Generate one narration clip per scene with Kokoro TTS.

Usage: python3 make_audio.py <model_dir> <narration.json> <out_dir> [voice]
Writes <out_dir>/<id>.wav and <out_dir>/durations.json.
"""
import json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

model_dir, narration, out_dir = sys.argv[1:4]
voice = sys.argv[4] if len(sys.argv) > 4 else "am_michael"
os.makedirs(out_dir, exist_ok=True)
k = Kokoro(os.path.join(model_dir, "kokoro.onnx"), os.path.join(model_dir, "voices-v1.0.bin"))
durations = {}
for scene in json.load(open(narration)):
    samples, rate = k.create(scene["text"], voice=voice, speed=1.0, lang="en-us")
    sf.write(os.path.join(out_dir, scene["id"] + ".wav"), samples, rate)
    durations[scene["id"]] = round(len(samples) / rate, 3)
    print(scene["id"], durations[scene["id"]])
json.dump(durations, open(os.path.join(out_dir, "durations.json"), "w"), indent=2)
