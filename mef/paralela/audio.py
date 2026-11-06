"""MEF #3 compresión paralela (tiempos de mef/paralela/make.py). Mezcla final MEF: voz en off + loop de techno sintetizado a 130 BPM + efectos.
La música pasa por un compresor real (numpy) y se alterna entre versiones
SECA / COMPRIMIDA / SOBRECOMPRIMIDA siguiendo lo que se ve en pantalla, todas al mismo pico:
así se escucha que "bajar los picos" suena más fuerte.  Uso: python3 mef/paralela/audio.py"""
import json, re, unicodedata
import numpy as np, soundfile as sf

SR = 48000
TL = json.load(open("mef/paralela/scene/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}; ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]; N = int(DUR * SR)
rng = np.random.default_rng(7)
BPM = 130; B = 60 / BPM

# --- tiempos por palabra (misma fórmula que main.js)
def words(s):
    ws = s["text"].split(); out = []
    w = [len(x) + 1 + (5 if re.search(r"[,.:;!?…]$", x) else 0) for x in ws]
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
    RANGES[sid] = (SEG[sid]["start"] - 0.15 if i else 0, SEG[ORDER[i + 1]]["start"] - 0.15 if i < len(ORDER) - 1 else DUR)

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
# bus paralelo: aplastado (threshold bajo, 10:1, attack 1 ms, release 115 ms) + make-up
PARm = at_peak(np.tanh(2.5 * at_peak(compressor(DRYm, -30, 10, 0.001, 0.115), 0)), -1)
# EQ del bus paralelo: corte < 100 Hz (2 polos) y brillo en medias altas
rmsv = lambda x: np.sqrt(np.mean(x[: 10 * SR] ** 2))
PEQ = hp(hp(PARm, 100), 100); PEQ = PEQ + 0.5 * hp(lp(PEQ, 5000), 2500)
PEQm = np.tanh(1.5 * PEQ * rmsv(PARm) / rmsv(PEQ)) / 1.5 * 0.9   # mismo volumen que el bus sin EQ
def summ(g):  # original + bus paralelo, igualada en volumen al original (comparar a mismo volumen)
    s = DRYm + g * 0.55 * PEQm; return s * (rmsv(DRYm) / rmsv(s))
SUMm = summ(1.0)
print("RMS dB  seca %.1f | paralelo %.1f | paralelo+EQ %.1f | suma %.1f" % tuple(20 * np.log10(rmsv(x)) for x in (DRYm, PARm, PEQm, SUMm)))

def ramp(t, a, b): return np.clip((t - a) / max(1e-3, b - a), 0, 1)
tt = T(N)
S = lambda i: RANGES[i][0]
k4 = ramp(tt, wt("t4", "aplasta"), wt("t4", "aplasta") + 0.6)
k2 = ramp(tt, wt("t2", "corta"), wt("t2", "corta") + 0.6)
music = DRYm.copy()
m = (tt >= S("t4")) & (tt < S("t3")); music[m] = ((1 - k4) * DRYm + k4 * PARm)[m]
m = (tt >= S("t3")) & (tt < S("t2")); music[m] = PARm[m]
m = (tt >= S("t2")) & (tt < S("t1")); music[m] = ((1 - k2) * PARm + k2 * PEQm)[m]
# tip 1: el fader del bus sube (−∞ → arriba → un poco abajo), igual que en pantalla; luego A/B a mismo volumen
lvl = 0.92 * ramp(tt, wt("t1", "subelo"), wt("t1", "subelo") + 1.1)
lvl = np.where(tt > wt("t1", "bajalo"), lvl + (0.7 - 0.92) * ramp(tt, wt("t1", "bajalo"), wt("t1", "bajalo") + 0.6), lvl)
lvl = lvl / 0.7
tc = wt("t1", "compara") - 0.2
ab = (np.floor((tt - (tc + 0.2)) / (2 * B)) % 2 == 0) & (tt > tc + 0.2)
blend = DRYm + lvl * 0.55 * PEQm
blend = blend * (rmsv(DRYm) / rmsv(DRYm + 0.55 * PEQm)) ** np.clip(lvl, 0, 1)
m = (tt >= S("t1")) & (tt < S("marca")); music[m] = np.where(ab, DRYm, blend)[m]
m = tt >= S("marca"); music[m] = SUMm[m]

# ---------------------------------------------------------------- voz + ducking
v, vsr = sf.read("mef/paralela/audio/voz.wav"); assert vsr == 24000
v = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v)[:N]
v = np.pad(v, (0, N - len(v)))
venv = np.convolve(np.abs(v), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same")
duck = np.clip(venv / 0.04, 0, 1); duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
# en los momentos de "escucha la diferencia" se baja menos la música
demo = np.zeros(N)
for i in ("hook", "t4", "t1"): demo[(tt >= RANGES[i][0]) & (tt < RANGES[i][1])] = 1
mgain = 10 ** ((-7 - (1 - demo) * 4) * duck / 20) * 0.42
fade = np.clip(tt / 0.02, 0, 1) * np.clip((DUR - tt) / 1.2, 0, 1)
mix = music * mgain * fade + v * 0.95

# ---------------------------------------------------------------- efectos
fx = np.zeros(N + SR)
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
place(fx, boom(), 0.02, 0.5)
for j in range(6): place(fx, tick(), wt("t3", "atak") + j * 0.08)
for j in range(6): place(fx, tick(), wt("t3", "rilis") + j * 0.08)
place(fx, boom(), wt("t4", "aplasta") + 0.1, 0.7)
place(fx, riser(1.6), wt("marca", "mef") - 1.6)
place(fx, pop_(), wt("cta", "guarda")); place(fx, pop_(), wt("cta", "siguenos"))
mix += fx[:N]
mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.97; mix /= max(1.0, np.abs(mix).max() / 0.95)
sf.write("mef/editorial/output/mezcla_paralela.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("ok", DUR, "s, pico", np.abs(mix).max())
