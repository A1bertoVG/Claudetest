"""Voz en off masculina (Kokoro TTS, voz em_alex, español) + tiempos por frase.
Uso (desde la raíz del repo): python3 mef/arpegios/scripts/voz.py MODEL_DIR"""
import json, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
model_dir = sys.argv[1]; VOICE = sys.argv[2] if len(sys.argv) > 2 else "em_alex"
k = Kokoro(f"{model_dir}/kokoro-v1.0.onnx", f"{model_dir}/voices-v1.0.bin")
segs = json.load(open("mef/arpegios/scripts/guion.json"))
SR = 24000
LEAD, GAP = 0.12, 0.32   # la voz entra casi en el cuadro 1 (gancho)
out = [np.zeros(int(LEAD*SR), np.float32)]
t = LEAD; timeline = []
for s in segs:
    a, sr = k.create(s["text"], voice=VOICE, speed=1.12, lang="es")
    assert sr == SR
    a = a.astype(np.float32)
    # recorta silencios del TTS al inicio y final
    nz = np.where(np.abs(a) > 0.01 * np.abs(a).max())[0]; a = a[max(0, nz[0]-240): nz[-1]+1200]
    a /= max(1e-6, np.abs(a).max()); a *= 0.9
    d = len(a)/SR
    timeline.append({**s, "start": round(t,3), "end": round(t+d,3)})
    gap = GAP + s.get("pause", 0)
    out += [a, np.zeros(int(gap*SR), np.float32)]
    t += d + gap
out.append(np.zeros(int(2.0*SR), np.float32))
audio = np.concatenate(out)
sf.write("mef/arpegios/audio/voz.wav", audio, SR)
json.dump({"duration": round(len(audio)/SR,3), "segments": timeline}, open("mef/arpegios/scene/timeline.json","w"), ensure_ascii=False, indent=1)
for s in timeline: print(f'{s["start"]:6.2f}-{s["end"]:6.2f} {s["id"]}')
print("total", len(audio)/SR)
