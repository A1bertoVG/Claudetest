"""Voz en off (Kokoro em_alex, rápida: energía brain rot). Uso: python3 brainrot/voz.py MODEL_DIR"""
import json, sys, numpy as np, soundfile as sf
sys.path.insert(0, "brainrot"); from guion import SEGS
from kokoro_onnx import Kokoro
k = Kokoro(f"{sys.argv[1]}/kokoro-v1.0.onnx", f"{sys.argv[1]}/voices-v1.0.bin")
SR = 24000; t = 0.35; out = [np.zeros(int(t * SR), np.float32)]; tl = []
for sid, text, sub, vis in SEGS:
    a, _ = k.create(text, voice="em_alex", speed=1.28, lang="es"); a = a.astype(np.float32)
    nz = np.where(np.abs(a) > 0.01 * np.abs(a).max())[0]; a = a[max(0, nz[0] - 200): nz[-1] + 900]
    a = a / np.abs(a).max() * 0.92; d = len(a) / SR
    tl.append({"id": sid, "text": text, "sub": sub, "vis": vis, "start": round(t, 3), "end": round(t + d, 3)})
    gap = 0.12 if sid not in ("launch",) else 0.25
    if sid == "audio": gap = 1.0   # respiro antes del drop de "Claude 5"
    out += [a, np.zeros(int(gap * SR), np.float32)]; t += d + gap
out.append(np.zeros(int(2.4 * SR), np.float32)); audio = np.concatenate(out)
sf.write("brainrot/build/voz.wav", audio, SR)
json.dump({"duration": round(len(audio) / SR, 3), "segments": tl}, open("brainrot/build/timeline.json", "w"), ensure_ascii=False, indent=1)
for s in tl: print(f'{s["start"]:6.2f}-{s["end"]:6.2f} {s["id"]}')
print("total", len(audio) / SR)
