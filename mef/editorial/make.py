"""MEF Estudio · "El compresor" en 2D editorial (Python + PIL + numpy + ffmpeg).
Estética: grafito cálido, marfil y arcilla, serif editorial + grotesk, grano de papel.
Usa la voz y los tiempos ya generados: mef/audio/voz.wav + mef/scene/timeline.json.

Uso (desde la raíz del repo):
  python3 mef/editorial/make.py --preview 1.6,6.5,14,20.5,26,35,47.5,54,60
  python3 mef/editorial/make.py            # video completo (frames + audio + ffmpeg)
"""
import json, math, os, re, subprocess, sys, unicodedata
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS, SS = 1080, 1920, 30, 2
ROOT = "mef/editorial"
TL = json.load(open("mef/scene/timeline.json"))
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
SCENES = [("hook", 0.0), ("promesa", RANGES["promesa"][0]), ("problema", RANGES["problema"][0]),
          ("concepto", RANGES["concepto"][0]), ("revelacion", RANGES["revelacion"][0]), ("rack", RANGES["kick"][0]),
          ("aviso", RANGES["aviso"][0]), ("marca", RANGES["marca"][0]), ("cta", RANGES["cta"][0])]
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
    t0, t1 = SEG["promesa"]["start"] + 3.2, SEG["kick"]["start"]
    if not (t0 - 0.4 <= t < t1 + 0.6): return
    k = back((t - t0) / 0.45) if t < t1 else 1 - ease((t - t1) / 0.6)
    if k <= 0.01: return
    y = 300 - (1 - k) * 120
    s = "Números para tu kick  →  al final"; f = _font("/usr/share/fonts/opentype/inter/Inter-Bold.otf", 34 * SS); tw = f.getlength(s) / SS
    x0, x1 = 540 - tw / 2 - 44, 540 + tw / 2 + 44
    cv.d.rounded_rectangle([(x0 * SS, (y - 40) * SS), (x1 * SS, (y + 52) * SS)], radius=28 * SS, fill=IVORY)
    cv.d.text((540 * SS, (y - 4) * SS), s, font=f, fill=INK, anchor="mm")
    p = clamp((t - t0) / (t1 - t0))
    cv.d.rounded_rectangle([((x0 + 34) * SS, (y + 28) * SS), ((x1 - 34) * SS, (y + 36) * SS)], radius=4 * SS, fill=(0, 0, 0, 40))
    cv.d.rounded_rectangle([((x0 + 34) * SS, (y + 28) * SS), ((x0 + 34 + (x1 - x0 - 68) * p) * SS, (y + 36) * SS)], radius=4 * SS, fill=CLAY)

def topbar(cv, t):
    cv.d.rectangle([0, 0, W * SS * t / DUR, 7 * SS], fill=CLAY)

# ----------------------------------------------------------------- escenas
def sc_hook(img, t):
    # cámara cae desde muy cerca y con giro hacia la onda
    k = ease(t / 1.6)
    cv = Cv(img, z=lerp(2.6, 1.0, k), cy=lerp(760, 900, k), oy=-kick_env(t) * 10)
    bg(cv)
    knobv = lerp(0.88, 0.26, eio((t - 0.6) / 2.2))
    grow = lerp(0.55, 1.15, eio((t - 0.6) / 2.2))
    kick_wave(cv, 120, 960, 800, 220 * grow * (0.9 + 0.1 * kick_env(t)), t, width=9)
    # medidores al rojo
    meter(cv, 58, 560, 34, 480, clamp(0.55 + 0.45 * kick_env(t) * grow), hot=0.75)
    meter(cv, 988, 560, 34, 480, clamp(0.5 + 0.48 * kick_env(t + 0.03) * grow), hot=0.75)
    # perilla gigante de volumen
    knob(cv, 540, 1060, 125, knobv, "VOLUMEN", t)
    a = lerp(math.radians(135), math.radians(405), knobv)
    cv.line([(540 + 180 * math.cos(a + 0.5), 1060 + 180 * math.sin(a + 0.5)), (540 + 180 * math.cos(a + 0.18), 1060 + 180 * math.sin(a + 0.18))], CLAY, 6)
    ui = Cv(img)
    caption(ui, t, "¿*BAJAR* el volumen = sonar *MÁS DURO*?", y=360, size=92, t0=0.0)

def club(cv, t, dolly):
    vp = (540, 760)
    cv.d.rectangle([0, 0, W * SS, H * SS], fill=(16, 16, 15))
    # piso en perspectiva
    for i in range(-14, 15):
        cv.line([vp, (540 + i * 220, 2000)], (255, 255, 255, 22), 2)
    for j in range(16):
        u = ((j + dolly * 3) % 16) / 16; y = vp[1] + (2000 - vp[1]) * u ** 2.2
        cv.line([(-400, y), (1480, y)], (255, 255, 255, int(10 + 30 * u)), 2)
    # láseres desde la cabina
    for i in range(7):
        a = math.radians(-90 + (i - 3) * 16 + math.sin(t * 1.3 + i) * 12)
        c = CLAY if i % 2 == 0 else SKY
        cv.line([(540, 880), (540 + math.cos(a) * 1500, 880 + math.sin(a) * 1500)], c + (int(70 + 120 * kick_env(t + i * 0.01)),), 5)
    # cabina
    cv.poly([(250, 900), (830, 900), (900, 1080), (180, 1080)], fill=(36, 35, 32), outline=(0, 0, 0), width=2)
    cv.rect(250, 880, 830, 905, fill=INK3)
    for dx in (360, 720):
        cv.ell(dx, 892, 80, 15, fill=(60, 59, 55)); a = t * 3 + dx
        cv.line([(dx, 892), (dx + math.cos(a) * 70, 892 + math.sin(a) * 13)], CLAY, 4)
    cv.rect(470, 870, 610, 900, fill=(60, 59, 55), r=4)
    for k in range(4): cv.rect(488 + k * 30, 876, 500 + k * 30, 896 - 10 * kick_env(t + k * .05), fill=IVORY, r=2)
    # silueta DJ
    by = 800 + kick_env(t) * 8
    cv.circ(540, by - 50, 34, fill=(12, 12, 11)); cv.poly([(470, 880), (610, 880), (590, by - 10), (490, by - 10)], fill=(12, 12, 11))
    # público
    for i in range(13):
        x = -20 + i * 92 + (i % 2) * 30; bob = kick_env(t + (i % 3) * 0.04) * 16
        y = 1600 + (i % 2) * 70 - bob
        cv.circ(x, y, 50, fill=(8, 8, 8)); cv.ell(x, y + 160, 95, 110, fill=(8, 8, 8))
        if i in (2, 9): cv.line([(x + 30, y + 70), (x + 70, y - 160 - bob)], (8, 8, 8), 26)

def sc_promesa(img, t):
    lt = t - RANGES["promesa"][0]
    cv = Cv(img, z=lerp(1.05, 1.25, eio(lt / 7)), cx=lerp(470, 610, eio(lt / 7)), cy=900)
    club(cv, t, lt * 0.35)
    ui = Cv(img); pill_progress(ui, t)
    caption(ui, t, "El truco detrás del *club*", y=470, size=78, t0=RANGES["promesa"][0] + 0.2)

def sc_problema(img, t):
    lt = t - RANGES["problema"][0]
    cv = Cv(img, z=lerp(1.25, 1.0, ease(lt / 1.4)), cy=lerp(1050, 960, ease(lt / 1.4)), ox=math.sin(lt * 0.5) * 12)
    bg(cv)
    floor, top, ceil = 1240, 560, 560
    xs, hs = landscape(t)
    # techo 0 dBFS
    hot = max(0.0, kick_env(t) - 0.3)
    cv.rect(40, ceil - 120, 1040, ceil, fill=CLAY + (int(30 + 60 * hot),))
    for x in range(40, 1040, 30): cv.line([(x, ceil - 120), (x + 60, ceil)], CLAY + (40,), 3)
    cv.line([(40, ceil), (1040, ceil)], CLAY, 6)
    cv.text(70, ceil - 26, "0 dBFS", F(MONO, 34), CLAY, anchor="ls")
    draw_land(cv, xs, hs, floor, top, clay_above=0.86)
    for px, lab in ((220, "KICK"), (520, "CLAP"), (690, "KICK"), (930, "CLAP")):
        cv.text(px, ceil + 40, lab, F(GROT, 26, 700), INK)
    for px, lab, hh in ((120, "bajo", 0.25), (380, "pads", 0.35), (820, "hats", 0.35)):
        cv.text(px, lerp(floor, top, hh) - 30, lab, F(SERIFI, 30, 600), GREY)
    cv.line([(40, floor), (1040, floor)], (255, 255, 255, 40), 2)
    caption(Cv(img), t, "Los *picos* tocan el techo", y=330, size=82, t0=RANGES["problema"][0] + 0.15)

def comp_state(t):
    t0 = RANGES["concepto"][0]
    thr = lerp(1.05, 0.55, eio((t - (t0 + 0.4)) / 1.8))
    comp = eio((t - wt("concepto", "aplasta")) / 0.6) if t < RANGES["revelacion"][0] + 0.1 else 1.0
    return thr, comp

def sc_concepto(img, t):
    lt = t - RANGES["concepto"][0]
    cv = Cv(img, z=1.0, cy=960 + math.sin(lt * 0.7) * 10)
    bg(cv)
    floor, top, ceil = 1240, 560, 560
    thr, comp = comp_state(t)
    xs, hs = landscape(t, comp=comp, thr=thr)
    cv.line([(40, ceil), (1040, ceil)], CLAY + (150,), 4)
    cv.text(70, ceil - 20, "0 dBFS", F(MONO, 28), CLAY + (170,), anchor="ls")
    draw_land(cv, xs, hs, floor, top, clay_above=thr)
    ty = lerp(floor, top, thr)
    # plano threshold
    cv.rect(40, ty - 6, 1040, ty + 6, fill=SKY + (90,))
    for x in range(40, 1040, 40): cv.line([(x, ty), (x + 22, ty)], SKY, 5)
    cv.text(60, ty - 22, "THRESHOLD", F(GROT, 30, 700), SKY, anchor="ls")
    # prensa que baja hasta el umbral (sobre las puntas comprimidas)
    peak_after = thr + (0.99 - thr) / 4
    py = lerp(200, lerp(floor, top, peak_after) - 4 + kick_env(t) * 3, eio((t - (wt("concepto", "aplasta") - 0.5)) / 0.7))
    press(cv, 110, 970, py)
    # medidor de gain reduction
    gr = comp * (0.25 + 0.6 * kick_env(t))
    cv.rect(990, 680, 1036, 1150, fill=(255, 255, 255, 12), r=8)
    cv.rect(994, 684, 1032, 684 + 462 * gr, fill=SKY, r=6)
    cv.text(1013, 1180, "GR", F(GROT, 24, 700), GREY)
    ui = Cv(img)
    caption(ui, t, "*Threshold* + *Ratio*", y=330, size=86, t0=RANGES["concepto"][0] + 0.1)
    if t > wt("concepto", "reichio") - 0.2:
        k = back((t - wt("concepto", "reichio") + 0.2) / 0.4)
        ui.d.rounded_rectangle([(380 * SS, (1290 - 10 * k) * SS), (700 * SS, (1290 + 60 * k) * SS)], radius=20 * SS, fill=SKY)
        ui.d.text((540 * SS, (1290 + 26 * k) * SS), "RATIO 4:1", font=MONO(44), fill=INK, anchor="mm")

def sc_revelacion(img, t):
    t0 = RANGES["revelacion"][0]; lt = t - t0
    split = eio((t - wt("revelacion", "mismo")) / 0.7)
    floor, top, ceil = 1240, 560, 560
    thr = 0.55
    mk = (0.99 - (thr + (0.99 - thr) / 4)) * eio((t - wt("revelacion", "subes")) / 1.0)
    if split < 1:
        cv = Cv(img, z=lerp(1.0, 0.9, split), cy=960); bg(cv)
        xs, hs = landscape(t, comp=1, thr=thr, makeup=mk)
        cv.line([(40, ceil), (1040, ceil)], CLAY, 6); cv.text(70, ceil - 20, "0 dBFS", F(MONO, 28), CLAY, anchor="ls")
        draw_land(cv, xs, hs, floor, top)
        # flechas de make-up
        if mk > 0.01:
            for x in (160, 540, 920):
                y = lerp(1180, 1000, eio((t - wt("revelacion", "subes")) / 1.0))
                cv.line([(x, y + 90), (x, y)], OLIVE, 10); cv.poly([(x - 26, y + 10), (x + 26, y + 10), (x, y - 30)], fill=OLIVE)
            cv.text(540, 1300, "MAKE-UP GAIN", F(GROT, 34, 700), OLIVE)
    if split > 0:
        # antes / después lado a lado
        ov = Image.new("RGB", img.size, INK); cv2 = Cv(ov); bg(cv2)
        for side, (lab, cfg) in enumerate((("ANTES", dict()), ("DESPUÉS", dict(comp=1, thr=thr, makeup=(0.99 - (thr + (0.99 - thr) / 4)))))):
            cvp = Cv(ov, z=0.5, cx=540, cy=960, ox=(-262 if side == 0 else 262), oy=40)
            xs, hs = landscape(t, **cfg)
            cvp.rect(40, 440, 1040, 1290, fill=INK2, r=30)
            cvp.line([(40, ceil), (1040, ceil)], CLAY, 8)
            draw_land(cvp, xs, hs, floor, top)
            # medidor de loudness
            rms = 0.42 if side == 0 else 0.78
            cvp.rect(120, 1330, 960, 1390, fill=(255, 255, 255, 18), r=30)
            cvp.rect(120, 1330, 120 + 840 * rms * (0.9 + 0.1 * kick_env(t)), 1390, fill=OLIVE if side else GREY, r=30)
            cv2.text(278 + side * 524, 690, lab, F(GROT, 40, 700), CLAY if side else GREY, spacing=4)
        cv2.text(278, 1268, "picos altos · cuerpo bajo", F(SERIFI, 28, 600), GREY)
        cv2.text(802, 1268, "mismo techo · más densidad", F(SERIFI, 28, 600), IVORY)
        a = split
        if a < 1: img.paste(Image.blend(img, ov, a))
        else: img.paste(ov)
    caption(Cv(img), t, "Menos picos = *más volumen*", y=330, size=84, t0=t0 + 0.1)

RACK = None
def rack_vals(t):
    ka = wt("kick", "atak"); kr = wt("kick", "rilis"); kq = wt("kick", "reichio"); kg = wt("kick", "tres")
    bb = wt("bus", "bus"); b2 = wt("bus", "dos"); b1 = wt("bus", "uno")
    sp = lambda tt, d=0.6: eio((t - tt) / d)
    att = lerp(0.15, 0.32, sp(ka))
    rel = lerp(0.15, 0.55, sp(kr))
    rat = lerp(0.15, 0.62, sp(kq)); rat = lerp(rat, 0.38, sp(b2))
    grd = lerp(0.0, 0.62, sp(kg)); grd = lerp(grd, 0.3, sp(b1))
    return dict(att=att, rel=rel, rat=rat, gr=grd, ka=ka, kr=kr, kq=kq, kg=kg, bb=bb, b2=b2, b1=b1)

def card(cv, x, y, s, t0, t, col=CLAY, fg=INK, size=40):
    if t < t0: return
    k = back((t - t0) / 0.35); f = MONO(size); tw = f.getlength(s) / SS
    cv.d.rounded_rectangle([((x - tw / 2 - 22) * SS, (y - 30 * k) * SS), ((x + tw / 2 + 22) * SS, (y + 30 * k) * SS)], radius=18 * SS, fill=col)
    if k > 0.6: cv.d.text((x * SS, y * SS), s, font=f, fill=fg, anchor="mm")

def sc_rack(img, t):
    t0 = RANGES["kick"][0]; lt = t - t0
    v = rack_vals(t); bus = t >= v["bb"] - 0.2
    cv = Cv(img, z=lerp(1.25, 1.0, ease(lt / 1.2)), cy=lerp(1000, 900, ease(lt / 1.2)) + math.sin(lt * 0.6) * 6)
    bg(cv)
    # carcasa
    cv.rect(70, 500, 1010, 1310, fill=(38, 37, 34), outline=(0, 0, 0), width=3, r=26)
    cv.rect(70, 500, 1010, 580, fill=(48, 47, 44), r=26); cv.rect(70, 560, 1010, 580, fill=(48, 47, 44))
    for sx, sy in ((100, 530), (980, 530), (100, 1280), (980, 1280)): cv.circ(sx, sy, 9, fill=(25, 25, 23))
    cv.text(130, 540, ("COMP · BUS DE BATERÍA" if bus else "COMP · KICK"), F(GROT, 30, 700), CLAY if bus else IVORY, anchor="lm")
    spark(cv, 950, 540, 18, t * 1.2, CLAY, 4)
    cv.circ(900, 540, 9, fill=CLAY if kick_env(t) > 0.4 else (80, 40, 30))
    knob(cv, 300, 735, 92, v["att"], "ATTACK", t)
    knob(cv, 780, 735, 92, v["rel"], "RELEASE", t)
    knob(cv, 300, 1035, 92, v["rat"], "RATIO", t)
    # medidor de aguja GR
    cx, cy = 780, 1140
    cv.d.pieslice([cv.P(cx - 170, cy - 170), cv.P(cx + 170, cy + 170)], 200, 340, fill=(232, 226, 205))
    for i in range(9):
        a = math.radians(lerp(205, 335, i / 8))
        cv.line([(cx + math.cos(a) * 140, cy + math.sin(a) * 140), (cx + math.cos(a) * 160, cy + math.sin(a) * 160)], INK, 4)
    g = v["gr"] * (0.55 + 0.45 * kick_env(t, 0.115))
    a = math.radians(lerp(335, 205, clamp(g)))
    cv.line([(cx, cy), (cx + math.cos(a) * 150, cy + math.sin(a) * 150)], CLAY_D, 6)
    cv.circ(cx, cy, 14, fill=INK)
    cv.text(cx, cy + 46, "GAIN REDUCTION", F(GROT, 28, 700), GREY)
    ui = Cv(img)
    # tarjetas de valores
    if not bus:
        card(ui, 300, 940, "10–30 ms", v["ka"] + 0.3, t)
        card(ui, 780, 940, "≈115 ms", v["kr"] + 0.9, t)
        card(ui, 300, 1240, "4:1", v["kq"] + 0.2, t)
        card(ui, 780, 1250, "−3 a −6 dB", v["kg"] + 0.3, t)
    else:
        card(ui, 300, 940, "10–30 ms", 0, t, col=INK3, fg=GREY)
        card(ui, 780, 940, "≈115 ms", 0, t, col=INK3, fg=GREY)
        card(ui, 300, 1240, "2:1", v["b2"] + 0.1, t, col=SKY)
        card(ui, 780, 1250, "−1 a −3 dB", v["b1"] + 0.3, t, col=SKY)
    if not bus:
        caption(ui, t, "Números para tu *kick*", y=330, size=84, t0=t0 + 0.1)
        if t > v["kr"]: ui.d.text((540 * SS, 420 * SS), "release al tempo · 130 BPM", font=SERIFI(34, 600), fill=GREY, anchor="mm")
    else:
        caption(ui, t, "Bus de *batería*: para pegar todo", y=330, size=74, t0=v["bb"] - 0.2)

def sc_aviso(img, t):
    t0 = RANGES["aviso"][0]; lt = t - t0
    ts = wt("aviso", "aplastas")
    slam = eio((t - ts) / 0.22)
    shake = 22 * math.exp(-max(0, t - ts - 0.22) / 0.15) * (1 if t > ts + 0.22 else 0)
    cv = Cv(img, z=1.0, ox=math.sin(t * 90) * shake, oy=math.cos(t * 70) * shake)
    bg(cv)
    floor, top, ceil = 1240, 560, 560
    xs, hs = landscape(t, comp=1, thr=lerp(0.55, 0.2, slam), ratio=lerp(4, 20, slam), makeup=0.0, brick=slam * 0.92)
    cv.line([(40, ceil), (1040, ceil)], CLAY, 6)
    draw_land(cv, xs, hs, floor, top, brick=slam)
    py = lerp(320, ceil + 6, slam) if t < ts + 0.22 else ceil + 6
    press(cv, 60, 1020, py)
    if t > wt("aviso", "carton"):
        k = back((t - wt("aviso", "carton")) / 0.3)
        c2 = Cv(img); c2.d.rounded_rectangle([(300 * SS, (930 - 50 * k) * SS), (780 * SS, (930 + 50 * k) * SS)], radius=10 * SS, fill=(232, 214, 180))
        if k > 0.6: c2.d.text((540 * SS, 930 * SS), "KICK DE CARTÓN", font=GROT(44, 700), fill=(110, 80, 45), anchor="mm")
    caption(Cv(img), t, "*Sobrecompresión* = sin punch", y=330, size=80, t0=t0 + 0.1)

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
    if lt < 0.9:  # salimos de la prensa: la placa sube y se abre
        cv = Cv(img); bg(cv)
        xs, hs = landscape(t, comp=1, thr=0.55, brick=1 - ease(lt / 0.8))
        draw_land(cv, xs, hs, 1240, 560, brick=1 - ease(lt / 0.8))
        press(cv, 60, 1020, lerp(566, -200, ease(lt / 0.8)))
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

SCN = dict(hook=sc_hook, promesa=sc_promesa, problema=sc_problema, concepto=sc_concepto, revelacion=sc_revelacion,
           rack=sc_rack, aviso=sc_aviso, marca=sc_marca, cta=sc_cta)
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
        kicker(ui, t, {"promesa": "TRUCO DE MEZCLA", "problema": "01 · EL PROBLEMA", "concepto": "02 · EL COMPRESOR",
                       "revelacion": "03 · MAKE-UP GAIN", "rack": "04 · LOS NÚMEROS", "aviso": "05 · OJO",
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
                    "-shortest", "-movflags", "+faststart", f"{ROOT}/output/mef_compresor_editorial.mp4"], check=True)
