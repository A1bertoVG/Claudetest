"""MEF Estudio #6 · "El clipper" en 2D editorial (Python + PIL + numpy + ffmpeg).
Estética: grafito cálido, marfil y arcilla, serif editorial + grotesk, grano de papel.
Usa la voz y los tiempos ya generados: mef/clipper/audio/voz.wav + mef/clipper/scene/timeline.json (scripts/voz.py).

Uso (desde la raíz del repo):
  python3 mef/clipper/make.py --preview 2.5,25,52
  python3 mef/clipper/make.py    # video completo (frames + audio + ffmpeg)
"""
import json, math, os, re, subprocess, sys, unicodedata
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, SS = 1080, 1920, 30, 2
ROOT = "mef/clipper"
TL = json.load(open("mef/clipper/scene/timeline.json"))
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
# escenas visuales
SCENES = [(s, 0.0 if s == "hook" else RANGES[s][0]) for s in ORDER]
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
    t0, t1 = wt("intro", "ajuste") - 0.1, SEG["secreto"]["start"]
    if not (t0 - 0.4 <= t < t1 + 0.6): return
    k = back((t - t0) / 0.45) if t < t1 else 1 - ease((t - t1) / 0.6)
    if k <= 0.01: return
    y = 300 - (1 - k) * 120
    s = "El ajuste secreto  →  al final"; f = _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 34 * SS); tw = f.getlength(s) / SS
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
         over_col=CLAY, mark_thr=None, ghost=False, col=IVORY, x0=70, x1=1010, step=9, bw=6, refl=True, dim=0.0):
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
        base = mix(col, (150, 148, 140), dim)
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

# ----------------------------------------------------------------- compresión paralela
L1, L2, LA = 830, 1200, 200      # línea base de cada carril y altura
PTHR, PRAT, PMK = 0.16, 10.0, 0.36

def par_amp(u, k=1.0, pump=0.0):
    """señal del bus paralelo: aplastada (threshold bajo, 10:1) + make-up; k=0 sin comprimir"""
    a = sig(u)
    c = a - max(0, a - PTHR) * (1 - 1 / PRAT)
    c = c + PMK - pump * math.exp(-((u % B)) / 0.115) * 0.22
    return lerp(a, c, k)

def lane(cv, t, cy, amp_fn, col=IVORY, top_col=None, split=None, A=LA, x0=70, x1=1010, step=9, bw=6, alpha=255, speed=320):
    """carril de barras que avanza; amp_fn(u)->(alto_total, alto_base)"""
    nb = int((x1 - x0) / step)
    for i in range(nb):
        x = x0 + i * step; u = t - (x - x0) / speed
        tot, base = amp_fn(u)
        tot = min(tot, 1.12); base = min(base, tot)
        cv.rect(x, cy - base * A, x + bw, cy, fill=col + (alpha,), r=2)
        if top_col and tot > base + 0.005: cv.rect(x, cy - tot * A, x + bw, cy - base * A + 2, fill=top_col + (alpha,), r=2)
        cv.rect(x, cy + 6, x + bw, cy + 6 + tot * A * 0.4, fill=(top_col or col) + (int(40 * alpha / 255),), r=2)
    cv.line([(x0 - 10, cy), (x1 + 10, cy)], (255, 255, 255, int(50 * alpha / 255)), 2)

def lane_label(cv, x, y, s, col, k=1.0):
    if k <= 0: return
    cv.text(x, y, s, F(GROT, 28, 700), col + (int(255 * k),), anchor="lm", spacing=2)

def big_num(ui, t, n, t0):
    """número de tip gigante a la izquierda + 5 puntos de avance"""
    k = back((t - t0) / 0.4)
    if k <= 0: return
    f = SERIF(250 * k, 900)
    ui.d.text((150 * SS, 380 * SS), str(n), font=f, fill=CLAY, anchor="mm")
    for i in range(5):
        on = (5 - i) >= n
        x = 380 + i * 34
        ui.d.ellipse([((x - 8) * SS, 222 * SS), ((x + 8) * SS, 238 * SS)], fill=CLAY if (5 - i) == n else (IVORY if on else (70, 69, 64)))
    ui.d.text((560 * SS, 230 * SS), f"TIP {n} DE 5", font=GROT(26, 600), fill=GREY, anchor="lm")

def tip_caption(ui, t, s, t0, size=68):
    k = ease((t - t0) / 0.35)
    if k <= 0: return
    ov = Image.new("RGBA", ui.img.size, (0, 0, 0, 0)); c2 = Cv(ov)
    rich(c2, 300, 380 + (1 - k) * 30, s, size, anchor="l", maxw=730)
    if k < 1: ov.putalpha(ov.getchannel("A").point(lambda a: int(a * k)))
    ui.img.paste(ov, (0, 0), ov)

def orig_fn(u): a = sig(u); return a, a
def lanes_default(cv, t, pk=0.0, pump=0.0, l2y=L2, l2a=255, l1a=255, l2_label=True):
    if l1a > 0:
        lane(cv, t, L1, orig_fn, IVORY, alpha=l1a)
        lane_label(cv, 70, L1 - LA - 40, "ORIGINAL · golpe", IVORY, l1a / 255)
    if l2a > 0:
        lane(cv, t, l2y, lambda u: (par_amp(u, pk, pump),) * 2, CLAY, alpha=l2a)
        if l2_label: lane_label(cv, 70, l2y - LA - 40, "BUS PARALELO · cuerpo", CLAY, l2a / 255)

def padlock(cv, x, y, s, col=IVORY):
    cv.d.arc([cv.P(x - 22 * s, y - 52 * s), cv.P(x + 22 * s, y - 8 * s)], 180, 360, fill=col, width=int(cv.L(7 * s)))
    cv.line([(x - 22 * s, y - 30 * s), (x - 22 * s, y - 10 * s)], col, 7 * s); cv.line([(x + 22 * s, y - 30 * s), (x + 22 * s, y - 10 * s)], col, 7 * s)
    cv.rect(x - 34 * s, y - 12 * s, x + 34 * s, y + 38 * s, fill=col, r=8 * s)
    cv.circ(x, y + 10 * s, 7 * s, fill=INK)

def sum_fn(g):
    def f(u):
        a = sig(u); p = par_amp(u, 1.0, 1.0)
        return min(1.08, a + g * p * 0.62), a
    return f


def phone(cv, x, y, w, h):
    cv.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, fill=(14, 14, 13), outline=(90, 88, 82), width=6, r=46)
    cv.rect(x - 50, y - h / 2 + 22, x + 50, y - h / 2 + 36, fill=(40, 40, 37), r=7)

def monitor(cv, x, y, s, t):
    cv.rect(x - 70 * s, y - 130 * s, x + 70 * s, y + 130 * s, fill=(22, 22, 20), outline=(60, 59, 55), width=3, r=14 * s)
    cv.circ(x, y - 70 * s, 26 * s, fill=(50, 49, 45))
    pr = (52 + kick_env(t) * 8) * s
    cv.circ(x, y + 50 * s, pr, fill=(50, 49, 45)); cv.circ(x, y + 50 * s, pr * 0.4, fill=(70, 68, 63))



# ----------------------------------------------------------------- clipper
def clip_lane(cv, t, cy, A, c=None, gain=1.0, gfn=None, x0=70, x1=1010, step=9, bw=6, speed=320, col=IVORY, fn=None,
              ghost=True, sparks=True, soft=0.0, noise=0.0, refl=True, alpha=255):
    """barras que avanzan; c = nivel de la cuchilla (fracción de A). gfn(u) = ganancia variable (limiter)."""
    fn = fn or sig
    nb = int((x1 - x0) / step); hits = []
    for i in range(nb):
        x = x0 + i * step; u = t - (x - x0) / speed
        a = fn(u) * gain * (gfn(u) if gfn else 1.0)
        if noise: a *= 1 + noise * (bh(int(u * 300), 3) - 0.5)
        out = a
        if c is not None and a > c:
            out = c if soft <= 0 else c + (a - c) * 0.12 * soft
            if ghost: cv.rect(x, cy - min(a, 1.25) * A, x + bw, cy - out * A, fill=CLAY + (int(70 * alpha / 255),), r=2)
            hits.append(x + bw / 2)
        cv.rect(x, cy - out * A, x + bw, cy, fill=col + (alpha,), r=2)
        if c is not None and a > c: cv.rect(x - 1, cy - out * A - 3, x + bw + 1, cy - out * A + 3, fill=CLAY + (alpha,), r=2)
        if refl: cv.rect(x, cy + 6, x + bw, cy + 6 + out * A * 0.4, fill=col + (int(40 * alpha / 255),), r=2)
    cv.line([(x0 - 10, cy), (x1 + 10, cy)], (255, 255, 255, int(50 * alpha / 255)), 2)
    if c is not None:
        yb = cy - c * A
        cv.line([(x0 - 20, yb), (x1 + 20, yb)], CLAY + (alpha,), 5)
        if sparks:
            for hx in hits[::3]:
                for j in range(3):
                    an = -math.pi / 2 + (bh(int(hx), j) - 0.5) * 2.2; r = 14 + 24 * bh(int(hx * 7), j)
                    cv.line([(hx, yb), (hx + math.cos(an) * r, yb + math.sin(an) * r)], (255, 210, 180, int(200 * alpha / 255)), 3)
    return hits

def blade_tag(cv, x, y, s="CLIPPER"):
    cv.rect(x - 8, y - 20, x + GROT(24, 700).getlength(s) / SS + 22, y + 18, fill=CLAY, r=10)
    cv.text(x + 7, y, s, F(GROT, 24, 700), INK, anchor="lm")

def loud_meter(cv, x, y0, y1, v, lab="VOLUMEN", col=OLIVE):
    cv.rect(x, y0, x + 40, y1, fill=(255, 255, 255, 14), r=8)
    h = (y1 - y0 - 8) * clamp(v)
    cv.rect(x + 4, y1 - 4 - h, x + 36, y1 - 4, fill=col, r=6)
    cv.text(x + 20, y1 + 24, lab, F(GROT, 18, 700), GREY)

def sc_hook(img, t):
    k = ease(t / 1.4)
    cv = Cv(img, z=lerp(1.3, 1.0, k), cy=lerp(900, 960, k)); bg(cv)
    drop = ease((t - 0.6) / 0.35)
    c = lerp(1.4, 0.7, drop)
    g = lerp(1.0, 1.22, ease((t - 1.6) / 1.0))
    clip_lane(cv, t, 1150, 520, c=c if drop > 0 else None, gain=g, x1=950)
    if drop > 0: blade_tag(cv, 70, 1150 - c * 520 - 40)
    loud_meter(cv, 990, 600, 1180, lerp(0.5, 0.85, ease((t - 1.6) / 1.0)) * (0.95 + 0.05 * kick_env(t)))
    caption(Cv(img), t, "Más volumen que el *limiter*", y=340, size=84, t0=0.15)

def boxes3(cv, t, y, t_show, labels=("DÓNDE", "CUÁNTO", None)):
    for i, lab in enumerate(labels):
        k = back((t - t_show[i]) / 0.3)
        if k <= 0: continue
        x = 540 + (i - 1) * 300; w, h = 130 * k, 60 * k
        cv.rect(x - w, y - h, x + w, y + h, fill=INK3, outline=MUTE, width=3, r=18)
        if lab: cv.text(x, y, lab, F(GROT, 34 * k, 700), IVORY)
        else:
            padlock(cv, x - 60 * k, y - 4, 0.6 * k, CLAY); cv.text(x + 30 * k, y, "AJUSTE", F(GROT, 30 * k, 700), CLAY)

def sc_intro(img, t):
    t0 = RANGES["intro"][0]
    cv = Cv(img); bg(cv)
    boxes3(cv, t, 600, (wt("intro", "donde"), wt("intro", "cuanto"), wt("intro", "ajuste")))
    clip_lane(cv, t, 1200, 420, c=0.75, gain=1.0, x1=1010)
    ui = Cv(img); caption(ui, t, "El *clipper*", y=430, size=100, t0=t0 + 0.1); pill_progress(ui, t)

def lim_gain(u):  # el limiter agacha TODO el volumen tras cada golpe y luego se recupera
    return 1 - 0.32 * math.exp(-((u % B)) / 0.16) * min(1, (u % B) / 0.004 + 0.3)

def sc_que(img, t):
    t0 = RANGES["que"][0]
    cv = Cv(img); bg(cv)
    tc, tm = wt("que", "corta"), wt("que", "milisegundos")
    # panel limiter
    cv.rect(50, 520, 1030, 900, fill=INK2, r=22)
    cv.text(80, 560, "LIMITER · baja todo", F(GROT, 28, 700), SKY, anchor="lm")
    clip_lane(cv, t, 850, 300, gfn=lim_gain, x0=90, x1=990, refl=False)
    pts = [(x, 600 + 80 * (1 - lim_gain(t - (x - 90) / 320))) for x in range(90, 991, 10)]
    cv.line(pts, SKY, 4)
    # panel clipper
    kc = ease((t - tc + 0.3) / 0.5)
    cv.rect(50, 930, 1030, 1310, fill=INK2, r=22)
    cv.text(80, 970, "CLIPPER · corta la punta", F(GROT, 28, 700), CLAY, anchor="lm")
    clip_lane(cv, t, 1260, 300, c=lerp(1.3, 0.72, kc), x0=90, x1=990, refl=False, sparks=kc > 0.9)
    if t > tm:
        k = back((t - tm) / 0.35)
        cv.rect(760, 990 - 26 * k, 1000, 990 + 26 * k, fill=IVORY, r=16)
        if k > 0.6: cv.text(880, 990, "golpe ≈ 2 ms", lambda z: _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 28 * SS), INK)
    caption(Cv(img), t, "Limiter: *baja* · Clipper: *corta*", y=360, size=72, t0=t0 + 0.1)

def sc_porque(img, t):
    t0 = RANGES["porque"][0]
    cv = Cv(img); bg(cv)
    ts, tl, tsu = wt("porque", "espacio"), wt("porque", "limiter"), wt("porque", "sube")
    cy, A = 1220, 600
    c = 0.8
    up = eio((t - tsu) / 1.0)
    g = lerp(1.0, 1 / c * 0.98, up)
    # techo 0 dBFS
    cv.line([(50, cy - A), (1030, cy - A)], (255, 255, 255, 90), 3)
    cv.text(60, cy - A - 12, "0 dBFS", F(MONO, 26), GREY, anchor="ls")
    hk = ease((t - ts) / 0.5) * (1 - up)
    if hk > 0:
        cv.rect(70, cy - A, 950, cy - c * A, fill=CLAY + (int(60 * hk),))
        cv.text(510, cy - (1 + c) / 2 * A, "espacio libre (headroom)", F(SERIFI, 32, 600), IVORY + (int(255 * hk),))
    clip_lane(cv, t, cy, A, c=c * g, gain=g, x1=950)
    gr = lerp(0.75, 0.25, ease((t - tl) / 0.8))
    loud_meter(cv, 990, 560, 1180, gr * (0.85 + 0.15 * kick_env(t)), lab="GR LIM", col=SKY)
    ui = Cv(img)
    caption(ui, t, "Recorta *1–2 dB*, gana *volumen*", y=360, size=70, t0=t0 + 0.1)
    card(ui, 540, 520, "−1 a −2 dB", wt("porque", "uno") + 0.3, t)

def bass_fn(u):  # sonido largo: onda de bajo sostenida
    return 0.62 + 0.25 * math.sin(u * 2 * math.pi * 1.0) * 0.5 + 0.12 * math.sin(u * 9)

def sc_bucle1(img, t):
    t0 = RANGES["bucle1"][0]; lt = t - t0
    sh = 8 * ease(lt / 0.6)
    cv = Cv(img, ox=math.sin(t * 70) * sh, oy=math.cos(t * 55) * sh); bg(cv)
    clip_lane(cv, t, 1200, 520, c=0.55, fn=bass_fn, noise=0.5 * ease(lt / 0.6), x1=1010)
    caption(Cv(img), t, "Pero *cuidado*…", y=360, size=96, t0=t0 + 0.05)

def transfer_graph(cv, x0, y0, s, t, k_soft):
    cv.rect(x0, y0 - s, x0 + s, y0, fill=INK2, r=14)
    for i in range(1, 4):
        cv.line([(x0 + s * i / 4, y0 - s), (x0 + s * i / 4, y0)], (255, 255, 255, 14), 2)
        cv.line([(x0, y0 - s * i / 4), (x0 + s, y0 - s * i / 4)], (255, 255, 255, 14), 2)
    th = 0.6
    hard = [(x0 + s * u, y0 - s * min(u, th)) for u in np.linspace(0, 1, 60)]
    soft = [(x0 + s * u, y0 - s * (th * math.tanh(u / th))) for u in np.linspace(0, 1, 60)]
    cv.line(hard, (150, 148, 140), 5)
    cv.line(soft, CLAY + (int(255 * k_soft),), 7)
    cv.text(x0 + s - 10, y0 - s * th - 20, "hard", F(SERIFI, 28, 600), GREY, anchor="rs")
    cv.text(x0 + s * 0.5, y0 - s * 0.62 + 60, "soft", F(SERIFI, 30, 600), CLAY + (int(255 * k_soft),))
    cv.text(x0 + s / 2, y0 + 30, "entrada", F(SERIFI, 24, 600), GREY)
    cv.text(x0 - 20, y0 - s / 2, "salida", F(SERIFI, 24, 600), GREY, anchor="rm")

def sc_donde(img, t):
    t0 = RANGES["donde"][0]
    cv = Cv(img); bg(cv)
    tb, tm, tn, tso = wt("donde", "bus"), wt("donde", "master"), wt("donde", "nunca"), wt("donde", "soft")
    sw = eio((t - tso + 0.3) / 0.6)
    if sw < 1:
        rows = [("BUS DE BATERÍA", "✓", OLIVE, None, tb), ("MÁSTER", "✓", OLIVE, None, tm), ("BAJO / PAD", "✗", CLAY, bass_fn, tn)]
        for i, (lab, mk, col, fn, ton) in enumerate(rows):
            k = ease((t - ton + 0.2) / 0.4) * (1 - sw)
            if k <= 0: continue
            y = 700 + i * 230
            o = Image.new("RGBA", img.size, (0, 0, 0, 0)); co = Cv(o)
            co.rect(50, y - 190, 1030, y + 30, fill=INK2, r=20)
            co.text(80, y - 160, lab, F(GROT, 26, 700), IVORY, anchor="lm")
            co.text(1000, y - 160, mk, lambda z: _font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40 * SS), col, anchor="rm")
            clip_lane(co, t, y, 140, c=0.72 if fn is None else 0.55, fn=fn, x0=90, x1=990, refl=False, noise=0.5 if fn else 0, sparks=fn is None)
            if k < 1: o.putalpha(o.getchannel("A").point(lambda a: int(a * k)))
            img.paste(o, (0, 0), o)
    if sw > 0:
        o = Image.new("RGBA", img.size, (0, 0, 0, 0)); co = Cv(o)
        transfer_graph(co, 260, 1220, 560, t, ease((t - tso) / 0.6))
        if sw < 1: o.putalpha(o.getchannel("A").point(lambda a: int(a * sw)))
        img.paste(o, (0, 0), o)
    ui = Cv(img)
    if t < tso - 0.3: caption(ui, t, "*Batería* y *máster*: sí · Bajo: *no*", y=360, size=66, t0=t0 + 0.1)
    else: caption(ui, t, "Empieza con *soft clip*", y=360, size=84, t0=tso - 0.3)

def sc_bucle2(img, t):
    t0 = RANGES["bucle2"][0]
    cv = Cv(img); bg(cv)
    ui = Cv(img)
    padlock(ui, 540, 880, 2.4 * (1 + 0.08 * kick_env(t)), CLAY)
    caption(ui, t, "El *ajuste*…", y=360, size=96, t0=t0)

def sc_secreto(img, t):
    t0 = RANGES["secreto"][0]
    ta = wt("secreto", "activalo")
    os_k = eio((t - ta - 0.4) / 0.5)
    cv = Cv(img); bg(cv)
    gx0, gx1, gy0, gy1 = 70, 1010, 600, 1150
    cv.rect(gx0, gy0, gx1, gy1, fill=INK2, r=18)
    fx = lambda f: gx0 + (math.log10(f) - math.log10(20)) / 3 * (gx1 - gx0)
    for f, s in ((100, "100"), (1000, "1k"), (10000, "10k")):
        cv.line([(fx(f), gy0 + 10), (fx(f), gy1 - 10)], (255, 255, 255, 16), 2)
        cv.text(fx(f), gy1 + 26, s, F(MONO, 24), GREY)
    # armónicos reales (limpios)
    for k_ in range(1, 30):
        f = 220 * k_
        if f > 19000: break
        h = 0.85 / k_ ** 0.7 * (0.92 + 0.08 * kick_env(t))
        cv.line([(fx(f), gy1 - 10), (fx(f), gy1 - 10 - h * 480)], IVORY, 5)
    # frecuencias falsas (aliasing) que desaparecen con oversampling
    al = 1 - os_k
    if al > 0.01:
        for j in range(26):
            f = 10 ** (math.log10(60) + bh(j, 4) * (math.log10(19000) - math.log10(60)))
            h = (0.18 + 0.32 * bh(j, 5)) * (0.8 + 0.2 * math.sin(t * 9 + j))
            cv.line([(fx(f), gy1 - 10), (fx(f), gy1 - 10 - h * 480)], (150, 148, 140, int(255 * al)), 6)
        cv.text(gx1 - 20, gy0 + 40, "frecuencias falsas", F(SERIFI, 30, 600), GREY + (int(255 * al),), anchor="rm")
    # botón oversampling
    ui = Cv(img)
    ui.rect(240, 1210, 840, 1290, fill=INK3, r=40)
    ui.text(340, 1250, "OVERSAMPLING", F(GROT, 24, 700), GREY)
    xk = lerp(560, 700, os_k)
    ui.rect(xk - 70, 1218, xk + 70, 1282, fill=CLAY if os_k > 0.5 else (90, 88, 82), r=32)
    ui.text(560, 1250, "1x", F(MONO, 32), INK if os_k < 0.5 else GREY)
    ui.text(700, 1250, "4x", F(MONO, 32), INK if os_k >= 0.5 else GREY)
    padlock(ui, 150, 400, 1.6 * (1 + 0.04 * kick_env(t)), IVORY)
    tip_caption(ui, t, "*Oversampling* 4x o más", t0 + 0.1, size=72)

def big_num(ui, t, n, t0):
    """número de tip (1→4) + 4 puntos de avance"""
    k = back((t - t0) / 0.4)
    if k <= 0: return
    ui.d.text((150 * SS, 380 * SS), str(n), font=SERIF(250 * k, 900), fill=CLAY, anchor="mm")
    for i in range(4):
        x = 380 + i * 34
        ui.d.ellipse([((x - 8) * SS, 222 * SS), ((x + 8) * SS, 238 * SS)], fill=CLAY if i + 1 == n else (IVORY if i + 1 < n else (70, 69, 64)))
    ui.d.text((530 * SS, 230 * SS), f"TIP {n} DE 4", font=GROT(26, 600), fill=GREY, anchor="lm")

SIGN_SUB = "producción · mezcla · máster"
def sc_marca_a(img, t):
    sc_marca(img, t)
    tm = wt("marca", "escribenos")
    if t > tm - 0.1:
        k = back((t - tm + 0.1) / 0.4); ui = Cv(img)
        w2, h2 = 240 * k, 60 * k
        ui.rect(540 - w2, 1180 - h2, 540 + w2, 1180 + h2, fill=IVORY, r=40)
        ui.poly([(560, 1180 + h2 - 2), (610, 1180 + h2 - 2), (580, 1180 + h2 + 34 * k)], fill=IVORY)
        if k > 0.6: ui.text(540, 1180, "Escríbenos  →", lambda z: _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 46 * SS), INK)

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
        co.text(540, 548, SIGN_SUB, F(SERIFI, 30, 600), CLAY)
        if sign_k < 1: o.putalpha(o.getchannel("A").point(lambda v: int(v * sign_k)))
        cv.img.paste(o, (0, 0), o)

def sc_marca(img, t):
    t0 = RANGES["marca"][0]; lt = t - t0
    k = ease(lt / 1.6)
    if lt < 0.9:  # la onda sana atraviesa la escena y entramos al estudio
        cv = Cv(img, z=lerp(1.0, 1.4, ease(lt / 0.9))); bg(cv)
        lane(cv, t, 1050, sum_fn(0.7), IVORY, top_col=CLAY, A=330)
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

SCN = dict(hook=sc_hook, intro=sc_intro, que=sc_que, porque=sc_porque, bucle1=sc_bucle1, donde=sc_donde, bucle2=sc_bucle2, secreto=sc_secreto, marca=sc_marca_a, cta=sc_cta)
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
    lab = {"que": "01 · QUÉ ES", "porque": "02 · POR QUÉ DA VOLUMEN", "bucle1": "PERO…", "donde": "03 · DÓNDE SÍ Y DÓNDE NO", "bucle2": "LO PROMETIDO", "secreto": "EL AJUSTE SECRETO", "marca": "MEF ESTUDIO", "cta": "GUÁRDALO"}.get(name)
    if lab: kicker(ui, t, lab, y=210 if name == "intro" else 226)
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
    subprocess.run(["ffmpeg", "-y", "-framerate", str(FPS), "-i", f"{fdir}/%05d.jpg", "-i", "mef/editorial/output/mezcla_clipper.wav",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", "mef/editorial/output/mef_clipper_editorial.mp4"], check=True)
