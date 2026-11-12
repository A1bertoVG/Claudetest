"""MEF #4 rango dinámico (tiempos de mef/arpegios/make.py). Mezcla final MEF: voz en off + loop de techno sintetizado a 130 BPM + efectos.
La música pasa por un compresor real (numpy) y se alterna entre versiones
SECA / COMPRIMIDA / SOBRECOMPRIMIDA siguiendo lo que se ve en pantalla, todas al mismo pico:
así se escucha que "bajar los picos" suena más fuerte.  Uso: python3 mef/arpegios/audio.py"""
import json, re, unicodedata
import numpy as np, soundfile as sf

SR = 48000
TL = json.load(open("mef/arpegios/scene/timeline.json"))
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


# ---------------------------------------------------------------- batería ligera (kick + hats)
def kick():
    n = int(0.42 * SR); t = T(n)
    f = 46 + 120 * np.exp(-t / 0.035); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(np.sin(ph) * np.exp(-t / 0.22) * np.minimum(1, t / 0.002))
def hat(dec):
    n = int(0.12 * SR); t = T(n); x = rng.standard_normal(n); x = np.diff(np.concatenate([[0], x]))
    return x * np.exp(-t / dec) * 0.5
K, HC = kick(), hat(0.02)
drums = np.zeros(N + SR)
for n in range(int(DUR / B) + 2):
    place(drums, K, n * B, 0.9)
    place(drums, HC, n * B + B / 2, 0.12)
    for s in (1, 3): place(drums, HC, n * B + s * B / 4, 0.05)
drums = drums[:N]

# ---------------------------------------------------------------- arpegio (mismas notas que el piano roll)
CHORDS = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]
PEDAL = 76; PAT = [0, 1, 2, 3, 2, 1, 3, 4] * 2; STEP = B / 4
def arp_note(step):
    c = CHORDS[(step // 16) % 4]; return [c[0], c[1], c[2], c[0] + 12, c[1] + 12][PAT[step % 16]]
def bh(i, s=0.0): v = np.sin(i * 91.7 + s * 13.1) * 43758.5453; return v - np.floor(v)
def vel_of(step, human): return (1 - human) * 0.78 + human * min(1, 0.42 + 0.5 * bh(step, 9) + (0.12 if step % 4 == 0 else 0))
def cutoff_at(tm): return 0.5 - 0.5 * np.cos(2 * np.pi * tm / (8 * 4 * B))
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
def tone(f, dur, fc, hp_=0.0, att=0.004, dec=0.12, sus=0.0, detune=0.0):
    n = int(dur * SR); t = T(n); x = np.zeros(n)
    f = f * 2 ** (detune / 1200)
    for k in range(1, 40):
        fk = f * k
        if fk > 16000: break
        w = (1 / k) / (1 + (fk / fc) ** 4) ** 0.5
        if hp_: w *= 1 / (1 + (hp_ / fk) ** 4) ** 0.5
        x += w * np.sin(2 * np.pi * fk * t + k)
    env = np.minimum(1, t / att) * (sus + (1 - sus) * np.exp(-t / dec))
    env *= np.minimum(1, (dur - t) / 0.01)
    return x * env

# qué se activa en cada momento (igual que el video)
tu = wt("hook", "tuyos")
T_PED, T_AUTO = wt("t1", "pedal"), wt("t2", "automatizaciones")
T_OCT, T_PAD, T_ST, T_HUM = wt("t3", "octava"), wt("t3", "pad"), wt("t3", "ditiun"), wt("t4", "varia")
T_VERB, T_SC = wt("secreto", "reverb"), wt("secreto", "said")
def feats(ts):
    full = ts < tu or ts >= RANGES["marca"][0]
    on = lambda tt: full or ts >= tt
    return dict(phone=(tu <= ts < RANGES["hook"][1]), pedal=on(T_PED), auto=on(T_AUTO), octave=on(T_OCT), pad=on(T_PAD),
                stereo=on(T_ST), human=on(T_HUM), verb=on(T_VERB), sc=on(T_SC))

L = np.zeros(N + SR); R = np.zeros(N + SR)
for s in range(int(DUR / STEP) + 1):
    ts = s * STEP; f = feats(ts); p = arp_note(s)
    v = vel_of(s, 1.0 if f["human"] else 0.0)
    fc = 300 + 5200 * cutoff_at(ts) if f["auto"] else 1600
    if f["phone"]: fc = 3000
    dt = 6 if f["stereo"] else 0
    hp_ = 700 if f["phone"] else 0
    for side, buf in ((-1, L), (1, R)):
        x = tone(hz(p), STEP * 0.9, fc, hp_, detune=side * dt) * v * 0.28
        if f["octave"]: x += tone(hz(p + 12), STEP * 0.9, fc, detune=-side * dt) * v * 0.12
        place(buf, x, ts)
# pedal y pad: un bloque por compás
BAR = 16 * STEP
for b in range(int(DUR / BAR) + 1):
    tb = b * BAR; f = feats(tb + 0.01); c = CHORDS[b % 4]
    if f["pedal"]:
        fc = 300 + 5200 * cutoff_at(tb) if f["auto"] else 1600
        for side, buf in ((-1, L), (1, R)):
            place(buf, tone(hz(PEDAL), BAR, min(fc, 2500), att=0.05, dec=1.0, sus=0.7, detune=side * 4) * 0.10, tb)
    if f["pad"]:
        for m in c:
            for side, buf in ((-1, L), (1, R)):
                place(buf, tone(hz(m - 12), BAR + 0.3, 900, att=0.6, dec=2.0, sus=0.8, detune=side * 9) * 0.07, tb)
L, R = L[:N], R[:N]
# en el hook, la versión "celular" va en mono
tt = T(N)
mono = (tt >= tu) & (tt < RANGES["hook"][1])
mid = (L + R) / 2; L[mono] = mid[mono] * 0.8; R[mono] = mid[mono] * 0.8

# ---------------------------------------------------------------- reverb larga en envío: 4.5 s, pre-delay 30 ms, HPF 200 Hz, sidechain al kick
def fftconv(x, ir):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]
irn = int(4.5 * SR); it = T(irn)
def ir(seed):
    r = np.random.default_rng(seed).standard_normal(irn) * np.exp(-it / (4.5 / 6.9))
    r = np.concatenate([np.zeros(int(0.03 * SR)), r])
    R_ = np.fft.rfft(r); fr = np.fft.rfftfreq(len(r), 1 / SR); R_[fr < 200] = 0; R_ *= 1 / (1 + (fr / 7000) ** 2)
    return np.fft.irfft(R_, len(r)) * 0.012
gv = np.array([1.0 if feats(x)["verb"] else 0.0 for x in np.arange(0, DUR, 0.01)])
g_verb = np.interp(tt, np.arange(0, DUR, 0.01), gv)
g_verb = np.convolve(g_verb, np.ones(int(0.3 * SR)) / int(0.3 * SR), mode="same")
sc = np.interp(tt, np.arange(0, DUR, 0.01), np.array([1.0 if feats(x)["sc"] else 0.0 for x in np.arange(0, DUR, 0.01)]))
duck = 1 - 0.8 * sc * np.exp(-((tt % B)) / 0.22)
wetL = fftconv(L * g_verb, ir(1)) * duck; wetR = fftconv(R * g_verb, ir(2)) * duck
musL = L + wetL * 1.0 + drums * 0.55; musR = R + wetR * 1.0 + drums * 0.55
pk = max(np.abs(musL).max(), np.abs(musR).max()); musL /= pk; musR /= pk

# ---------------------------------------------------------------- voz + ducking
v, vsr = sf.read("mef/arpegios/audio/voz.wav"); assert vsr == 24000
v = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v)[:N]
v = np.pad(v, (0, N - len(v)))
venv = np.convolve(np.abs(v), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same")
vd = np.clip(venv / 0.04, 0, 1); vd = np.convolve(vd, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
mgain = 10 ** (-9 * vd / 20) * 0.5
fade = np.clip(tt / 0.02, 0, 1) * np.clip((DUR - tt) / 1.2, 0, 1)

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
place(fx, riser(1.6), wt("marca", "mef") - 1.6)
place(fx, pop_(), wt("marca", "escribenos"))
place(fx, pop_(), wt("cta", "guarda")); place(fx, pop_(), wt("cta", "siguenos"))
fx = fx[:N]
outL = musL * mgain * fade + v * 0.95 + fx; outR = musR * mgain * fade + v * 0.95 + fx
outL = np.tanh(outL * 1.1) / np.tanh(1.1) * 0.97; outR = np.tanh(outR * 1.1) / np.tanh(1.1) * 0.97
m = max(np.abs(outL).max(), np.abs(outR).max()); outL /= max(1, m / 0.95); outR /= max(1, m / 0.95)
sf.write("mef/editorial/output/mezcla_arpegios.wav", np.stack([outL, outR], 1).astype(np.float32), SR)
print("ok", DUR, "s, pico", m)
