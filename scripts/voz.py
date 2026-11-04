"""Genera la voz en off (Kokoro TTS, voz ef_dora) y un archivo de tiempos por escena."""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
model_dir = sys.argv[1]
k = Kokoro(f"{model_dir}/kokoro-v1.0.onnx", f"{model_dir}/voices-v1.0.bin")
segs = json.load(open("scripts/guion.json"))
SR = 24000
LEAD, GAP = 0.6, 0.45
out = [np.zeros(int(LEAD*SR), np.float32)]
t = LEAD; timeline = []
for s in segs:
    a, sr = k.create(s["text"], voice="ef_dora", speed=1.08, lang="es")
    assert sr == SR
    a = a.astype(np.float32); a /= max(1e-6, np.abs(a).max()); a *= 0.9
    d = len(a)/SR
    timeline.append({**s, "start": round(t,3), "end": round(t+d,3)})
    gap = GAP + s.get("pause", 0)
    out += [a, np.zeros(int(gap*SR), np.float32)]
    t += d + gap
out.append(np.zeros(int(1.2*SR), np.float32))
audio = np.concatenate(out)
sf.write("audio/voz.wav", audio, SR)
json.dump({"duration": round(len(audio)/SR,3), "segments": timeline}, open("scene/timeline.json","w"), ensure_ascii=False, indent=1)
for s in timeline: print(f'{s["start"]:6.2f}-{s["end"]:6.2f} {s["id"]}')
print("total", len(audio)/SR)
