"""MEF Estudio #2 · "Compresor → Limiter: el techo de cristal" en 2D editorial (Python + PIL + numpy + ffmpeg).
Estética: grafito cálido, marfil y arcilla, serif editorial + grotesk, grano de papel.
Usa la voz y los tiempos ya generados: mef/limiter/audio/voz.wav + mef/limiter/scene/timeline.json.

Uso (desde la raíz del repo):
  python3 mef/limiter/editorial/make.py --preview 18.5,29.5
  python3 mef/limiter/editorial/make.py    # video completo (frames + audio + ffmpeg)
"""
import json, math, os, re, subprocess, sys, unicodedata
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, SS = 1080, 1920, 30, 2
ROOT = "mef/limiter/editorial"
TL = json.load(open("mef/limiter/scene/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}; ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]
BPM = 130; B = 60 / BPM
NM = "node_modules/@fontsource"
HANDLE = "@mef.estudios"

# ----------------------------------------------------------------- paleta
INK, INK2, INK3 = (20, 20, 19), (31, 30, 28), (44, 43, 40)
IVORY, CREAM, GREY, MUTE = (250, 249, 245), (232, 229, 218), (176, 174, 165), (98, 96, 90)
CLAY, CLAY_D = (217, 119, 87), (171, 82, 56)
SKY, OLIVE, KRAFT = (106, 155, 204), (120, 140, 93), (176, 138, 91)

@lru_cache(None)
def _font(path, size): return ImageFont.truetype(path, max(4, int(size)))
SERIF = lambda s, w=600: _font(f"{NM}/fraunces/files/fraunces-latin-{w}-normal.woff2", s * SS)
SERIFI = lambda s, w=600: _font(f"{NM}/fraunces/files/fraunces-latin-{w}-italic.woff2", s * SS)
GROT = lambda s, w=700: _font(f"{NM}/space-grotesk/files/space-grotesk-latin-{w}-normal.woff2", s * SS)
MONO = lambda s: _font("/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf", s * SS)

clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
lerp = lambda a, b, t: a + (b - a) * t
def ease(x): x = clamp(x); return 1 - (1 - x) ** 3
def eio(x): x = clamp(x); return x * x * (3 - 2 * x)
def back(x): x = clamp(x); c1 = 1.70158; c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def mix(c1, c2, k): return tuple(int(lerp(a, b, clamp(k))) for a, b in zip(c1, c2))
def kick_env(t, d=0.09): return math.exp(-((t % B)) / d)
def nz(x, s=0.0): return math.sin(x * 1.7 + s) * 0.5 + math.sin(x * 3.1 + s * 2.3) * 0.3 + math.sin(x * 7.3 + s * 0.7) * 0.2

# ----------------------------------------------------------------- tiempos por palabra
def words(s, text):
    ws = text.split(); w = [len(x.replace("*", "")) + 1 + (5 if re.search(r"[,.:;!?…]\**$", x) else 0) for x in ws]
    tot, d, acc, out = sum(w), s["end"] - s["start"], 0, []
    for x, wi in zip(ws, w): out.append((x, s["start"] + acc / tot * d, s["start"] + (acc + wi) / tot * d)); acc += wi
    return out
norm = lambda s: re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"))
WORDS = {s["id"]: words(s, s["text"]) for s in TL["segments"]}
SUBW = {s["id"]: words(s, s["sub"]) for s in TL["segments"]}
def wt(sid, p, nth=0):
    n = 0
    for x, a, b in WORDS[sid]:
        if norm(x).startswith(norm(p)):
            if n == nth: return a
            n += 1
    raise KeyError((sid, p))
RANGES = {}
for i, sid in enumerate(ORDER):
    RANGES[sid] = (SEG[sid]["start"] - 0.15 if i else 0.0, SEG[ORDER[i + 1]]["start"] - 0.15 if i < len(ORDER) - 1 else DUR + 0.01)
# escenas visuales (kick + bus comparten el rack)
# escenas visuales (error + tip comparten escena)
SCENES = [(s, 0.0 if s == "hook" else RANGES[s][0]) for s in ("hook", "promesa", "cruda", "threshold", "ratio", "limiter", "revelacion", "error", "marca", "cta")]
def scene_at(t):
    cur = SCENES[0]
    for s in SCENES:
        if t >= s[1]: cur = s
    return cur

# ----------------------------------------------------------------- lienzo con cámara
class Cv:
    def __init__(self, img, z=1.0, cx=540, cy=960, ox=0, oy=0):
        self.img, self.d = img, ImageDraw.Draw(img, "RGBA")
        self.z, self.cx, self.cy, self.ox, self.oy = z, cx, cy, ox, oy
    def P(self, x, y): return (((x - self.cx) * self.z + 540 + self.ox) * SS, ((y - self.cy) * self.z + 960 + self.oy) * SS)
    def L(self, v): return v * self.z * SS
    def poly(self, pts, fill=None, outline=None, width=0):
        q = [self.P(*p) for p in pts]
        if fill: self.d.polygon(q, fill=fill)
        if outline and width: self.d.line(q + [q[0]], fill=outline, width=max(1, int(self.L(width))), joint="curve")
    def line(self, pts, fill, width): self.d.line([self.P(*p) for p in pts], fill=fill, width=max(1, int(self.L(width))), joint="curve")
    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=0, r=0):
        a, b = self.P(x0, y0), self.P(x1, y1)
        self.d.rounded_rectangle([a, b], radius=self.L(r), fill=fill, outline=outline, width=int(self.L(width)) if width else 0)
    def circ(self, x, y, r, fill=None, outline=None, width=0):
        a, b = self.P(x - r, y - r), self.P(x + r, y + r)
        self.d.ellipse([a, b], fill=fill, outline=outline, width=int(self.L(width)) if width else 0)
    def ell(self, x, y, rx, ry, fill=None, outline=None, width=0):
        self.d.ellipse([self.P(x - rx, y - ry), self.P(x + rx, y + ry)], fill=fill, outline=outline, width=int(self.L(width)) if width else 0)
    def text(self, x, y, s, f, fill, anchor="mm", spacing=0):
        # f es una lambda (size)->font ya escalada por SS; aquí se aplica el zoom de cámara
        fnt = f(self.z) if callable(f) else f
        if spacing:
            tw = sum(fnt.getlength(c) for c in s) + spacing * SS * self.z * (len(s) - 1)
            px, py = self.P(x, y); px -= tw / 2 if anchor[0] == "m" else 0
            for c in s:
                self.d.text((px, py), c, font=fnt, fill=fill, anchor="l" + anchor[1]); px += fnt.getlength(c) + spacing * SS * self.z
        else:
            self.d.text(self.P(x, y), s, font=fnt, fill=fill, anchor=anchor)

F = lambda fam, size, *a: (lambda z: fam(size * z, *a))   # fuente que escala con la cámara

def spark(cv, x, y, r, rot, color, w=7):
    """asterisco editorial de 8 brazos irregulares (toque de la casa)"""
    for i in range(8):
        a = rot + i * math.pi / 4; k = 1.0 if i % 2 == 0 else 0.72
        cv.line([(x + math.cos(a) * r * 0.18, y + math.sin(a) * r * 0.18), (x + math.cos(a) * r * k, y + math.sin(a) * r * k)], color, w)

# ----------------------------------------------------------------- fondos y texturas
rng = np.random.default_rng(7)
GRAIN = (rng.normal(0, 1, (H, W)) * 7).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
VIG = (1 - 0.38 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)).clip(0.55, 1).astype(np.float32)[..., None]

def bg(cv, col=INK, dots=True):
    cv.d.rectangle([0, 0, W * SS, H * SS], fill=col)
    if dots:  # retícula de puntos editorial (se mueve con la cámara)
        for gx in range(-200, 1300, 60):
            for gy in range(-300, 2300, 60):
                cv.circ(gx, gy, 1.6, fill=(255, 255, 255, 16))

# ----------------------------------------------------------------- piezas reutilizables
def kick_wave(cv, x0, x1, cy, A, t, color=CLAY, phase_t=None, flat=0.0, width=8):
    """onda de un kick: seno con caída de tono y envolvente; se re-dispara en cada beat"""
    tb = (t % B) if phase_t is None else phase_t
    n = 220; top, bot = [], []
    for i in range(n + 1):
        u = i / n; x = lerp(x0, x1, u)
        ts = u * 0.42  # segundos de la onda a lo ancho
        f = 48 + 180 * math.exp(-ts / 0.035)
        ph = 2 * math.pi * (48 * ts + 180 * 0.035 * (1 - math.exp(-ts / 0.035)))
        env = math.exp(-ts / 0.16) * (0.65 + 0.35 * math.exp(-tb / 0.12))
        v = math.sin(ph) * env
        if flat: v = lerp(v, max(-0.3, min(0.3, v * 3)) / 0.3 * 0.55, flat)
        top.append((x, cy - v * A))
    cv.poly(top + [(x1, cy), (x0, cy)], fill=color + (46,))
    cv.line(top, color, width)

def knob(cv, x, y, r, v, label, t=0.0, col=CLAY, vtxt=None, small=False):
    a0, a1 = math.radians(135), math.radians(405)
    for i in range(23):
        a = lerp(a0, a1, i / 22); ln = 0.16 if i % 5 == 0 else 0.09
        cv.line([(x + math.cos(a) * r * 1.12, y + math.sin(a) * r * 1.12), (x + math.cos(a) * r * (1.12 + ln), y + math.sin(a) * r * (1.12 + ln))],
                GREY if lerp(0, 1, i / 22) <= v + 1e-6 else MUTE, 4)
    # arco de valor
    bx = [cv.P(x - r * 1.0, y - r * 1.0), cv.P(x + r * 1.0, y + r * 1.0)]
    cv.d.arc(bx, 135, 135 + 270 * clamp(v), fill=col, width=int(cv.L(r * 0.1)))
    cv.circ(x, y, r * 0.84, fill=INK3, outline=(0, 0, 0, 120), width=3)
    cv.circ(x, y, r * 0.66, fill=(52, 51, 48))
    a = lerp(a0, a1, clamp(v))
    cv.line([(x + math.cos(a) * r * 0.2, y + math.sin(a) * r * 0.2), (x + math.cos(a) * r * 0.62, y + math.sin(a) * r * 0.62)], IVORY, r * 0.09)
    cv.text(x, y + r * 1.55, label, F(GROT, 28 if small else 34, 700), GREY)
    if vtxt:
        cv.text(x, y + r * 1.55 + 50, vtxt, F(MONO, 38 if small else 44), IVORY)

def meter(cv, x, y, w, h, lvl, n=18, hot=0.8):
    for i in range(n):
        u = i / n; on = u < lvl
        c = (CLAY if u >= hot else IVORY) if on else (255, 255, 255, 18)
        cv.rect(x, y + h - (i + 1) * h / n + 3, x + w, y + h - i * h / n - 3, fill=c, r=3)

def landscape(t, comp=0.0, thr=0.0, ratio=4.0, makeup=0.0, brick=0.0):
    """devuelve listas de alturas (0..1) para 3 crestas; picos KICK/CLAP en la cresta frontal"""
    xs = np.linspace(70, 1010, 160)
    beat = (t / B)
    def ridge(seed, base, amp, spikes):
        hgt = base + amp * np.array([nz(x / 70.0, seed + beat * 0.15) for x in xs])
        for (px, ph, wd) in spikes:
            k = 0.85 + 0.15 * kick_env(t + px * 0.0003)
            hgt = np.maximum(hgt, ph * k * np.exp(-((xs - px) / wd) ** 2))
        return hgt
    back = ridge(4.0, 0.30, 0.07, [])
    mid = ridge(2.0, 0.24, 0.08, [(380, 0.42, 40), (820, 0.40, 40)])
    front = ridge(0.0, 0.17, 0.06, [(220, 0.98, 26), (520, 0.90, 22), (690, 0.99, 26), (930, 0.88, 22)])
    out = []
    for hgt in (back, mid, front):
        if comp > 0:
            over = np.clip(hgt - thr, 0, None)
            hgt = hgt - over * (1 - 1 / ratio) * comp
        if brick > 0:
            hgt = lerp(hgt, np.full_like(hgt, 0.96) - 0.02 * np.abs(np.sin(xs / 9)), brick)
        hgt = hgt + makeup
        out.append(hgt)
    return xs, out

def draw_land(cv, xs, hs, floor, top, ceil_y=None, clay_above=None, brick=0.0):
    """dibuja crestas: hs alturas 0..1 -> y entre floor (0) y top (1)"""
    cols = [(56, 55, 51), (92, 90, 84), CREAM]
    for i, hgt in enumerate(hs):
        pts = [(x, lerp(floor, top, v)) for x, v in zip(xs, hgt)]
        poly = [(xs[0], floor)] + pts + [(xs[-1], floor)]
        fc = mix(cols[i], KRAFT, brick) if i == 2 else cols[i]
        cv.poly(poly, fill=fc)
        if i == 2:
            cv.line(pts, mix(IVORY, (120, 92, 58), brick), 4)
            if clay_above is not None:  # picos por arriba del umbral, en arcilla
                for x, v in zip(xs, hgt):
                    if v > clay_above:
                        y = lerp(floor, top, v); yt = lerp(floor, top, clay_above)
                        cv.line([(x, yt), (x, y)], CLAY, 7)
    if brick > 0:  # corrugado de cartón
        for x in range(80, 1010, 18):
            cv.line([(x, floor - 4), (x, lerp(floor, top, 0.93))], (130, 98, 62, int(150 * brick)), 3)

def press(cv, x0, x1, y, col=(70, 69, 65)):
    """prensa: pistón + placa; y = borde inferior de la placa"""
    cv.rect(500, y - 900, 580, y - 70, fill=(58, 57, 53), outline=(0, 0, 0, 90), width=3)
    for k in range(6): cv.line([(500, y - 860 + k * 120), (580, y - 860 + k * 120)], (40, 40, 37), 4)
    cv.rect(x0, y - 74, x1, y, fill=col, outline=(0, 0, 0, 120), width=3, r=8)
    cv.rect(x0, y - 12, x1, y, fill=SKY)
    for k in range(6): cv.circ(lerp(x0 + 40, x1 - 40, k / 5), y - 42, 7, fill=(40, 40, 37))

# ----------------------------------------------------------------- textos
def rich(cv, x, y, s, size, anchor="m", base=IVORY, key=CLAY, lh=1.12, maxw=940, upper=False):
    """texto con *palabras clave* en serif itálica arcilla; envuelve líneas. Coordenadas de pantalla."""
    toks2 = []  # (texto, clave, pegado_al_anterior)
    for i, part in enumerate(s.split("*")):
        k = i % 2 == 1
        for j, w in enumerate(re.split(r"(\s+)", part)):
            if not w or w.isspace(): continue
            glue = j == 0 and not part[:1].isspace() and toks2 != [] and not (i > 0 and s.split("*")[i - 1][-1:].isspace())
            toks2.append((w, k, glue))
    fr, fi = SERIF(size, 600), SERIFI(size, 700)
    sp = fr.getlength(" ") / SS
    lines, cur, cw = [], [], 0
    for w, k, g in toks2:
        ww = (fi if k else fr).getlength(w) / SS
        if g and cur:
            cur.append((w, k, ww, True)); cw += ww; continue
        if cur and cw + sp + ww > maxw: lines.append((cur, cw)); cur, cw = [], 0
        cw += (sp if cur else 0) + ww; cur.append((w, k, ww, False))
    if cur: lines.append((cur, cw))
    y0 = y - (len(lines) - 1) * size * lh / 2
    for li, (ln, lw) in enumerate(lines):
        px = x - lw / 2 if anchor == "m" else x
        for n, (w, k, ww, g) in enumerate(ln):
            if g and n: px -= sp
            cv.d.text((px * SS, (y0 + li * size * lh) * SS), w, font=fi if k else fr, fill=key if k else base, anchor="lm")
            px += ww + sp
    return len(lines)

def subtitles(cv, t):
    """subtítulos por bloques de 2-4 palabras; palabra activa con subrayado arcilla"""
    sid = None
    for s in TL["segments"]:
        if s["start"] - 0.1 <= t <= s["end"] + 0.25: sid = s["id"]
    if not sid: return
    ws = SUBW[sid]; chunks, cur, n = [], [], 0
    for w in ws:
        cur.append(w); n += len(w[0])
        if n > 16 or re.search(r"[,.:;!?]\**$", w[0]) or len(cur) == 4: chunks.append(cur); cur, n = [], 0
    if cur: chunks.append(cur)
    ch = chunks[-1]
    for c in chunks:
        if t < c[-1][2]: ch = c; break
    size = 66; y = 1405
    fr, fi = GROT(size, 700), SERIFI(size + 6, 700)
    items = []
    for w, a, b in ch:
        k = "*" in w; ww = w.replace("*", "")
        items.append((ww, k, (fi if k else fr).getlength(ww) / SS, a, b))
    sp = fr.getlength(" ") / SS
    tw = sum(i[2] for i in items) + sp * (len(items) - 1)
    pop = back((t - ch[0][1]) / 0.18)
    px = 540 - tw / 2
    cv.d.rounded_rectangle([((540 - tw / 2 - 34) * SS, (y - 62) * SS), ((540 + tw / 2 + 34) * SS, (y + 62) * SS)], radius=26 * SS, fill=(20, 20, 19, 205))
    for ww, k, wl, a, b in items:
        act = a <= t < b + 0.05
        yo = (1 - pop) * 26
        cv.d.text((px * SS, (y + yo) * SS), ww, font=fi if k else fr, fill=CLAY if k else (IVORY if t >= a else (150, 148, 140)), anchor="lm")
        if act: cv.d.rounded_rectangle([(px * SS, (y + 40) * SS), ((px + wl) * SS, (y + 47) * SS)], radius=4 * SS, fill=CLAY)
        px += wl + sp

def caption(cv, t, s, y=330, size=82, t0=None):
    k = ease((t - (t0 if t0 is not None else 0)) / 0.35)
    if k <= 0: return
    ov = Image.new("RGBA", cv.img.size, (0, 0, 0, 0)); c2 = Cv(ov)
    rich(c2, 540, y + (1 - k) * 40, s, size)
    if k < 1: ov.putalpha(ov.getchannel("A").point(lambda a: int(a * k)))
    cv.img.alpha_composite(ov) if cv.img.mode == "RGBA" else cv.img.paste(ov, (0, 0), ov)

def kicker(cv, t, label, y=228):
    """etiqueta pequeña de sección, estilo editorial: número + asterisco"""
    f = GROT(26, 600); tw = f.getlength(label) / SS
    spark(Cv(cv.img), 540 - tw / 2 - 30, y, 15, t * 0.8, CLAY, 4)
    cv.d.text((540 * SS - tw * SS / 2 + 0, y * SS), label, font=f, fill=GREY, anchor="lm")

def pill_progress(cv, t):
    t0, t1 = wt("promesa", "final") - 0.2, SEG["error"]["start"]
    if not (t0 - 0.4 <= t < t1 + 0.6): return
    k = back((t - t0) / 0.45) if t < t1 else 1 - ease((t - t1) / 0.6)
    if k <= 0.01: return
    y = 300 - (1 - k) * 120
    s = "El error más común  →  al final"; f = _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 34 * SS); tw = f.getlength(s) / SS
    x0, x1 = 540 - tw / 2 - 44, 540 + tw / 2 + 44
    cv.d.rounded_rectangle([(x0 * SS, (y - 40) * SS), (x1 * SS, (y + 52) * SS)], radius=28 * SS, fill=IVORY)
    cv.d.text((540 * SS, (y - 4) * SS), s, font=f, fill=INK, anchor="mm")
    p = clamp((t - t0) / (t1 - t0))
    cv.d.rounded_rectangle([((x0 + 34) * SS, (y + 28) * SS), ((x1 - 34) * SS, (y + 36) * SS)], radius=4 * SS, fill=(0, 0, 0, 40))
    cv.d.rounded_rectangle([((x0 + 34) * SS, (y + 28) * SS), ((x0 + 34 + (x1 - x0 - 68) * p) * SS, (y + 36) * SS)], radius=4 * SS, fill=CLAY)

def topbar(cv, t):
    cv.d.rectangle([0, 0, W * SS * t / DUR, 7 * SS], fill=CLAY)

# ----------------------------------------------------------------- señal (forma de onda que avanza)
def bh(i, s=0.0): v = math.sin(i * 91.7 + s * 13.1) * 43758.5453; return v - math.floor(v)
def sig(u):
    """amplitud 0..~1.1 de un loop techno en el instante u (picos de kick/clap desordenados)"""
    n = math.floor(u / B); ph = u - n * B
    kick = (0.86 + 0.24 * bh(n)) * math.exp(-ph / 0.1) * min(1, ph / 0.004 + 0.2)
    clap = 0.0
    if n % 2 == 1:
        pc = ph - 0.005; clap = (0.62 + 0.38 * bh(n, 1)) * math.exp(-max(0, pc) / 0.07) if pc > 0 else 0
    body = 0.21 + 0.06 * nz(u * 5.3) + 0.06 * abs(math.sin(u * 2 * math.pi * BPM / 60 * 2)) + 0.04 * bh(int(u * 40), 2)
    return max(body, kick, clap)

def process(a, thr=None, ratio=4.0, ck=0.0, makeup=0.0, ceil=None, lk=0.0, brick=0.0):
    if thr is not None and ck > 0 and a > thr: a = a - (a - thr) * (1 - 1 / ratio) * ck
    a += makeup
    if brick > 0: a = lerp(a, (ceil or 0.89) - 0.015 * bh(int(a * 1000)), brick)
    pre = a
    if ceil is not None and lk > 0 and a > ceil: a = lerp(a, ceil, lk)
    return a, pre

def wave(cv, t, cy=980, A=440, speed=320, thr=None, ratio=4.0, ck=0.0, makeup=0.0, ceil=None, lk=0.0, brick=0.0,
         over_col=CLAY, mark_thr=None, ghost=False, x0=70, x1=1010, step=9, bw=6, refl=True, dim=0.0):
    """forma de onda en barras que viaja de izquierda a derecha; mitad de abajo como reflejo"""
    hits = []
    nb = int((x1 - x0) / step)
    for i in range(nb):
        x = x0 + i * step
        u = t - (x - x0) / speed
        raw = sig(u)
        a, pre = process(raw, thr, ratio, ck, makeup, ceil, lk, brick)
        a = min(a, 1.18)
        if ghost and raw > a + 0.01:
            cv.rect(x, cy - min(raw, 1.18) * A, x + bw, cy - a * A, fill=(255, 255, 255, 34), r=2)
        mt = (mark_thr + (makeup if ck > 0 else 0)) if mark_thr is not None else 9
        base = mix(IVORY, (150, 148, 140), dim)
        lo = min(a, mt)
        cv.rect(x, cy - lo * A, x + bw, cy, fill=base, r=2)
        if a > mt: cv.rect(x, cy - a * A, x + bw, cy - mt * A + 2, fill=over_col, r=2)
        if refl:
            cv.rect(x, cy + 6, x + bw, cy + 6 + a * A * 0.42, fill=base + (46,), r=2)
        if ceil is not None and lk > 0 and pre > ceil + 0.02: hits.append((x + bw / 2, pre - ceil))
    cv.line([(x0 - 10, cy), (x1 + 10, cy)], (255, 255, 255, 50), 2)
    return hits

def glass(cv, y, t, x0=40, x1=1040, k=1.0, fog=0.0, cracks=0.0, label=True, hits=(), hit_k=1.0):
    """techo de cristal: el borde inferior está en y"""
    if k <= 0: return
    a = lambda v: int(v * k)
    cv.rect(x0, y - 86, x1, y, fill=(196, 222, 236, a(46 + 120 * fog)))
    for i in range(7):  # reflejos diagonales
        xs = x0 + 60 + i * 150 + (t * 40) % 150
        if xs + 90 < x1: cv.poly([(xs, y - 86), (xs + 40, y - 86), (xs + 90, y), (xs + 50, y)], fill=(255, 255, 255, a(26)))
    cv.line([(x0, y - 86), (x1, y - 86)], (225, 238, 246, a(120)), 3)
    cv.line([(x0, y), (x1, y)], (232, 244, 250, a(255)), 6)
    if label:
        cv.text(x0 + 24, y - 44, "LIMITER  ·  −1 dBTP", F(GROT, 28, 700), (232, 244, 250, a(230)), anchor="lm")
    for (hx, ov) in hits:  # destellos donde chocan los picos
        r = (18 + 120 * min(ov, 0.4)) * hit_k
        for j in range(6):
            an = math.pi + j * math.pi / 5
            cv.line([(hx, y), (hx + math.cos(an) * r, y + 4 + abs(math.sin(an)) * r * 0.5)], (255, 255, 255, a(170)), 3)
    if cracks > 0:
        for c in range(5):
            cx = 180 + c * 180 + 40 * bh(c, 3); px, py = cx, y - 40
            pts = [(px, py)]
            for s in range(int(1 + 6 * cracks)):
                px += (bh(c * 10 + s, 4) - 0.5) * 90; py += (bh(c * 10 + s, 5) - 0.5) * 18
                pts.append((px, max(y - 86, min(y, py))))
            if len(pts) > 1: cv.line(pts, (255, 255, 255, a(200)), 3)

def thr_line(cv, y, k=1.0, label="THRESHOLD", x0=40, x1=1040):
    if k <= 0: return
    cv.rect(x0, y - 5, x1, y + 5, fill=SKY + (int(70 * k),))
    for x in range(x0, x1, 36): cv.line([(x, y), (x + 20, y)], SKY + (int(255 * k),), 5)
    if label: cv.text(x0 + 20, y - 24, label, F(GROT, 30, 700), SKY + (int(255 * k),), anchor="ls")

CY, AMP = 1040, 470          # línea base y altura de la onda en pantalla
THR, CEIL = 0.52, 0.86       # threshold y techo (fracción de AMP)
yv = lambda v: CY - v * AMP

def sc_hook(img, t):
    k = ease(t / 1.8)
    cv = Cv(img, z=lerp(2.1, 1.0, k), cy=lerp(yv(CEIL) + 60, 960, k), oy=kick_env(t) * 6)
    bg(cv)
    hits = wave(cv, t + 3, cy=CY, A=AMP, makeup=0.2, ceil=CEIL, lk=1.0, mark_thr=CEIL - 0.02)
    tc = wt("hook", "cristal")
    glass(cv, yv(CEIL), t, hits=hits, cracks=0.35 * ease((t - tc) / 0.4), label=False)
    caption(Cv(img), t, "El techo de *cristal*", y=330, size=96, t0=0.25)

def node(cv, y, title, sub, on, t, col=CLAY):
    c = mix(INK3, (52, 40, 34) if col == CLAY else (36, 46, 56), on)
    cv.rect(170, y - 78, 910, y + 78, fill=c, outline=mix(MUTE, col, on), width=4, r=28)
    cv.text(220, y - 18, title, F(SERIF, 54, 600), mix(GREY, IVORY, on), anchor="lm")
    cv.text(222, y + 34, sub, F(SERIFI, 30, 600), mix(MUTE, col, on), anchor="lm")
    # mini onda
    for i in range(14):
        x = 640 + i * 18; a = sig(t - i * 0.03)
        if title == "Compresor": a = a - max(0, a - 0.5) * 0.75
        if title == "Limiter": a = min(a - max(0, a - 0.5) * 0.75 + 0.25, 0.8)
        cv.rect(x, y - a * 58, x + 9, y + a * 58, fill=mix(GREY, IVORY, on), r=3)

def sc_promesa(img, t):
    t0 = RANGES["promesa"][0]; lt = t - t0
    cv = Cv(img, z=lerp(1.08, 1.0, ease(lt / 2)), cy=960)
    bg(cv)
    tc, tl, te = wt("promesa", "compresor"), wt("promesa", "limiter"), wt("promesa", "error")
    ys = [560, 790, 1020, 1250]
    for a, b in zip(ys, ys[1:]): cv.line([(540, a + 78), (540, b - 78)], MUTE, 4)
    node(cv, ys[0], "Entrada", "picos sin control", 1.0, t)
    node(cv, ys[1], "Compresor", "controla", ease((t - tc) / 0.3), t, SKY)
    node(cv, ys[2], "Limiter", "protege · techo de cristal", ease((t - tl) / 0.3), t, (200, 226, 240))
    cv.rect(380, ys[3] - 46, 700, ys[3] + 46, fill=INK3, r=46)
    cv.text(540, ys[3], "Salida", F(GROT, 40, 700), GREY)
    # punto que viaja por la ruta
    p = clamp(lt / (tl + 1.0 - t0)); yy_ = lerp(ys[0], ys[3], p)
    cv.circ(540, yy_, 14 + 6 * kick_env(t), fill=CLAY)
    ui = Cv(img); pill_progress(ui, t)

def sc_cruda(img, t):
    t0 = RANGES["cruda"][0]; lt = t - t0
    cv = Cv(img, z=lerp(1.15, 1.0, ease(lt / 1.2)), cy=960, ox=math.sin(lt * 3) * 4)
    bg(cv)
    cv.line([(40, yv(1.0)), (1040, yv(1.0))], CLAY + (160,), 3)
    cv.text(60, yv(1.0) - 16, "0 dBFS", F(MONO, 28), CLAY, anchor="ls")
    wave(cv, t, cy=CY, A=AMP, mark_thr=0.8, over_col=CLAY)
    for x, lab in ((180, "kick"), (540, "clap"), (880, "kick")):
        pass
    caption(Cv(img), t, "*Entrada*: picos sin control", y=330, size=84, t0=t0 + 0.1)

def sc_threshold(img, t):
    t0 = RANGES["threshold"][0]; lt = t - t0
    cv = Cv(img); bg(cv)
    tl, ta, tx = wt("threshold", "linea"), wt("threshold", "abajo"), wt("threshold", "cruza")
    thr = lerp(1.15, THR, eio((t - (tl - 0.6)) / 0.9))
    over = ease((t - tx) / 0.3)
    wave(cv, t, cy=CY, A=AMP, mark_thr=thr, over_col=mix(IVORY, SKY, over))
    thr_line(cv, yv(thr), k=ease((t - t0) / 0.3))
    if t > ta:
        k = ease((t - ta) / 0.3)
        cv.rect(700, yv(THR) + 30, 1010, yv(THR) + 86, fill=(20, 20, 19, int(200 * k)), r=14)
        cv.text(855, yv(THR) + 58, "abajo: pasa intacto", F(SERIFI, 32, 600), IVORY + (int(255 * k),))
    if t > tx:
        k = ease((t - tx) / 0.3)
        cv.rect(60, yv(1.08) - 30, 400, yv(1.08) + 26, fill=(20, 20, 19, int(200 * k)), r=14)
        cv.text(230, yv(1.08) - 2, "arriba: se comprime", F(SERIFI, 32, 600), SKY + (int(255 * k),))
    caption(Cv(img), t, "*Threshold*: esta línea", y=330, size=84, t0=t0 + 0.1)

def sc_ratio(img, t):
    t0 = RANGES["ratio"][0]; lt = t - t0
    cv = Cv(img); bg(cv)
    t4, t4b, t1 = wt("ratio", "cuatro"), wt("ratio", "cuatro", 1), wt("ratio", "uno")
    # --- bloques: +4 dB entran, +1 dB sale
    base = 860; bw, bhh = 120, 64
    thr_line(cv, base, label="", x0=90, x1=990)
    cv.text(540, base - 16, "THRESHOLD", F(GROT, 28, 700), SKY, anchor="ms")
    m = eio((t - t1) / 0.6)
    # columna de entrada
    cv.text(300, base + 42, "ENTRA", F(GROT, 28, 700), GREY)
    cv.text(780, base + 42, "SALE", F(GROT, 28, 700), GREY)
    nshow = int(clamp((t - t4b + 0.1) / 0.5) * 4 + 0.999) if t > t4b - 0.1 else 0
    for i in range(4):
        if i < nshow:
            cv.rect(300 - bw / 2, base - (i + 1) * bhh - 4, 300 + bw / 2, base - i * bhh - 8, fill=CLAY, r=8)
    if nshow: cv.text(300 - bw / 2 - 20, base - 2 * bhh - 6, "+4 dB", F(MONO, 36), CLAY, anchor="rm")
    # bloques que viajan y se fusionan en uno
    if m > 0:
        for i in range(4):
            y0 = base - (i + 1) * bhh - 4; y1 = base - bhh - 4
            yy0 = lerp(y0, y1, m); xx = lerp(300, 780, m)
            cv.rect(xx - bw / 2, yy0, xx + bw / 2, yy0 + bhh - 4, fill=mix(CLAY, SKY, m) + (int(255 * (1 - 0.6 * m)) if i else 255,), r=8)
        if m >= 1: cv.text(780 + bw / 2 + 20, base - bhh / 2 - 6, "+1 dB", F(MONO, 36), SKY, anchor="lm")
    if t > t4b: cv.line([(380, base - 2 * bhh), (700, base - 2 * bhh)], (255, 255, 255, 50), 3)
    # --- gráfica entrada/salida
    gx0, gy0, gs = 330, 1300, 380   # origen abajo-izquierda, lado
    cv.rect(gx0, gy0 - gs, gx0 + gs, gy0, fill=INK2, r=10)
    for i in range(1, 4):
        cv.line([(gx0 + gs * i / 4, gy0 - gs), (gx0 + gs * i / 4, gy0)], (255, 255, 255, 14), 2)
        cv.line([(gx0, gy0 - gs * i / 4), (gx0 + gs, gy0 - gs * i / 4)], (255, 255, 255, 14), 2)
    for i in range(0, 20, 2):
        cv.line([(gx0 + gs * i / 20, gy0 - gs * i / 20), (gx0 + gs * (i + 1) / 20, gy0 - gs * (i + 1) / 20)], MUTE, 3)
    tk = 0.5; prog = ease((t - t4) / 1.2)
    pts = [(gx0, gy0), (gx0 + gs * tk, gy0 - gs * tk)]
    xe = tk + (1 - tk) * prog
    pts.append((gx0 + gs * xe, gy0 - gs * (tk + (xe - tk) / 4)))
    cv.line(pts, SKY, 7)
    cv.circ(gx0 + gs * tk, gy0 - gs * tk, 9, fill=SKY)
    cv.text(gx0 + gs / 2, gy0 + 30, "entrada", F(SERIFI, 28, 600), GREY)
    cv.text(gx0 - 26, gy0 - gs / 2, "salida", F(SERIFI, 28, 600), GREY, anchor="rm")
    cv.text(gx0 + gs + 20, gy0 - gs * 0.62, "4:1", F(MONO, 40), SKY, anchor="lm")
    cv.text(gx0 + gs + 20, gy0 - gs * 0.95, "1:1", F(MONO, 30), MUTE, anchor="lm")
    caption(Cv(img), t, "*Ratio*: cuánto se comprime", y=330, size=80, t0=t0 + 0.1)

def comp_cfg(t, mk=0.0):
    return dict(thr=THR, ratio=4.0, ck=1.0, makeup=mk)

def sc_limiter(img, t):
    t0 = RANGES["limiter"][0]; lt = t - t0
    th, ti, tn = wt("limiter", "techo"), wt("limiter", "infinito"), wt("limiter", "ningun")
    cv = Cv(img, z=lerp(1.0, 1.06, ease((t - tn) / 1.0)), cy=lerp(960, 900, ease((t - tn) / 1.0)))
    bg(cv)
    gk = ease((t - (th - 0.4)) / 0.6)
    gy = lerp(yv(CEIL) - 400, yv(CEIL), gk)
    lk = ease((t - th) / 0.3)
    hits = wave(cv, t, cy=CY, A=AMP, ceil=CEIL, lk=lk, ghost=False, mark_thr=THR, over_col=SKY, **comp_cfg(t, 0.27))
    thr_line(cv, yv(THR), k=0.55, label="")
    glass(cv, gy, t, k=gk, hits=hits if gk > 0.95 else ())
    if t > ti:
        k = back((t - ti) / 0.35)
        cv.rect(780, yv(CEIL) - 190 - 40 * k, 1010, yv(CEIL) - 190 + 40 * k, fill=(232, 244, 250), r=20)
        if k > 0.6: cv.text(895, yv(CEIL) - 190, "RATIO ∞:1", lambda z: _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 34 * SS * z), INK)
    caption(Cv(img), t, "El *limiter*: techo de cristal", y=330, size=80, t0=t0 + 0.1)

def loud_meters(cv, t, k, before=0.46, after=0.8):
    for i, (lab, v, c) in enumerate((("ANTES", before, GREY), ("DESPUÉS", after, OLIVE))):
        y = 1220 + i * 64
        cv.text(250, y, lab, F(GROT, 28, 700), c, anchor="rm")
        cv.rect(275, y - 18, 935, y + 18, fill=(255, 255, 255, 18), r=18)
        cv.rect(275, y - 18, 275 + 660 * v * k * (0.92 + 0.08 * kick_env(t)), y + 18, fill=c, r=18)

def sc_revelacion(img, t):
    t0 = RANGES["revelacion"][0]; lt = t - t0
    cv = Cv(img); bg(cv)
    ts = wt("revelacion", "subir")
    mk = lerp(0.27, 0.42, eio((t - ts) / 1.2))
    hits = wave(cv, t, cy=CY - 60, A=AMP, ceil=CEIL, lk=1.0, mark_thr=THR, over_col=SKY, **comp_cfg(t, mk))
    glass(Cv(img), yv(CEIL) - 60, t, hits=hits, hit_k=0.6)
    loud_meters(Cv(img), t, ease((t - ts) / 0.8))
    caption(Cv(img), t, "Compresor *controla* · Limiter *protege*", y=340, size=70, t0=t0 + 0.1)

def sc_error(img, t):
    t0 = RANGES["error"][0]; lt = t - t0
    ta, te, tg = wt("error", "aprietas"), wt("error", "empana"), wt("error", "golpe")
    tip0 = RANGES["tip"][0]; tu = wt("tip", "uno")
    sq = eio((t - ta) / 0.4) * (1 - eio((t - tu) / 0.8))
    fog = ease((t - te) / 0.8) * (1 - eio((t - tu) / 0.8))
    shake = 10 * math.exp(-max(0, t - ta - 0.4) / 0.2) * (t > ta + 0.4)
    cv = Cv(img, ox=math.sin(t * 80) * shake); bg(cv)
    mk = lerp(0.27, 1.2, sq)
    hits = wave(cv, t, cy=CY, A=AMP, x1=960, ceil=CEIL, lk=1.0, mark_thr=lerp(THR, 0.0, sq), over_col=mix(SKY, (150, 160, 170), sq),
                brick=sq * 0.9, dim=fog * 0.6, **comp_cfg(t, mk))
    glass(cv, yv(CEIL), t, fog=fog, cracks=fog, hits=hits if sq < 0.5 else (), hit_k=1 - sq)
    if fog > 0:  # vaho sobre toda la onda
        cv.rect(40, yv(CEIL), 1040, CY + 120, fill=(210, 222, 230, int(70 * fog)), r=10)
    ui = Cv(img)
    # medidor de reducción del limiter
    gr = lerp(lerp(0.15, 0.95, sq), 0.22 + 0.1 * kick_env(t), eio((t - tu) / 0.8) if t > tu else 0)
    ui.rect(990, 520, 1036, 1180, fill=(255, 255, 255, 14), r=8)
    ui.rect(994, 524, 1032, 524 + 652 * clamp(gr), fill=CLAY if gr > 0.5 else (232, 244, 250), r=6)
    ui.text(1013, 1206, "GR", F(GROT, 24, 700), GREY)
    if t < tip0 + 0.1:
        caption(ui, t, "El *error*: todo al limiter", y=330, size=82, t0=t0 + 0.1)
        if t > tg:
            k = back((t - tg) / 0.3)
            ui.rect(300, 700 - 46 * k, 780, 700 + 46 * k, fill=(232, 214, 180), r=10)
            if k > 0.6: ui.text(540, 700, "KICK SIN GOLPE", F(GROT, 42, 700), (110, 80, 45))
    else:
        caption(ui, t, "Limiter: *1–3 dB* de reducción, máximo", y=340, size=68, t0=tip0 + 0.05)
        card(ui, 540, 470, "−1 a −3 dB", tu + 0.4, t, col=(232, 244, 250))

def card(cv, x, y, s, t0, t, col=CLAY, fg=INK, size=40):
    if t < t0: return
    k = back((t - t0) / 0.35); f = MONO(size); tw = f.getlength(s) / SS
    cv.d.rounded_rectangle([((x - tw / 2 - 22) * SS, (y - 30 * k) * SS), ((x + tw / 2 + 22) * SS, (y + 30 * k) * SS)], radius=18 * SS, fill=col)
    if k > 0.6: cv.d.text((x * SS, y * SS), s, font=f, fill=fg, anchor="mm")


def wordmark(cv, x, y, s=1.0, col=IVORY, acc=CLAY):
    cv.text(x, y, "MEF", F(SERIF, 170 * s, 900), col)
    cv.text(x, y + 118 * s, "E S T U D I O", F(GROT, 40 * s, 600), col)
    spark(cv, x + 175 * s, y - 52 * s, 30 * s, 0.3, acc, 7 * s)

def studio(cv, t, sign_k, health=1.0):
    cv.d.rectangle([0, 0, W * SS, H * SS], fill=(26, 25, 23))
    # paneles acústicos en la pared
    for i in range(-3, 22):
        cv.rect(-260 + i * 90, 200, -260 + i * 90 + 80, 1010, fill=(34, 33, 30) if i % 2 else (38, 36, 33), r=6)
    cv.rect(-600, 1010, 1680, 2400, fill=(30, 29, 26))
    # escritorio y consola
    cv.poly([(-200, 1180), (1280, 1180), (1500, 1700), (-420, 1700)], fill=(54, 42, 32))
    cv.poly([(130, 1150), (950, 1150), (1010, 1330), (70, 1330)], fill=(40, 39, 36), outline=(0, 0, 0), width=2)
    for i in range(16):
        x = lerp(130, 950, (i + 0.5) / 16)
        cv.line([(x, 1180), (x + (x - 540) * 0.06, 1300)], (20, 20, 19), 4)
        fy = lerp(1290, 1200, 0.3 + 0.5 * abs(math.sin(i * 1.7)) * (0.8 + 0.2 * kick_env(t)))
        cv.rect(x - 9, fy - 5, x + 9, fy + 5, fill=IVORY if i % 4 else CLAY, r=2)
    # monitores
    for mx in (110, 970):
        cv.rect(mx - 95, 620, mx + 95, 1000, fill=(22, 22, 20), r=14)
        cv.circ(mx, 700, 34, fill=(50, 49, 45))
        pr = 70 + kick_env(t) * 9 * health
        cv.circ(mx, 880, pr, fill=(50, 49, 45)); cv.circ(mx, 880, pr * 0.4, fill=(70, 68, 63))
    # pantalla con onda sana
    cv.rect(260, 640, 820, 1000, fill=(16, 16, 15), outline=(60, 59, 55), width=4, r=12)
    kick_wave(cv, 290, 790, 820, 120 * health * (0.85 + 0.15 * kick_env(t)), t, width=5)
    cv.rect(520, 1000, 560, 1060, fill=(40, 39, 36))
    # letrero en la pared
    if sign_k > 0:
        a = int(255 * sign_k)
        cv.rect(280, 270, 800, 600, fill=(20, 20, 19, a), r=18)
        o = Image.new("RGBA", cv.img.size, (0, 0, 0, 0)); co = Cv(o, cv.z, cv.cx, cv.cy, cv.ox, cv.oy)
        wordmark(co, 540, 380, 0.85)
        co.text(540, 548, "mezcla · máster", F(SERIFI, 34, 600), CLAY)
        if sign_k < 1: o.putalpha(o.getchannel("A").point(lambda v: int(v * sign_k)))
        cv.img.paste(o, (0, 0), o)

def sc_marca(img, t):
    t0 = RANGES["marca"][0]; lt = t - t0
    k = ease(lt / 1.6)
    if lt < 0.9:  # la onda sana atraviesa la escena y entramos al estudio
        cv = Cv(img, z=lerp(1.0, 1.4, ease(lt / 0.9))); bg(cv)
        hits = wave(cv, t, cy=CY, A=AMP, ceil=CEIL, lk=1.0, mark_thr=THR, over_col=SKY, **comp_cfg(t, 0.27))
        glass(cv, yv(CEIL), t, hits=hits, label=False)
        a = ease((lt - 0.4) / 0.5)
        if a > 0:
            ov = Image.new("RGB", img.size); cv2 = Cv(ov, z=2.2, cy=820); studio(cv2, t, 0)
            img.paste(Image.blend(img, ov, a))
    else:
        cv = Cv(img, z=lerp(2.2, 1.0, ease((lt - 0.4) / 2.0)), cy=lerp(820, 920, ease((lt - 0.4) / 2.0)))
        studio(cv, t, ease((t - wt("marca", "mef")) / 0.5))

def bookmark(cv, x, y, s, fill, outline=None):
    pts = [(x - 60 * s, y - 85 * s), (x + 60 * s, y - 85 * s), (x + 60 * s, y + 85 * s), (x, y + 40 * s), (x - 60 * s, y + 85 * s)]
    cv.poly(pts, fill=fill, outline=outline, width=8 * s)

def sc_cta(img, t):
    t0 = RANGES["cta"][0]; lt = t - t0
    cv = Cv(img); bg(cv, dots=True)
    # pulso de fondo con el kick
    for r in (420, 300):
        cv.circ(540, 760, r + kick_env(t) * 30, outline=CLAY + (int(40 + 60 * kick_env(t)),), width=3)
    tg = wt("cta", "guarda"); tf = wt("cta", "siguenos")
    kb = back((t - tg + 0.2) / 0.4); filled = t > tg + 0.35
    s = (1.25 + 0.12 * kick_env(t)) * kb
    if kb > 0.01:
        bookmark(cv, 540, 700, s, CLAY if filled else None, IVORY)
        if filled and t < tg + 0.9:
            for i in range(8):
                a = i * math.pi / 4; rr = 140 + 160 * ease((t - tg - 0.35) / 0.5)
                cv.circ(540 + math.cos(a) * rr, 700 + math.sin(a) * rr, 9 * (1 - ease((t - tg - 0.35) / 0.55)), fill=CLAY)
    cv.text(540, 930, "Guárdalo", F(SERIF, 96, 600), IVORY)
    cv.text(540, 1010, "para tu próxima sesión", F(SERIFI, 44, 600), GREY)
    # botón seguir
    kf = back((t - tf + 0.2) / 0.4)
    if kf > 0.01:
        on = t > tf + 0.5
        sc = kf * (1 + 0.05 * kick_env(t))
        w2, h2 = 300 * sc, 62 * sc
        cv.rect(540 - w2, 1160 - h2, 540 + w2, 1160 + h2, fill=IVORY if on else CLAY, r=h2)
        cv.text(540, 1160, ("Siguiendo" if on else "Seguir  +") if sc > 0.5 else "", F(GROT, 56 * sc, 700), INK)
        if not on and t > tf + 0.1:  # dedo que toca
            fx, fy = 700, lerp(1320, 1185, ease((t - tf - 0.1) / 0.3))
            cv.circ(fx, fy, 38, fill=(250, 249, 245, 120), outline=IVORY, width=4)
    # cierre con wordmark + usuario
    kend = ease((t - (SEG["cta"]["end"] - 0.2)) / 0.6)
    cv.text(540, 1290, HANDLE, F(MONO, 46), mix(GREY, IVORY, kend))
    if kend > 0:
        ov = Image.new("RGB", img.size); c2 = Cv(ov); bg(c2, dots=True)
        for r in (360, 250): c2.circ(540, 880, r + kick_env(t) * 26, outline=CLAY + (90,), width=3)
        wordmark(c2, 540, 820, 1.25)
        c2.text(540, 1080, "mezcla y máster para techno", F(SERIFI, 46, 600), GREY)
        c2.text(540, 1200, HANDLE, F(MONO, 52), IVORY)
        img.paste(Image.blend(img, ov, kend))

SCN = dict(hook=sc_hook, promesa=sc_promesa, cruda=sc_cruda, threshold=sc_threshold, ratio=sc_ratio, limiter=sc_limiter,
           revelacion=sc_revelacion, error=sc_error, marca=sc_marca, cta=sc_cta)
CUT = 0.18  # duración del fundido entre escenas

def render_scene(name, t):
    img = Image.new("RGB", (W * SS, H * SS), INK)
    SCN[name](img, t)
    return img

def frame(t):
    name, ts = scene_at(t)
    img = render_scene(name, t)
    if ts > 0 and t - ts < CUT:  # fundido rápido con la escena anterior
        prev = SCENES[[s[0] for s in SCENES].index(name) - 1][0]
        img = Image.blend(render_scene(prev, t), img, eio((t - ts) / CUT))
    ui = Cv(img)
    subtitles(ui, t); topbar(ui, t)
    if name not in ("hook",):
        kicker(ui, t, {"promesa": "EL VIAJE DE TU TRACK", "cruda": "01 · ENTRADA", "threshold": "02 · THRESHOLD",
                       "ratio": "03 · RATIO", "limiter": "04 · LIMITER", "revelacion": "05 · RESULTADO", "error": "06 · EL ERROR",
                       "marca": "MEF ESTUDIO", "cta": "GUÁRDALO"}[name], y=226 if name not in ("promesa",) else 210)
    out = img.resize((W, H), Image.LANCZOS)
    a = np.asarray(out).astype(np.float32)
    a = a * VIG + GRAIN[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

# ----------------------------------------------------------------- main
if __name__ == "__main__":
    os.makedirs(f"{ROOT}/output", exist_ok=True)
    if "--preview" in sys.argv:
        ts = [float(x) for x in sys.argv[sys.argv.index("--preview") + 1].split(",")]
        for t in ts:
            frame(t).save(f"{ROOT}/output/frase_{t:05.2f}.jpg", quality=90); print("ok", t)
        sys.exit()
    from multiprocessing import Pool
    n = int(math.ceil(DUR * FPS)); fdir = f"{ROOT}/output/frames"; os.makedirs(fdir, exist_ok=True)
    def job(i):
        p = f"{fdir}/{i:05d}.jpg"
        if not os.path.exists(p): frame(i / FPS).save(p, quality=93)
        return i
    with Pool(os.cpu_count()) as pool:
        for k, _ in enumerate(pool.imap_unordered(job, range(n), chunksize=4)):
            if k % 150 == 0: print(f"{k}/{n}", flush=True)
    subprocess.run(["python3", f"{ROOT}/audio.py"], check=True)
    subprocess.run(["ffmpeg", "-y", "-framerate", str(FPS), "-i", f"{fdir}/%05d.jpg", "-i", f"{ROOT}/output/mezcla.wav",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", f"{ROOT}/output/mef_limiter_editorial.mp4"], check=True)
