"""MEF #2 (compresor → limiter) en el estilo 2D del brain rot. Basado en brainrot/make.py.
Brain rot 9:16 — "Un día en la vida de Claude (yo)". Todo en Python: frames con PIL + numpy,
sonido sintetizado con numpy, voz Kokoro, y ffmpeg para codificar.
Uso (desde la raíz del repo):  python3 brainrot/voz.py MODEL_DIR  &&  python3 brainrot/make.py [--preview 1,5,9]
"""
import json, math, re, subprocess, sys, unicodedata
import numpy as np, soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
ROOT = "mef/limiter/rot"
TL = json.load(open("mef/limiter/scene/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}; ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]
NM = "node_modules/@fontsource"
def font(path, size): return ImageFont.truetype(path, max(4, int(size)))
ANTON = lambda s: font(f"{NM}/anton/files/anton-latin-400-normal.woff2", s)
GROT = lambda s: font(f"{NM}/space-grotesk/files/space-grotesk-latin-700-normal.woff2", s)
HAND = lambda s: font(f"{NM}/caveat/files/caveat-latin-700-normal.woff2", s)
MONO = lambda s: font("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", s)
CORAL, CREAM, INK = (217, 119, 87), (245, 240, 232), (20, 20, 22)
YEL, RED, GRN, CYA, MAG, NAR = (255, 225, 77), (255, 59, 48), (46, 230, 122), (34, 230, 255), (255, 60, 199), (255, 122, 26)
BPM = 130; B = 60 / BPM

clamp = lambda x, a=0.0, b=1.0: max(a, min(b, x))
lerp = lambda a, b, t: a + (b - a) * t
def ease(x): x = clamp(x); return 1 - (1 - x) ** 3
def back(x): x = clamp(x); c1 = 1.70158; c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def h(a, b=0.0): s = math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - math.floor(s)
def kick_env(t): return math.exp(-((t % B)) / 0.08)

# --- tiempos por palabra (proporcional a letras) para sincronizar golpes y subtítulos
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
    return SEG[sid]["start"]
RANGES = {}
for i, sid in enumerate(ORDER):
    RANGES[sid] = (SEG[sid]["start"] - 0.12 if i else 0.0, SEG[ORDER[i + 1]]["start"] - 0.12 if i < len(ORDER) - 1 else DUR + 0.01)
def scene_at(t):
    for sid in ORDER:
        if RANGES[sid][0] <= t < RANGES[sid][1]: return sid
    return ORDER[-1]

# golpes (para zoom, temblor, aberración y sonido)
HITS = {
    wt("hook", "cristal"): (0.9, "glass"),
    wt("promesa", "compresor"): (0.5, "whip"), wt("promesa", "limiter"): (0.5, "whip"), wt("promesa", "error"): (0.6, "boom"),
    wt("cruda", "picos"): (0.8, "buzz"),
    wt("threshold", "cruza"): (0.6, "whip"),
    wt("ratio", "sale"): (0.8, "boom"),
    wt("limiter", "techo"): (0.9, "glass"), wt("limiter", "infinito"): (0.6, "boom"),
    wt("revelacion", "subir"): (0.7, "whip"),
    wt("error", "aprietas"): (1.2, "boom"), wt("error", "empana"): (0.8, "scratch"),
    wt("tip", "uno"): (0.6, "ding"),
    wt("marca", "mef"): (1.1, "drop"),
    wt("cta", "guarda"): (0.5, "ding"),
}
def hit_amt(t):
    a = 0.0
    for th, (f, _) in HITS.items():
        if t >= th: a = max(a, f * math.exp(-(t - th) / 0.18))
    return a
# --------------------------------------------------------------------------- dibujo
def txt(d, xy, s, f, fill, anchor="mm", stroke=0, sfill=(0, 0, 0)):
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=sfill)

def stamp(img, s, cx, cy, size, color, k, rot=-8):
    """sello que cae y rebota (ERROR, DENEGADO...)"""
    if k <= 0.01: return
    f = ANTON(size); tw, th = f.getbbox(s)[2] + 80, size + 70
    layer = Image.new("RGBA", (tw, th), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    d.rounded_rectangle((6, 6, tw - 6, th - 6), radius=24, outline=color + (255,), width=12)
    d.text((tw / 2, th / 2 + 4), s, font=f, fill=color + (255,), anchor="mm")
    sc = lerp(2.4, 1.0, back(k)); layer = layer.resize((max(1, int(tw * sc)), max(1, int(th * sc)))).rotate(rot, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))

# orbe de puntos (mi "cerebro"), esfera de Fibonacci girando
FIB = []
for i in range(420):
    y = 1 - 2 * (i + 0.5) / 420; r = math.sqrt(1 - y * y); a = i * math.pi * (3 - math.sqrt(5)); FIB.append((r * math.cos(a), y, r * math.sin(a)))
def orb(d, cx, cy, R, t, color=(255, 255, 255), smile=0.0, wob=0.0):
    yaw, tilt = t * 0.9, 0.35; cyw, syw, ct, st = math.cos(yaw), math.sin(yaw), math.cos(tilt), math.sin(tilt)
    pts = []
    for i, (x, y, z) in enumerate(FIB):
        rr = R * (1 + wob * 0.08 * math.sin(t * 6 + i * 0.7))
        x1, z1 = x * cyw + z * syw, -x * syw + z * cyw; y1, z2 = y * ct - z1 * st, y * st + z1 * ct
        pts.append((z2, cx + x1 * rr, cy - y1 * rr, i))
    pts.sort()
    for z, px, py, i in pts:
        dep = (z + 1) / 2; r = 2 + 6 * dep; c = tuple(int(v * (0.3 + 0.7 * dep)) for v in color)
        d.ellipse((px - r, py - r, px + r, py + r), fill=c)
    if smile > 0:  # sonrisa en el frente: una curva de puntos coral
        for k in range(15):
            u = (k / 14 - 0.5) * 1.4 * smile; px = cx + u * R * 0.75; py = cy + R * 0.25 + (u * u) * -R * 0.5 + R * 0.12
            d.ellipse((px - 9, py - 9, px + 9, py + 9), fill=CORAL)
        for ex in (-0.32, 0.32): d.ellipse((cx + ex * R - 14, cy - R * 0.2 - 14, cx + ex * R + 14, cy - R * 0.2 + 14), fill=CORAL)

def level(tau):
    n = math.floor(tau / B); ph = tau - n * B
    return 1 - (1 - math.exp(-ph / 0.09)) * (1 - 0.4 * math.exp(-((tau + B / 2) % B) / 0.1)) * (1 - 0.18)

def terminal(d, t, lines, y0=200, title="~/Claudetest — claude"):
    d.rounded_rectangle((60, y0, 1020, y0 + 700), radius=28, fill=(14, 14, 18), outline=(60, 60, 70), width=3)
    d.rounded_rectangle((60, y0, 1020, y0 + 70), radius=28, fill=(30, 30, 38)); d.rectangle((60, y0 + 40, 1020, y0 + 70), fill=(30, 30, 38))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]): d.ellipse((95 + i * 40 - 11, y0 + 35 - 11, 95 + i * 40 + 11, y0 + 35 + 11), fill=c)
    txt(d, (540, y0 + 36), title, MONO(24), (150, 150, 160))
    y = y0 + 120
    for s, col in lines:
        txt(d, (100, y), s, MONO(38), col, "lm"); y += 62
    return y

def typed(s, t0, t, cps=34):
    n = int(clamp((t - t0) * cps, 0, len(s))); return s[:n], n < len(s)

CODE = ["import * as THREE from 'three';", "const bloom = new UnrealBloomPass(...);", "function compress(L, c) {", "  return L > c.thr ? c.thr + (L-c.thr)/c.ratio : L;", "}", "camera.lookAt(V3(0, 1.45, 2.4));", "renderer.toneMapping = ACES;", "const press = new THREE.Group();", "glass.position.y = yOf(CEIL);", "updateSparks(t, on);", "// ¿por qué está todo blanco?", "bloom.strength = 0.8;", "await page.waitForFunction(READY)", "// 120000 ms...", "const ROOT = '../../..'; // ahora sí"]

def draw_style_cycle(d, img, t, lt):
    """estilos: neón → minimal → 2D → pizarra, cambiando rapidísimo"""
    i = min(3, int(lt / 0.62)) if lt < 2.5 else 3
    bx0, by0, bx1, by1 = 70, 170, 1010, 930
    if i == 0:
        d.rectangle((bx0, by0, bx1, by1), fill=(8, 6, 20))
        for k in range(36):
            v = level(t - k * 0.03) * (0.6 + 0.4 * h(k)); x = bx0 + 40 + k * 25; hh = v * 300
            d.rectangle((x, 560 - hh, x + 14, 560 + hh), fill=MAG if k % 3 else CYA)
        txt(d, (540, 870), "NEÓN 3D", ANTON(70), CYA)
    elif i == 1:
        d.rectangle((bx0, by0, bx1, by1), fill=(0, 0, 0))
        for k in range(30):
            v = level(t - k * 0.03); n = int(v * 9); x = bx0 + 60 + k * 29
            for j in range(-n, n + 1): d.ellipse((x - 5, 560 + j * 26 - 5, x + 5, 560 + j * 26 + 5), fill=NAR if abs(j) > 5 else (255, 255, 255))
        txt(d, (540, 870), "MINIMAL", ANTON(70), (255, 255, 255))
    elif i == 2:
        d.rectangle((bx0, by0, bx1, by1), fill=(0, 0, 0))
        for k in range(46):
            v = min(0.86, level(t - k * 0.02)); x = bx0 + 30 + k * 19; hh = v * 280
            d.rectangle((x, 560 - hh, x + 9, 560 + hh), fill=GRN if v > 0.84 else (255, 255, 255))
        txt(d, (540, 870), "2D", ANTON(80), GRN)
    else:
        d.rectangle((bx0, by0, bx1, by1), fill=CREAM)
        pts = []; s = 1
        for x in range(bx0 + 40, bx1 - 40, 9): pts.append((x, 560 - s * level(1 + x / 300) * 220 + (h(x) - 0.5) * 6)); s = -s
        d.line(pts, fill=INK, width=5, joint="curve")
        txt(d, (540, 870), "pizarra", HAND(110), INK)
    for k in range(4): d.ellipse((440 + k * 60 - 9, 205 - 9, 440 + k * 60 + 9, 205 + 9), fill=YEL if k == i else (90, 90, 90))

# --------------------------------------------------------------------------- escenas (estilo brain rot, contenido MEF)
STICKERS = ["kick", "−1 dBTP", "GR 3 dB", "130 BPM", "ratio 4:1", "attack 10 ms", "release 115 ms", "make-up", "LUFS", "sidechain", "headroom", "clip"]
def stickers(d, t):
    for k in range(int(DUR / 0.6)):
        t0 = k * 0.6 + h(k) * 0.3; age = t - t0
        if age < 0 or age > 1.7: continue
        x = lerp(-150, 1230, age / 1.7) if k % 2 else lerp(1230, -150, age / 1.7); y = 150 + h(k, 2) * 760
        s = STICKERS[k % len(STICKERS)]; f = GROT(32); tw = f.getbbox(s)[2] + 36
        col = [CREAM, CORAL, YEL, (230, 200, 180)][k % 4]
        d.rounded_rectangle((x - tw / 2, y - 28, x + tw / 2, y + 28), radius=28, fill=col); txt(d, (x, y), s, f, INK)

THR, RATIO, MKG, CEIL = 0.5, 4, 1.3, 0.86
def stg(tau):
    a = min(1.0, level(tau) * 1.05); c = (a > THR and THR + (a - THR) / RATIO or a)
    return a, c, min(c * MKG * 1.22, CEIL)
def bars(d, t, mode, x0=80, x1=1000, cy=600, A=300, n=44, thr=None, ceil=None, brick=0.0, color=(255, 255, 255)):
    """onda en barras espejadas. mode: 'raw' | 'comp' | 'lim'"""
    step = (x1 - x0) / n
    for k in range(n):
        a, c, l = stg(t - k * 0.022); v = {"raw": a, "comp": c, "lim": l}[mode]
        if brick: v = lerp(v, CEIL, brick)
        hh = v * A; x = x0 + k * step; w = step * 0.55
        cut = (thr if (mode == "comp" and thr is not None and a > THR) else None)
        if mode == "raw" and a > CEIL: cut = CEIL
        if mode == "lim" and v >= CEIL - 0.01: cut = CEIL - 0.06
        hs = min(hh, cut * A) if cut is not None else hh
        base = tuple(int(lerp(cc, 120, brick * 0.7)) for cc in color)
        d.rectangle((x, cy - hs, x + w, cy + hs), fill=base)
        if hh > hs:
            tip = RED if mode == "raw" else CORAL if mode == "comp" else ((150, 150, 150) if brick > 0.5 else GRN)
            d.rectangle((x, cy - hh, x + w, cy - hs), fill=tip); d.rectangle((x, cy + hs, x + w, cy + hh), fill=tip)
    if thr is not None:
        for xx in range(x0, x1, 28): d.rectangle((xx, cy - thr * A - 3, xx + 16, cy - thr * A + 3), fill=CORAL)
        txt(d, (x1, cy - thr * A - 26), "THRESHOLD", GROT(28), CORAL, "rm")
    if ceil is not None:
        y = cy - ceil * A - 26; d.rectangle((x0 - 20, y - 10, x1 + 20, y), fill=CREAM); d.rectangle((x0 - 20, y, x1 + 20, y + 22), fill=(70, 110, 120))
        txt(d, (x1 + 20, y - 34), "TECHO DE CRISTAL −1 dB", GROT(28), CREAM, "rm")

def scene(img, d, sid, t, lt):
    s = SEG[sid]
    if sid == "hook":
        # el orbe (tu track) empuja contra el techo de cristal y no lo rompe
        ceil_y = 330; d.rectangle((60, ceil_y - 10, 1020, ceil_y), fill=CREAM); d.rectangle((60, ceil_y, 1020, ceil_y + 26), fill=(70, 110, 120))
        txt(d, (1020, ceil_y - 36), "TECHO DE CRISTAL", GROT(30), CREAM, "rm")
        cy = 640 - 90 * kick_env(t); R = 300
        orb(d, 540, cy, R, t, CORAL)
        d.rectangle((0, 0, W, ceil_y - 10), fill=(10, 10, 14)); d.rectangle((60, ceil_y - 10, 1020, ceil_y), fill=CREAM)
        if cy - R < ceil_y + 26:
            for j in range(14): sx = 300 + h(j, math.floor(t / B)) * 480; sy = ceil_y + 30 + h(j, 3) * 40 * kick_env(t); d.ellipse((sx - 6, sy - 6, sx + 6, sy + 6), fill=YEL)
        stamp(img, "NO SE ROMPE", 540, 860, 92, CREAM, clamp((t - wt("hook", "romper")) / 0.3), rot=-6)
    elif sid == "promesa":
        cards = [("ONDA", (255, 255, 255), "tu"), ("COMPRESOR", CORAL, "compresor"), ("LIMITER", CREAM, "limiter")]
        for i, (name, col, w) in enumerate(cards):
            k = back((t - (s["start"] + 0.2 if i == 0 else wt("promesa", w))) / 0.3)
            if k <= 0: continue
            y = 280 + i * 210; ww = 760 * k
            d.rounded_rectangle((540 - ww / 2, y - 75, 540 + ww / 2, y + 75), radius=40, outline=col, width=8, fill=(18, 18, 24))
            txt(d, (540, y), name, ANTON(int(96 * k)), col)
            if i < 2 and k > 0.9: txt(d, (540, y + 108), "↓", ANTON(70), (150, 150, 160))
        stamp(img, "EL ERROR: AL FINAL", 540, 900, 64, RED, clamp((t - wt("promesa", "error")) / 0.3), rot=4)
    elif sid == "cruda":
        bars(d, t, "raw", cy=560, ceil=None)
        stamp(img, "PICOS SIN CONTROL", 540, 880, 80, RED, clamp((t - wt("cruda", "picos")) / 0.3), rot=-5)
    elif sid == "threshold":
        k = ease((t - wt("threshold", "trechold")) / 0.5)
        bars(d, t, "comp" if t > wt("threshold", "cruza") else "raw", cy=560, thr=THR if k > 0 else None)
        txt(d, (540, 230), "ARRIBA: SE COMPRIME", GROT(40), CORAL); txt(d, (540, 900), "ABAJO: PASA INTACTO", GROT(40), (200, 200, 210))
    elif sid == "ratio":
        # 4 bloques que se vuelven 1 + gráfica entrada/salida
        kIn = ease((t - wt("ratio", "pasa") + 0.2) / 0.3); kOut = ease((t - wt("ratio", "sale")) / 0.4)
        for i in range(4):
            if i and kOut > 0.98: continue
            y = 780 - (i + 1) * 120 * (1 if i == 0 else (1 - 0.8 * kOut)); a = kIn
            col = CORAL if (i == 0 and kOut > 0.5) else RED
            if a > 0: d.rounded_rectangle((170, y, 410, y + 100), radius=18, fill=col); txt(d, (290, y + 50), "+1 dB", ANTON(54), INK)
        d.rectangle((140, 800, 440, 808), fill=CORAL); txt(d, (290, 850), "ENTRA +4 dB  ·  SALE +1 dB", GROT(30), (210, 210, 220))
        gx, gy, gs = 560, 260, 420
        d.rectangle((gx, gy, gx + gs, gy + gs), outline=(80, 80, 90), width=3)
        r = lerp(1, 4, ease((t - wt("ratio", "cuatro")) / 0.6)); pts = []
        for i in range(41):
            vi = i / 40; vo = THR + (vi - THR) / r if vi > THR else vi; pts.append((gx + vi * gs, gy + gs - vo * gs))
        d.line(pts, fill=CORAL, width=10, joint="curve"); d.line([(gx, gy + gs), (gx + gs, gy)], fill=(80, 80, 90), width=2)
        txt(d, (gx + gs / 2, gy + gs + 40), "ENTRADA", GROT(26), (150, 150, 160))
        stamp(img, "4:1", 790, 360, 120, CORAL, clamp((t - wt("ratio", "cuatro")) / 0.3), rot=8)
    elif sid == "limiter":
        bars(d, t, "lim", cy=600, ceil=CEIL)
        stamp(img, "RATIO INFINITO", 540, 900, 80, GRN, clamp((t - wt("limiter", "infinito")) / 0.3), rot=-5)
    elif sid == "revelacion":
        lA = sum(stg(t - i * 0.03)[0] ** 2 for i in range(30)) / 30; lB = sum(stg(t - i * 0.03)[2] ** 2 for i in range(30)) / 30
        k = ease((t - wt("revelacion", "subir")) / 0.5)
        for i, (name, v, col) in enumerate([("ANTES", lA, (255, 255, 255)), ("DESPUÉS", lB * (0.75 + 0.25 * k) / 0.75, GRN)]):
            y = 320 + i * 230; txt(d, (100, y - 70), name, GROT(40), col, "lm")
            for j in range(20): d.rounded_rectangle((100 + j * 44, y - 30, 134 + j * 44, y + 30), radius=8, fill=col if j / 20 < v * 1.6 else (40, 40, 48))
        txt(d, (540, 820), "COMPRESOR CONTROLA", ANTON(64), CORAL); txt(d, (540, 900), "LIMITER PROTEGE", ANTON(64), CREAM)
    elif sid == "error":
        k = ease((t - wt("error", "aprietas")) / 0.4)
        bars(d, t, "lim", cy=600, ceil=CEIL, brick=k)
        if t > wt("error", "empana"):  # grietas en el cristal
            y = 600 - CEIL * 300 - 6
            for j in range(9):
                x = 140 + j * 100; pts = [(x, y)]
                for q in range(5): pts.append((pts[-1][0] + (h(j, q) - 0.5) * 70, pts[-1][1] + 18 + h(q, j) * 20))
                d.line(pts, fill=(220, 220, 230), width=3)
        stamp(img, "SOBRELIMITADO", 540, 900, 86, RED, clamp((t - wt("error", "aprietas")) / 0.3), rot=6)
    elif sid == "tip":
        k = back((t - s["start"]) / 0.35)
        txt(d, (540, 470), "1–3 dB", ANTON(max(10, int(260 * k))), GRN, stroke=10, sfill=INK)
        txt(d, (540, 680), "de reducción en el limiter", GROT(44), (220, 220, 230))
        stamp(img, "MÁXIMO", 540, 860, 90, CREAM, clamp((t - wt("tip", "maximo")) / 0.3), rot=-7)
    elif sid == "marca":
        lt2 = t - s["start"]; tM = wt("marca", "mef")
        d.rectangle((0, 0, W, H), fill=(10, 10, 14))
        if t > tM:
            for k in range(24):
                a = k * math.pi / 12 + t * 0.6; d.polygon([(540, 760), (540 + math.cos(a) * 1600, 760 + math.sin(a) * 1600), (540 + math.cos(a + 0.12) * 1600, 760 + math.sin(a + 0.12) * 1600)], fill=(30, 20, 16) if k % 2 else (10, 10, 14))
        orb(d, 540, 760, 260 + 25 * kick_env(t), t, CORAL if t > tM else (120, 120, 130))
        if t > tM:
            k = back((t - tM) / 0.35)
            txt(d, (540, 760), "MEF", ANTON(max(10, int(280 * k))), CREAM, stroke=14, sfill=INK)
            txt(d, (540, 940), "E S T U D I O", GROT(54), CREAM, stroke=5, sfill=INK)
        if t > wt("marca", "mezcla"): txt(d, (540, 1180), "MEZCLA & MÁSTER", ANTON(80), CORAL, stroke=8, sfill=INK)
    elif sid == "cta":
        d.rectangle((0, 0, W, H), fill=(10, 10, 14))
        tG, tS = wt("cta", "guarda"), wt("cta", "siguenos"); tEnd = s["end"] + 0.15
        if t < tEnd:
            kb = back((t - tG) / 0.35)
            if kb > 0:
                cx, cy, sc = 540, 560, 1.6 * kb; pts = [(-50, -70), (50, -70), (50, 75), (0, 36), (-50, 75)]
                fillk = ease((t - tG - 0.3) / 0.5)
                d.polygon([(cx + x * sc, cy + y * sc) for x, y in pts], fill=CORAL if fillk > 0.5 else None, outline=CREAM, width=10)
                txt(d, (540, 790), "GUÁRDALO", ANTON(110), CREAM, stroke=8, sfill=INK)
            kf = back((t - tS) / 0.3)
            if kf > 0:
                d.rounded_rectangle((540 - 260 * kf, 940 - 55 * kf, 540 + 260 * kf, 940 + 55 * kf), radius=55, fill=CORAL)
                txt(d, (540, 940), "+ SEGUIR", ANTON(max(10, int(70 * kf))), INK)
                txt(d, (540, 1060), "@mef.estudios", GROT(56), CREAM)
        else:
            k = ease((t - tEnd) / 0.5)
            orb(d, 540, 760, 300, t, tuple(int(v * 0.5 * k) for v in CORAL))
            txt(d, (540, 760), "MEF", ANTON(280), tuple(int(v * k) for v in CREAM), stroke=14, sfill=INK)
            txt(d, (540, 940), "E S T U D I O", GROT(54), tuple(int(v * k) for v in CREAM))
            txt(d, (540, 1080), "@mef.estudios", GROT(56), tuple(int(v * k) for v in CREAM))
            txt(d, (540, 1150), "Mix & Master para techno", GROT(36), tuple(int(v * k * 0.6) for v in CREAM))

FULL = {"marca", "cta"}

def bottom_loop(d, t):
    """loop "satisfactorio": una prensa hidráulica aplasta una onda en cada compás"""
    y0 = 1180; d.rectangle((0, y0, W, H), fill=(22, 22, 26))
    cyc = (t % (2 * B)) / (2 * B); down = ease(cyc / 0.25) if cyc < 0.25 else 1 - ease((cyc - 0.55) / 0.45) if cyc > 0.55 else 1
    press_y = lerp(y0 + 40, 1500, down)
    base = 1760
    for k in range(40):
        v = level(t - k * 0.02) * (0.7 + 0.3 * h(k)); top = base - v * 330; top = max(top, press_y + 40); x = 90 + k * 23
        squashed = top >= press_y + 39
        d.rectangle((x, top, x + 14, base), fill=YEL if squashed and down > 0.9 else (255, 255, 255))
    d.rectangle((420, y0, 660, press_y), fill=(90, 92, 100)); d.rectangle((80, press_y, 1000, press_y + 40), fill=(150, 152, 160))
    d.rectangle((80, press_y + 34, 1000, press_y + 40), fill=CORAL)
    if 0.24 < cyc < 0.34:
        for j in range(16): sx = 90 + h(j, math.floor(t / (2 * B))) * 900; sy = press_y + 50 + (cyc - 0.24) * 600 * h(j, 2); d.ellipse((sx - 5, sy - 5, sx + 5, sy + 5), fill=YEL)
    d.rectangle((60, base, 1020, base + 8), fill=(70, 70, 80))
    txt(d, (60, 1215), "ratio 4:1 en vivo", MONO(24), (120, 120, 130), "lm")
    txt(d, (1020, 1215), "130 BPM", MONO(24), CORAL, "rm")

def captions(d, t):
    for s in TL["segments"]:
        if not (s["start"] - 0.05 <= t <= s["end"] + 0.2): continue
        ws = SUBW[s["id"]]; chunks, cur = [], []
        for w in ws:
            cur.append(w)
            if len(cur) >= 3 or re.search(r"[,.:;!?…”]\**$", w[0]): chunks.append(cur); cur = []
        if cur: chunks.append(cur)
        ch = next((c for i, c in enumerate(chunks) if t < (chunks[i + 1][0][1] if i + 1 < len(chunks) else s["end"] + 0.2)), chunks[-1])
        y = 1090 if s["id"] not in FULL else 1420
        f = ANTON(104); parts = []; inmark = False
        for w, a, b in ch:
            m = "*" in w or inmark
            if w.count("*") % 2 == 1: inmark = not inmark
            parts.append((w.replace("*", ""), m, a <= t))
        widths = [f.getbbox(p[0] + " ")[2] for p in parts]; x = 540 - sum(widths) / 2
        k = back((t - ch[0][1] + 0.04) / 0.18); yy = y + (1 - k) * 40
        for (w, m, on), ww in zip(parts, widths):
            col = YEL if m else (255, 255, 255)
            if on: d.text((x, yy), w, font=f, fill=col, anchor="lm", stroke_width=11, stroke_fill=(0, 0, 0))
            x += ww

def progress(d, t):
    d.rectangle((0, 0, W, 10), fill=(40, 40, 40)); d.rectangle((0, 0, int(W * t / DUR), 10), fill=CORAL)

# --------------------------------------------------------------------------- frame + efectos
YY, XX = np.mgrid[0:H, 0:W]
VIG = (1 - 0.45 * np.clip(((XX - W / 2) ** 2 / (W * 0.62) ** 2 + (YY - H / 2) ** 2 / (H * 0.62) ** 2) - 0.25, 0, 1)).astype(np.float32)[..., None]
def frame(t):
    sid = scene_at(t); lt = t - RANGES[sid][0]
    img = Image.new("RGBA", (W, H), (8, 8, 10, 255)); d = ImageDraw.Draw(img)
    if sid not in FULL:
        d.rectangle((0, 0, W, 1000), fill=(10, 10, 14))
        stickers(d, t)
        scene(img, d, sid, t, lt)
        bottom_loop(d, t)
    else:
        scene(img, d, sid, t, lt)
    captions(d, t); progress(d, t)
    # zoom "punch" al cambiar de escena y en cada golpe
    hit = hit_amt(t); z = 1 + 0.12 * math.exp(-lt / 0.14) + 0.06 * hit + 0.012 * kick_env(t)
    rgb = img.convert("RGB")
    if z > 1.001:
        cw, chh = W / z, H / z; sx = (h(math.floor(t * 30), 1) - 0.5) * 40 * hit; sy = (h(math.floor(t * 30), 2) - 0.5) * 40 * hit
        rgb = rgb.resize((W, H), Image.BILINEAR, box=(W / 2 - cw / 2 + sx, H / 2 - chh / 2 + sy, W / 2 + cw / 2 + sx, H / 2 + chh / 2 + sy))
    a = np.asarray(rgb).astype(np.float32)
    # aberración cromática
    o = int(2 + 14 * hit)
    a[..., 0] = np.roll(a[..., 0], o, axis=1); a[..., 2] = np.roll(a[..., 2], -o, axis=1)
    a *= VIG
    # destello corto al entrar a una escena (suave, sin estrobo)
    fl = 0.28 * math.exp(-lt / 0.05) + (0.3 * math.exp(-(t - wt("marca", "mef")) / 0.12) if t >= wt("marca", "mef") else 0)
    if fl > 0.01: a = a * (1 - fl) + 255 * fl
    # líneas de escaneo leves
    a[::4] *= 0.93
    return np.clip(a, 0, 255).astype(np.uint8)

# --------------------------------------------------------------------------- main (por ahora: cuadros de prueba)
if __name__ == "__main__" and "--video" not in sys.argv:
    ts = [float(x) for x in sys.argv[sys.argv.index("--preview") + 1].split(",")] if "--preview" in sys.argv else [2.0, 18.6, 24.6, 28.8, 39.0, 49.5]
    for t in ts: Image.fromarray(frame(t)).save(f"{ROOT}/output/prueba_{t:05.2f}.jpg", quality=90)

# --------------------------------------------------------------------------- sonido + video completo
def audio():
    """Base: la mezcla del video #2 (voz + techno 130 BPM con compresor/limiter reales).
    Encima: efectos estilo brain rot sincronizados con cada sello/golpe."""
    SR = 48000; base, sr = sf.read("mef/limiter/minimal/audio/mezcla.wav"); assert sr == SR
    N = len(base); fx = np.zeros(N); T = lambda n: np.arange(n) / SR; rng = np.random.default_rng(5)
    def place(x, t, g=1.0):
        i = int(t * SR); j = min(N, i + len(x))
        if 0 <= i < N: fx[i:j] += x[: j - i] * g
    def lp(x, a): k = np.exp(-np.arange(int(5 / a)) * a); return np.convolve(x, k / k.sum())[: len(x)]
    def boom(): n = int(1.0 * SR); t = T(n); f = 40 + 90 * np.exp(-t / 0.06); return np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)) * 0.8
    def buzz(): n = int(0.45 * SR); t = T(n); return (np.sign(np.sin(2 * np.pi * 110 * t)) + np.sign(np.sin(2 * np.pi * 113 * t))) * 0.22 * np.exp(-t / 0.3)
    def scratch(): n = int(0.5 * SR); t = T(n); f = 300 + 900 * np.abs(np.sin(t * 22)); return lp(rng.standard_normal(n), 0.3) * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3) * 1.1
    def whip(): n = int(0.18 * SR); t = T(n); nz = rng.standard_normal(n); return (nz - lp(nz, 0.1)) * np.sin(np.pi * t / t[-1]) ** 2 * 0.45
    def ding(): n = int(0.9 * SR); t = T(n); return (np.sin(2 * np.pi * 1318 * t) + 0.5 * np.sin(2 * np.pi * 2637 * t)) * np.exp(-t / 0.35) * 0.3
    def glass(): n = int(0.6 * SR); t = T(n); return sum(np.sin(2 * np.pi * f * t + f) * np.exp(-t / (0.2 * 2000 / f)) for f in (2100, 3300, 4700, 6200)) * 0.12
    SFX = {"boom": boom(), "buzz": buzz(), "scratch": scratch(), "whip": whip(), "ding": ding(), "glass": glass(), "drop": boom()}
    for th, (f, kind) in HITS.items(): place(SFX[kind], th, 0.8)
    W_ = whip()
    for sid in ORDER[1:]: place(W_, RANGES[sid][0] - 0.05, 0.45)
    mix = base[:, 0] + fx * 0.5
    mix = np.tanh(mix * 1.05) / np.tanh(1.05); mix /= max(1, np.abs(mix).max() / 0.97)
    sf.write(f"{ROOT}/build_mezcla.wav", np.stack([mix, mix], 1).astype(np.float32), SR)

def render():
    audio(); nf = int(DUR * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-i", f"{ROOT}/build_mezcla.wav", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", f"{ROOT}/output/mef_compresor_limiter_rot.mp4"], stdin=subprocess.PIPE)
    for i in range(nf):
        ff.stdin.write(frame(i / FPS).tobytes())
        if i % 300 == 0: print(f"{i}/{nf}", flush=True)
    ff.stdin.close(); ff.wait(); print("listo")

if __name__ == "__main__" and "--video" in sys.argv: render()
