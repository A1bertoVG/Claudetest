"""Mezcla final: voz en off + música sintetizada + efectos de sonido sincronizados con la escena.
Todo se genera con numpy (sin samples externos).
"""
import json, unicodedata, re
import numpy as np, soundfile as sf

SR = 48000
import sys
BASE = sys.argv[1] if len(sys.argv) > 1 else "."
TL = json.load(open(f"{BASE}/timeline.json" if BASE != "." else "scene/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}
ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]
N = int(DUR * SR) + SR
rng = np.random.default_rng(3)

# --- tiempos por palabra (misma fórmula que scene/main.js)
WORDS = {}
for s in TL["segments"]:
    ws = s["text"].split()
    w = [len(x) + 1 + (6 if re.search(r"[,.;:]$", x) else 0) + (4 if re.search(r"[?!]$", x) else 0) for x in ws]
    tot, d, acc, out = sum(w), s["end"] - s["start"], 0, []
    for x, wi in zip(ws, w):
        out.append((x, s["start"] + acc / tot * d)); acc += wi
    WORDS[s["id"]] = out
norm = lambda s: re.sub(r"[^a-zñ0-9]", "", "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"))
def wt(i, p):
    for x, t in WORDS[i]:
        if norm(x).startswith(norm(p)): return t
    return SEG[i]["start"]
RANGES = {}
for i, sid in enumerate(ORDER):
    a = SEG[sid]["start"] - 0.25 if i else 0
    b = SEG[ORDER[i + 1]]["start"] - 0.25 if i < len(ORDER) - 1 else DUR
    RANGES[sid] = (a, b)

T = lambda n: np.arange(n) / SR
def env(n, a=0.005, r=0.2):
    t = T(n); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r); return e
def place(buf, x, t, g=1.0):
    i = int(t * SR); j = min(len(buf), i + len(x))
    if i < len(buf) and j > i: buf[i:j] += x[: j - i] * g
def lowpass(x, a):  # filtro de un polo
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc += a * (x[i] - acc); y[i] = acc
    return y

# --- efectos
def boom():
    n = int(1.2 * SR); t = T(n); f = 90 * np.exp(-t * 3) + 38
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    x += lowpass(rng.normal(0, 1, n), 0.05) * np.exp(-t * 9) * 0.8
    return x * 0.9
def whoosh(d=0.45):
    n = int(d * SR); t = T(n); x = rng.normal(0, 1, n)
    a = 0.02 + 0.25 * np.sin(np.pi * t / d) ** 2; y = np.empty(n); acc = 0.0
    for i in range(n): acc += a[i] * (x[i] - acc); y[i] = acc
    return y * np.sin(np.pi * t / d) ** 1.5 * 0.7
def pluck(f, d=0.9):
    # Karplus-Strong (cuerda pulsada tipo ukelele)
    n = int(d * SR); p = max(2, int(SR / f)); buf = list(rng.uniform(-1, 1, p)); out = np.empty(n)
    for i in range(n):
        j = i % p; out[i] = buf[j]; buf[j] = 0.5 * (buf[j] + buf[(j + 1) % p]) * 0.996
    return out * env(n, 0.002, d * 0.5)
def bell(f, d=0.7):
    n = int(d * SR); t = T(n)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t)) * env(n, 0.002, d * 0.35) * 0.5
def chime(base=1046.5):
    out = np.zeros(int(1.2 * SR))
    for k, m in enumerate([1, 1.25, 1.5, 2.0]): place(out, bell(base * m, 0.8), k * 0.07, 0.6)
    return out
def popfx():
    n = int(0.12 * SR); t = T(n); f = 300 + 900 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.035) * 0.8
def swish():
    n = int(0.35 * SR); t = T(n); x = rng.normal(0, 1, n); x = x - lowpass(x, 0.15)
    return x * np.sin(np.pi * t / 0.35) ** 2 * 0.25
def buzzer():
    n = int(0.45 * SR); t = T(n); x = np.sign(np.sin(2 * np.pi * 140 * t)) * 0.5 + np.sign(np.sin(2 * np.pi * 147 * t)) * 0.5
    return lowpass(x, 0.2) * env(n, 0.01, 0.3) * 0.45
def snip():
    n = int(0.08 * SR); t = T(n); x = rng.normal(0, 1, n); x = x - lowpass(x, 0.3)
    return (x * 0.6 + np.sin(2 * np.pi * 3200 * t) * 0.5) * env(n, 0.0005, 0.02) * 0.6
def click():
    n = int(0.05 * SR); t = T(n); return np.sin(2 * np.pi * 1800 * t) * env(n, 0.0005, 0.01) * 0.8
def tension():  # tirón grave
    n = int(0.5 * SR); t = T(n); f = 70 + 40 * np.sin(np.pi * t / 0.5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.5) * 0.5

sfx = np.zeros(N)
# Manual CANIS: sin efectos agresivos. Transiciones discretas.
for sid in ORDER[1:]: place(sfx, whoosh(), RANGES[sid][0] - 0.3, 0.3)
place(sfx, whoosh(), RANGES["resultado"][0] + 1.3 - 0.3, 0.3)
for k in range(10): place(sfx, snip(), 0.3 + k * 0.22, 0.12)          # rascado
place(sfx, chime(1318.5), wt("dato", "dato"), 0.3)
for i in range(6): place(sfx, popfx(), wt("dato", "reseca") + 0.3 + i * 0.25, 0.18)
place(sfx, chime(1318.5), RANGES["promesa"][0] + 0.5, 0.3)
for w in ["escamitas", "opaco", "reseca"]: place(sfx, click(), wt("senales", w), 0.4)
for w in ["piel", "poco", "enjuague"]: place(sfx, popfx(), wt("causas", w), 0.45)
r0 = RANGES["error"][0]
place(sfx, click(), r0 + 0.1, 0.6); place(sfx, chime(1046.5), r0 + 0.3, 0.45)
place(sfx, popfx(), wt("error", "propio"), 0.5)
for i in range(6): place(sfx, bell(660 * 2 ** (i / 6), 0.3), wt("error", "ph") + i * 0.05, 0.15)
place(sfx, swish(), wt("canis", "banamos"), 0.5)
for i in range(8): place(sfx, popfx(), wt("canis", "banamos") + 0.2 + i * 0.12, 0.12)
for k in range(5): place(sfx, swish(), wt("canis", "enjuagamos") + k * 0.3, 0.35)
place(sfx, whoosh(1.2), wt("canis", "secamos"), 0.35)
for w in ["shampoo", "enjuagamos", "secamos"]: place(sfx, click(), wt("canis", w), 0.35)
r0 = RANGES["resultado"][0]
place(sfx, click(), r0 + 0.1, 0.7); place(sfx, chime(1046.5), r0 + 0.4, 0.55); place(sfx, chime(1568), r0 + 0.65, 0.35)
place(sfx, chime(1318.5), wt("resultado", "cindy"), 0.3)
place(sfx, popfx(), wt("aviso", "revisar") - 0.3, 0.5); place(sfx, click(), wt("aviso", "revisar"), 0.35); place(sfx, click(), wt("aviso", "revisar") + 0.15, 0.35)
place(sfx, popfx(), wt("cta", "agenda"), 0.55); place(sfx, popfx(), wt("cta", "escribenos"), 0.55)
place(sfx, chime(1046.5), RANGES["cierre"][0] + 0.1, 0.35)

# --- música: parte 1 tensa (pad menor), parte 2 alegre (ukelele pulsado)
mus = np.zeros(N)
nf = lambda m: 440 * 2 ** ((m - 69) / 12)
happy_t = RANGES["canis"][0] - 0.3
def pad(notes, d):
    n = int(d * SR); t = T(n); x = sum(np.sin(2 * np.pi * nf(m) * t + np.sin(2 * np.pi * 0.3 * t) * 0.5) for m in notes)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6); return x * a / len(notes)
t = 0.0
for ch in [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]] * 4:
    if t >= happy_t: break
    place(mus, pad(ch, 3.2), t, 0.5); t += 3.0
fade = np.clip((happy_t + 0.3 - np.arange(N) / SR) / 0.6, 0, 1); mus *= fade
bpm = 112; beat = 60 / bpm
prog = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]]  # C G Am F
cache = {}
t = happy_t; i = 0
while t < DUR:
    ch = prog[(i // 8) % 4]; pat = [1, 0, 1, 1, 0, 1, 1, 0][i % 8]
    if pat:
        for k, m in enumerate(ch):
            key = (m, 0.6)
            if key not in cache: cache[key] = pluck(nf(m), 0.6)
            place(mus, cache[key], t + k * 0.012, 0.22)
    if i % 2 == 0:
        bk = ("b", ch[0])
        if bk not in cache: cache[bk] = pad([ch[0] - 24], beat * 1.8) * 1.0
        place(mus, cache[bk], t, 0.35)
    if i % 8 == 4: place(mus, bell(nf(ch[2] + 12), 0.5), t, 0.12)
    t += beat / 2; i += 1
mus /= np.abs(mus).max() + 1e-9

# --- voz (24k -> 48k) y ducking
v, vsr = sf.read(f"{BASE}/voz.wav" if BASE != "." else "audio/voz.wav")
vx = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v)
voice = np.zeros(N); voice[: len(vx)] = vx
e = np.abs(voice); k = int(0.25 * SR)
e = np.convolve(e, np.ones(k) / k, mode="same"); duck = 1 - 0.55 * np.clip(e / 0.08, 0, 1)
mix = voice * 1.0 + mus * 0.16 * duck + sfx * 0.55
end = int(DUR * SR); mix = mix[:end]
mix[-int(0.8 * SR):] *= np.linspace(1, 0, int(0.8 * SR))
peak = np.abs(mix).max(); mix = mix / peak * 0.95
sf.write(f"{BASE}/mezcla.wav" if BASE != "." else "audio/mezcla.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("mezcla", len(mix) / SR, "s")
