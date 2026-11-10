"""MEF #4 rango dinámico (tiempos de mef/rango/make.py). Mezcla final MEF: voz en off + loop de techno sintetizado a 130 BPM + efectos.
La música pasa por un compresor real (numpy) y se alterna entre versiones
SECA / COMPRIMIDA / SOBRECOMPRIMIDA siguiendo lo que se ve en pantalla, todas al mismo pico:
así se escucha que "bajar los picos" suena más fuerte.  Uso: python3 mef/rango/audio.py"""
import json, re, unicodedata
import numpy as np, soundfile as sf

SR = 48000
TL = json.load(open("mef/rango/scene/timeline.json"))
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
drums = np.zeros(N + SR); kst = np.zeros(N + SR); bass = np.zeros(N + SR); syn = np.zeros(N + SR)
nb = int(DUR / B) + 2
for n in range(nb):
    t0 = n * B
    place(kst, K, t0, 1.0)
    if n % 2 == 1: place(drums, CL, t0, 0.55)
    place(drums, HO, t0 + B / 2, 0.16)
    for s16 in range(4): place(drums, HC, t0 + s16 * B / 4, 0.07 + 0.05 * (s16 % 2))
    for s16 in (1, 2, 3):
        f = 65.4 if (n // 8) % 2 and s16 == 3 else 55.0
        place(bass, BN[f], t0 + s16 * B / 4, 0.55)
    if n % 8 == 6: place(syn, ST, t0 + B * 0.5, 0.35)
bus = (drums + kst + bass + 0.8 * syn)[:N]
brk = (drums + 0.6 * bass + 1.3 * syn)[:N]   # break: sin kick

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
rmsv = lambda x: np.sqrt(np.mean(x[: 10 * SR] ** 2))
# máster aplastado (limitado a lo bestia) e IGUALADO al mismo loudness que el dinámico (como hace Spotify)
CRm = np.tanh(6 * at_peak(compressor(DRYm, -36, 20, 0.0005, 0.03), 0))
CRm = CRm * rmsv(DRYm) / rmsv(CRm)
BRKm = brk / np.abs(brk).max() * np.abs(DRYm).max()
BRK_hi = BRKm * rmsv(DRYm) / rmsv(BRKm)          # break igual de fuerte que el drop
BRK_lo = BRK_hi * 10 ** (-5 / 20)                # break 5 dB abajo
print("RMS dB  dinámico %.1f | aplastado %.1f (mismo loudness)" % (20 * np.log10(rmsv(DRYm)), 20 * np.log10(rmsv(CRm))))

def ramp(t, a, b): return np.clip((t - a) / max(1e-3, b - a), 0, 1)
tt = T(N)
S = lambda i: RANGES[i][0]
music = DRYm.copy()
# lo que no sabías: tras "bajan" se oye el aplastado normalizado; con "dinámica" vuelve el dinámico al mismo volumen
k = ramp(tt, wt("nosabias", "bajan"), wt("nosabias", "bajan") + 0.5) * (1 - ramp(tt, wt("nosabias", "dinamica"), wt("nosabias", "dinamica") + 0.4))
m = (tt >= S("nosabias")) & (tt < S("bucle1")); music[m] = ((1 - k) * DRYm + k * CRm)[m]
# el drop: 4 tiempos de break + 4 de drop; primero el break igual de fuerte, luego 5 dB abajo
cyc = np.floor((tt - S("drop")) / (4 * B)) % 2 == 0
lo = ramp(tt, wt("drop", "deja"), wt("drop", "deja") + 0.6)
brkmix = (1 - lo) * BRK_hi + lo * BRK_lo
m = (tt >= S("drop")) & (tt < S("bucle2")); music[m] = np.where(cyc, brkmix, DRYm)[m]
# el número: aplastado mientras dice "matando el kick", dinámico con "busca"
k = ramp(tt, wt("plr", "baja"), wt("plr", "baja") + 0.4) * (1 - ramp(tt, wt("plr", "busca"), wt("plr", "busca") + 0.5))
m = (tt >= S("plr")) & (tt < S("marca")); music[m] = ((1 - k) * DRYm + k * CRm)[m]
# ---------------------------------------------------------------- voz + ducking
v, vsr = sf.read("mef/rango/audio/voz.wav"); assert vsr == 24000
v = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v)[:N]
v = np.pad(v, (0, N - len(v)))
venv = np.convolve(np.abs(v), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same")
duck = np.clip(venv / 0.04, 0, 1); duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
# en los momentos de "escucha la diferencia" se baja menos la música
demo = np.zeros(N)
for i in ("hook", "nosabias", "drop"): demo[(tt >= RANGES[i][0]) & (tt < RANGES[i][1])] = 1
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
place(fx, boom(), wt("drop", "gigante"), 0.6)
place(fx, riser(1.6), wt("marca", "mef") - 1.6)
place(fx, pop_(), wt("marca", "mandanos"))
place(fx, pop_(), wt("cta", "guarda")); place(fx, pop_(), wt("cta", "siguenos"))
mix += fx[:N]
mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.97; mix /= max(1.0, np.abs(mix).max() / 0.95)
sf.write("mef/editorial/output/mezcla_rango.wav", np.stack([mix, mix], 1).astype(np.float32), SR)
print("ok", DUR, "s, pico", np.abs(mix).max())
