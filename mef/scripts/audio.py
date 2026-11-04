"""Mezcla final MEF: voz en off + loop de techno sintetizado a 130 BPM + efectos.
La música pasa por un compresor real (numpy) y se alterna entre versiones
SECA / COMPRIMIDA / SOBRECOMPRIMIDA siguiendo lo que se ve en pantalla, todas al mismo pico:
así se escucha que "bajar los picos" suena más fuerte.  Uso: python3 mef/scripts/audio.py"""
import json, re, unicodedata
import numpy as np, soundfile as sf

SR = 48000
TL = json.load(open("mef/scene/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}; ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]; N = int(DUR * SR)
rng = np.random.default_rng(7)
BPM = 130; B = 60 / BPM

# --- tiempos por palabra (misma fórmula que main.js)
def words(s):
    ws = s["text"].split(); out = []
    w = [(7 * len(re.sub(r"\D", "", x)) / 1.6 + 3 if re.search(r"\d", x) else len(x)) + 1 + (6 if re.search(r"[,.;:]$", x) else 0) + (4 if re.search(r"[?!]$", x) else 0) for x in ws]
    tot, d, acc = sum(w), s["end"] - s["start"], 0
    for x, wi in zip(ws, w): out.append((x, s["start"] + acc / tot * d)); acc += wi
    return out
WORDS = {s["id"]: words(s) for s in TL["segments"]}
norm = lambda s: re.sub(r"[^a-zñ0-9]", "", "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"))
def wt(i, p, nth=0):
    n = 0
    for x, t in WORDS[i]:
        if norm(x).startswith(norm(p)):
            if n == nth: return t
            n += 1
    return SEG[i]["start"]
RANGES = {}
for i, sid in enumerate(ORDER):
    RANGES[sid] = (SEG[sid]["start"] - 0.22 if i else 0, SEG[ORDER[i + 1]]["start"] - 0.22 if i < len(ORDER) - 1 else DUR)

T = lambda n: np.arange(n) / SR
def place(buf, x, t, g=1.0):
    i = int(t * SR); j = min(len(buf), i + len(x))
    if 0 <= i < len(buf) and j > i: buf[i:j] += x[: j - i] * g
def lp(x, fc):  # filtro pasa-bajos de un polo (vectorizado por bloques vía lfilter manual)
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y
def hp(x, fc): return x - lp(x, fc)

# ---------------------------------------------------------------- sonidos
def kick():
    n = int(0.42 * SR); t = T(n)
    f = 46 + 120 * np.exp(-t / 0.035); ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22) * np.minimum(1, t / 0.002)
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.0 * (body + click))
def clap():
    n = int(0.3 * SR); t = T(n); nz = rng.standard_normal(n)
    nz = hp(lp(nz, 2600), 900)
    e = np.zeros(n)
    for d in (0, 0.011, 0.022): e += np.exp(-np.maximum(0, t - d) / 0.006) * (t >= d)
    e += 0.7 * np.exp(-np.maximum(0, t - 0.03) / 0.09) * (t >= 0.03)
    return nz * e * 1.6
def hat(dec):
    n = int(0.25 * SR); t = T(n); return hp(rng.standard_normal(n), 7000) * np.exp(-t / dec)
def bass_note(f, dur=0.1):
    n = int(dur * SR); t = T(n); saw = 2 * ((f * t) % 1) - 1
    return lp(saw, 420) * np.exp(-t / 0.07) * np.minimum(1, t / 0.003)
def stab():
    n = int(0.9 * SR); t = T(n); x = np.zeros(n)
    for f in (220, 261.6, 329.6, 392):
        for dt in (-0.6, 0.6): x += 2 * (((f * (1 + dt / 100)) * t) % 1) - 1
    x = lp(x / 8, 1400) * np.exp(-t / 0.18)
    y = x.copy()  # eco a 3/16
    d = int(B * 0.75 * SR); y[d:] += 0.45 * x[:-d]
    return y

K, CL, HC, HO, ST = kick(), clap(), hat(0.018), hat(0.09), stab()
BN = {f: bass_note(f) for f in (55.0, 65.4)}
drums = np.zeros(N + SR); bass = np.zeros(N + SR); syn = np.zeros(N + SR)
nb = int(DUR / B) + 2
for n in range(nb):
    t0 = n * B
    place(drums, K, t0, 1.0)
    if n % 2 == 1: place(drums, CL, t0, 0.55)
    place(drums, HO, t0 + B / 2, 0.16)
    for s16 in range(4): place(drums, HC, t0 + s16 * B / 4, 0.07 + 0.05 * (s16 % 2))
    for s16 in (1, 2, 3):
        f = 65.4 if (n // 8) % 2 and s16 == 3 else 55.0
        place(bass, BN[f], t0 + s16 * B / 4, 0.55)
    if n % 8 == 6: place(syn, ST, t0 + B * 0.5, 0.35)
bus = drums + bass + 0.8 * syn
bus = bus[:N]

# ---------------------------------------------------------------- compresor (dB, envolvente con attack/release)
def compressor(x, thr_db, ratio, att, rel, hop=16):
    pk = np.abs(x[: len(x) // hop * hop]).reshape(-1, hop).max(1)
    lvl = 20 * np.log10(pk + 1e-9)
    over = np.maximum(0, lvl - thr_db); target = over * (1 - 1 / ratio)
    aA = np.exp(-hop / (att * SR)); aR = np.exp(-hop / (rel * SR)); g = np.empty_like(target); acc = 0.0
    for i, v in enumerate(target):
        a = aA if v > acc else aR; acc = a * acc + (1 - a) * v; g[i] = acc
    gain = 10 ** (-np.repeat(g, hop) / 20)
    gain = np.concatenate([gain, np.full(len(x) - len(gain), gain[-1])])
    return x * gain
def at_peak(x, db=-1.0):  # mismo techo para todas las versiones
    return x / np.abs(x).max() * 10 ** (db / 20)
DRYm = at_peak(bus)
HALFm = compressor(DRYm, -20, 5, 0.002, 0.115)         # picos abajo, sin make-up (mismo factor que la seca)
COMPm = at_peak(np.tanh(1.8 * at_peak(HALFm, 0)))      # + make-up gain hasta el mismo techo (con un toque de clip suave)
BRICKm = at_peak(np.tanh(4.0 * at_peak(compressor(DRYm, -34, 20, 0.0005, 0.02), 0)))
rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x[: 10 * SR] ** 2)))
print(f"RMS  seca {rms(DRYm):.1f} dB | comprimida {rms(COMPm):.1f} dB | sobrecomprimida {rms(BRICKm):.1f} dB (pico -1 dBFS en todas)")

# ---------------------------------------------------------------- qué versión suena en cada momento (igual que el video)
def ramp(t, a, b): return np.clip((t - a) / max(1e-3, b - a), 0, 1)
tt = T(N); w = {k: np.zeros(N) for k in ("dry", "half", "comp", "brick")}
def seg_mask(i): a, b = RANGES[i]; return (tt >= a) & (tt < b)
def setw(i, **kw):
    m = seg_mask(i)
    for k, v in kw.items(): w[k][m] = v[m] if isinstance(v, np.ndarray) else v
S = lambda i: RANGES[i][0]
a = ramp(tt, 0.55, 1.25); b = ramp(tt, 1.35, 2.2)
setw("hook", dry=(1 - a), half=a * (1 - b), comp=b)
setw("promesa", comp=1.0)
k = ramp(tt, S("problema"), S("problema") + 0.5); setw("problema", comp=1 - k, dry=k)
k = ramp(tt, wt("concepto", "aplasta") - 0.3, wt("concepto", "aplasta") + 0.4); setw("concepto", dry=1 - k, half=k)
k = ramp(tt, wt("revelacion", "subes"), wt("revelacion", "subes") + 1.0); setw("revelacion", half=1 - k, comp=k)
setw("kick", comp=1.0); setw("bus", comp=1.0)
k = ramp(tt, wt("aviso", "aplastas") - 0.1, wt("aviso", "aplastas") + 0.25); setw("aviso", comp=1 - k, brick=k)
k = ramp(tt, S("marca") + 0.1, S("marca") + 1.2); setw("marca", brick=1 - k, comp=k)
setw("cta", comp=1.0)
music = w["dry"] * DRYm + w["half"] * HALFm + w["comp"] * COMPm + w["brick"] * BRICKm * 0.8

# ---------------------------------------------------------------- voz + ducking
v, vsr = sf.read("mef/audio/voz.wav"); assert vsr == 24000
v = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v)[:N]
v = np.pad(v, (0, N - len(v)))
venv = np.convolve(np.abs(v), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same")
duck = np.clip(venv / 0.04, 0, 1); duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
# en los momentos de "escucha la diferencia" se baja menos la música
demo = np.zeros(N)
for i in ("hook", "revelacion", "aviso"): demo[seg_mask(i)] = 1
mgain = 10 ** ((-7 - (1 - demo) * 4) * duck / 20) * 0.42
fade = np.clip(tt / 0.02, 0, 1) * np.clip((DUR - tt) / 1.2, 0, 1)
mix = music * mgain * fade + v * 0.95

# ---------------------------------------------------------------- efectos
fx = np.zeros(N + SR)
def whoosh(d=0.45, up=True):
    n = int(d * SR); t = T(n); nz = rng.standard_normal(n)
    x = hp(lp(nz, 3000), 300) * np.sin(np.pi * t / d) ** 2
    return x * 0.22
def boom():
    n = int(1.0 * SR); t = T(n); f = 30 + 60 * np.exp(-t / 0.08)
    return np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)) * 0.6 + lp(rng.standard_normal(n), 600) * np.exp(-t / 0.12) * 0.3
def tick():
    n = int(0.03 * SR); t = T(n); return np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.004) * 0.18
def riser(d):
    n = int(d * SR); t = T(n); nz = hp(rng.standard_normal(n), 1500)
    return nz * (t / d) ** 2 * 0.16
def pop_():
    n = int(0.12 * SR); t = T(n); f = 500 + 900 * t / 0.12
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04) * 0.25
WH = whoosh()
for i in ORDER[1:]: place(fx, WH, RANGES[i][0] - 0.2)
for j in range(10): place(fx, tick(), 0.3 + j * 0.1)                    # perilla del gancho
place(fx, boom(), 1.3, 0.7)                                              # bajar picos → sube todo
for p, nth in (("atak", 0), ("rilis", 0), ("reichio", 0)):
    for j in range(6): place(fx, tick(), wt("kick", p, nth) + j * 0.08)
for j in range(6): place(fx, tick(), wt("bus", "dos") + j * 0.08)
place(fx, boom(), wt("aviso", "aplastas"), 1.0)                          # golpe de la prensa
place(fx, riser(1.6), wt("marca", "mef") - 1.6)
place(fx, pop_(), wt("cta", "guarda")); place(fx, pop_(), wt("cta", "siguenos"))
mix += fx[:N]
mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.97
sf.write("mef/audio/mezcla.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("ok", DUR, "s, pico", np.abs(mix).max())
