"""Brain rot 9:16 — "Un día en la vida de Claude (yo)". Todo en Python: frames con PIL + numpy,
sonido sintetizado con numpy, voz Kokoro, y ffmpeg para codificar.
Uso (desde la raíz del repo):  python3 brainrot/voz.py MODEL_DIR  &&  python3 brainrot/make.py [--preview 1,5,9]
"""
import json, math, re, subprocess, sys, unicodedata
import numpy as np, soundfile as sf
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
ROOT = "brainrot"
TL = json.load(open(f"{ROOT}/build/timeline.json"))
SEG = {s["id"]: s for s in TL["segments"]}; ORDER = [s["id"] for s in TL["segments"]]
DUR = TL["duration"]
NM = "node_modules/@fontsource"
def font(path, size): return ImageFont.truetype(path, size)
ANTON = lambda s: font(f"{NM}/anton/files/anton-latin-400-normal.woff2", s)
GROT = lambda s: font(f"{NM}/space-grotesk/files/space-grotesk-latin-700-normal.woff2", s)
HAND = lambda s: font(f"{NM}/caveat/files/caveat-latin-700-normal.woff2", s)
MONO = lambda s: font("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", s)
CORAL, CREAM, INK = (217, 119, 87), (245, 240, 232), (20, 20, 22)
YEL, RED, GRN, CYA, MAG, NAR = (255, 225, 77), (255, 59, 48), (46, 230, 122), (34, 230, 255), (255, 60, 199), (255, 122, 26)
BPM = 150; B = 60 / BPM

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
HITS = {  # tiempo -> (fuerza, tipo de sonido)
    wt("pedido", "tres"): (0.8, "boom"),
    wt("timeout", "timeout"): (1.0, "buzz"), wt("timeout", "era"): (1.0, "scratch"),
    wt("estilos", "minimalista"): (0.5, "whip"), wt("estilos", "dos"): (0.5, "whip"), wt("estilos", "pizarra"): (0.5, "whip"),
    wt("distil", "error"): (0.9, "buzz"), wt("npm", "denegado"): (1.0, "boom"),
    wt("audio", "techo"): (0.6, "glass"),
    SEG["launch"]["start"] - 0.05: (1.4, "drop"),
    wt("pov2", "feliz"): (0.5, "ding"),
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

# --------------------------------------------------------------------------- escenas (mitad de arriba / pantalla completa)
STICKERS = ["tokens++", "ctrl+c", "lgtm", "ETA 4s", "re-render", "git push", "¿y si…?", "listo", "1922/1922", "pip install", "// TODO", "otra vez"]
def stickers(d, t, alpha_ok=True):
    for k in range(int(DUR / 0.55)):
        t0 = k * 0.55 + h(k) * 0.3; age = t - t0
        if age < 0 or age > 1.6: continue
        x = lerp(-150, 1230, (age / 1.6)) if k % 2 else lerp(1230, -150, age / 1.6); y = 150 + h(k, 2) * 760
        s = STICKERS[k % len(STICKERS)]; f = GROT(34); tw = f.getbbox(s)[2] + 36
        col = [YEL, CYA, GRN, MAG, CORAL][k % 5]
        d.rounded_rectangle((x - tw / 2, y - 30, x + tw / 2, y + 30), radius=30, fill=col)
        txt(d, (x, y), s, f, INK)

def scene(img, d, sid, t, lt):
    s = SEG[sid]
    if sid == "pov":
        line, typing = typed("$ claude", s["start"] + 0.4, t, 14)
        lines = [(line + ("▌" if typing or int(t * 3) % 2 else ""), (220, 220, 230))]
        if t > s["start"] + 1.4: lines.append(("✻ hola de nuevo :)", CORAL))
        if t > s["start"] + 2.2: lines.append(("> _", (130, 130, 140)))
        terminal(d, t, lines)
        orb(d, 860, 760, 90 * ease((t - s["start"] - 1.3) / 0.5), t, CORAL)
    elif sid == "pedido":
        p, typing = typed("> Genera un video en 3D sobre el compresor", s["start"], t, 30)
        y = terminal(d, t, [("$ claude", (220, 220, 230)), ("✻ hola de nuevo :)", CORAL)] + [(p[i:i + 26], YEL) for i in range(0, len(p), 26)])
        stamp(img, "¿¿3D??", 700, 760, 110, MAG, clamp((t - wt("pedido", "tres")) / 0.3), rot=10)
    elif sid == "guion":
        orb(d, 540, 560, 290, t, (255, 255, 255))
        k = ease((t - wt("guion", "primero")) / 0.3)
        if k > 0:
            d.rounded_rectangle((150, 180, 930, 330), radius=60, fill=CREAM); d.polygon([(480, 325), (560, 325), (520, 380)], fill=CREAM)
            txt(d, (540, 255), "primero el guion", HAND(int(96 * (0.8 + 0.2 * k))), INK)
        txt(d, (540, 900), "modo zen: ON", GROT(40), (150, 150, 160))
    elif sid == "threejs":
        d.rectangle((0, 0, W, 1000), fill=(4, 10, 6))
        off = (t - s["start"]) * 900
        for k in range(40):
            y = 1000 - ((k * 52 + off) % 2080) + 40
            if -40 < y < 1000: txt(d, (60, y), CODE[k % len(CODE)], MONO(32), (90, 255, 140) if k % 4 else (220, 255, 230), "lm")
        n = int(800 * ease((t - s["start"]) / 2.2))
        d.rounded_rectangle((250, 400, 830, 600), radius=30, fill=(0, 0, 0), outline=GRN, width=6)
        txt(d, (540, 500), f"{n} líneas", ANTON(120), GRN)
    elif sid == "timeout":
        tE = wt("timeout", "era")
        d.rectangle((0, 0, W, 1000), fill=(40, 0, 0) if t < tE else (0, 0, 0))
        if t < tE:
            prog = clamp((t - s["start"]) / (tE - s["start"]))
            txt(d, (540, 350), f"esperando… {int(prog * 120000)} ms", MONO(44), (255, 150, 150))
            d.rounded_rectangle((140, 420, 940, 470), radius=25, outline=RED, width=4); d.rounded_rectangle((146, 426, 146 + 788 * prog, 464), radius=20, fill=RED)
            stamp(img, "TIMEOUT", 540, 700, 150, RED, clamp((t - wt("timeout", "timeout")) / 0.25), rot=-7)
        else:
            k = back((t - tE) / 0.3); f = ANTON(int(260 * max(0.2, k)))
            txt(d, (540, 520), "ERA YO", f, (255, 255, 255), stroke=12, sfill=RED)
            txt(d, (540, 760), "const ROOT = '../../..'", MONO(40), (150, 150, 160))
    elif sid == "estilos":
        draw_style_cycle(d, img, t, t - wt("estilos", "minimalista"))
    elif sid == "distil":
        d.rectangle((0, 0, W, 1000), fill=(18, 18, 24))
        d.rounded_rectangle((80, 220, 1000, 320), radius=50, fill=(40, 40, 50)); txt(d, (130, 270), "https://distilbook.com", GROT(40), (220, 220, 230), "lm")
        a = t * 8
        for k in range(10):
            ang = a + k * 0.63; d.ellipse((540 + math.cos(ang) * 90 - 10, 560 + math.sin(ang) * 90 - 10, 540 + math.cos(ang) * 90 + 10, 560 + math.sin(ang) * 90 + 10), fill=(255, 255, 255, ) if k else CORAL)
        stamp(img, "ENOTFOUND", 540, 780, 120, RED, clamp((t - wt("distil", "error")) / 0.25), rot=6)
    elif sid == "npm":
        tD = wt("npm", "denegado"); tM = wt("npm", "mano")
        lines = [("$ npm install thinking-orbs", (220, 220, 230))]
        if t > tD: lines.append(("✗ Permission denied", RED))
        if t > tM - 0.3:
            for k in range(min(7, int((t - tM + 0.3) * 18))): lines.append((["// vendored (MIT) ♥", "export function makeProj(", "  yaw, tilt, cx, cy, s) {", "  const st = Math.sin(tilt);", "  ...", "}", "✓ lo escribí a mano"][k], GRN if k == 6 else (200, 200, 210)))
        terminal(d, t, lines)
        stamp(img, "DENEGADO", 560, 520, 130, RED, clamp((t - tD) / 0.25), rot=-9)
    elif sid == "audio":
        d.rectangle((0, 0, W, 1000), fill=(0, 0, 0)); ceil = 330
        d.rectangle((60, ceil - 8, 1020, ceil), fill=(190, 240, 255)); d.rectangle((60, ceil, 1020, ceil + 30), fill=(60, 120, 140))
        txt(d, (1000, ceil - 40), "TECHO DE CRISTAL −1 dB", GROT(30), (190, 240, 255), "rm")
        for k in range(46):
            v = level(t - k * 0.025) * 1.35; x = 80 + k * 20; top = max(ceil + 34, 640 - v * 330); col = GRN if top <= ceil + 36 else (255, 255, 255)
            d.rectangle((x, top, x + 10, 640 + (640 - top)), fill=col)
            if top <= ceil + 36 and h(k, math.floor(t * 10)) > 0.7:
                for j in range(3): sx, sy = x + (h(k, j) - 0.5) * 60, ceil + 40 + h(j, k) * 50; d.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), fill=(220, 255, 240))
    elif sid == "launch":
        lt2 = t - s["start"]
        bg = (int(lerp(0, CORAL[0], kick_env(t) * 0.35)), int(lerp(0, CORAL[1], kick_env(t) * 0.35)), int(lerp(0, CORAL[2], kick_env(t) * 0.35)))
        d.rectangle((0, 0, W, H), fill=bg)
        for k in range(24):  # rayos girando
            a = k * math.pi / 12 + t * 0.8; d.polygon([(540, 820), (540 + math.cos(a) * 1600, 820 + math.sin(a) * 1600), (540 + math.cos(a + 0.12) * 1600, 820 + math.sin(a + 0.12) * 1600)], fill=(40, 22, 16) if k % 2 else bg)
        for k in range(140):  # confeti
            sx, sy = h(k) * W, -100 + ((t * (300 + h(k, 3) * 500) + h(k, 4) * 2000) % 2100); c = [CORAL, CREAM, YEL, CYA, GRN][k % 5]
            r = 10 + h(k, 5) * 10; a = t * 5 + k; d.polygon([(sx + math.cos(a) * r, sy + math.sin(a) * r), (sx + math.cos(a + 2.1) * r, sy + math.sin(a + 2.1) * r), (sx + math.cos(a + 4.2) * r, sy + math.sin(a + 4.2) * r)], fill=c)
        orb(d, 540, 820, 230 + 30 * kick_env(t), t * 2, CREAM, wob=1.0)
        k = back(lt2 / 0.35); f = ANTON(max(10, int(250 * k)))
        txt(d, (540, 380), "CLAUDE 5", f, CREAM, stroke=14, sfill=INK)
        if t > wt("launch", "nuevo"): txt(d, (540, 1180), "nuevo cerebro", GROT(64), CREAM, stroke=6, sfill=INK)
        if t > wt("launch", "misma"): txt(d, (540, 1270), "misma obsesión", GROT(64), YEL, stroke=6, sfill=INK)
    elif sid == "pov2":
        d.rectangle((0, 0, W, 1000), fill=(14, 14, 18))
        asks = ["hazlo 3D", "dame el guion", "más minimal", "ahora 2D", "busca Distilbook", "pizarra", "brain rot", "otra vez"]
        n = min(len(asks), int((t - s["start"]) * 5) + 1)
        for k in range(n):
            y = 180 + k * 82 - max(0, n - 6) * 82
            if y < 150: continue
            d.rounded_rectangle((520, y - 32, 1010, y + 32), radius=32, fill=(60, 60, 75)); txt(d, (985, y), asks[k], GROT(36), (235, 235, 240), "rm")
        orb(d, 270, 640, 170, t, CREAM, smile=ease((t - wt("pov2", "feliz") + 0.2) / 0.3))
    elif sid == "fin":
        d.rectangle((0, 0, W, H), fill=(0, 0, 0))
        txt(d, (540, 700), ">" + (" ▌" if int(t * 2.5) % 2 == 0 else "  "), MONO(260), CORAL)
        k = ease((t - wt("fin", "estoy")) / 0.4)
        if k > 0: txt(d, (540, 1000), "estoy listo.", HAND(int(130 * (0.8 + 0.2 * k))), CREAM)
        if t > SEG["fin"]["end"] + 0.3:
            k2 = ease((t - SEG["fin"]["end"] - 0.3) / 0.5)
            txt(d, (540, 1260), "un día normal en la vida de Claude", GROT(40), tuple(int(v * k2) for v in (160, 160, 170)))
            txt(d, (540, 1320), "(hecho con Python + ffmpeg, sin plantillas)", GROT(30), tuple(int(v * k2) for v in (110, 110, 120)))

FULL = {"launch", "fin"}

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
    txt(d, (60, 1215), "compresion_satisfactoria.mp4", MONO(24), (120, 120, 130), "lm")
    txt(d, (1020, 1215), "ratio 4:1", MONO(24), CORAL, "rm")

def captions(d, t):
    for s in TL["segments"]:
        if not (s["start"] - 0.05 <= t <= s["end"] + 0.2): continue
        ws = SUBW[s["id"]]; chunks, cur = [], []
        for w in ws:
            cur.append(w)
            if len(cur) >= 3 or re.search(r"[,.:;!?…”]\**$", w[0]): chunks.append(cur); cur = []
        if cur: chunks.append(cur)
        ch = next((c for i, c in enumerate(chunks) if t < (chunks[i + 1][0][1] if i + 1 < len(chunks) else s["end"] + 0.2)), chunks[-1])
        y = 1090 if s["id"] not in FULL else 1500
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
    fl = 0.28 * math.exp(-lt / 0.05) + (0.35 * math.exp(-(t - SEG["launch"]["start"]) / 0.12) if t >= SEG["launch"]["start"] else 0)
    if fl > 0.01: a = a * (1 - fl) + 255 * fl
    # líneas de escaneo leves
    a[::4] *= 0.93
    return np.clip(a, 0, 255).astype(np.uint8)

# --------------------------------------------------------------------------- sonido
SR = 48000
def audio():
    N = int(DUR * SR) + SR; mix = np.zeros(N); T = lambda n: np.arange(n) / SR
    def place(buf, x, t, g=1.0):
        i = int(t * SR); j = min(len(buf), i + len(x))
        if 0 <= i < len(buf): buf[i:j] += x[: j - i] * g
    rng = np.random.default_rng(5)
    def lp(x, a):  # filtro de un polo vectorizado aproximado (exponencial por convolución corta)
        k = np.exp(-np.arange(int(5 / a)) * a); return np.convolve(x, k / k.sum())[: len(x)]
    def kick():
        n = int(0.35 * SR); t = T(n); f = 45 + 140 * np.exp(-t / 0.03); return np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2))
    def snare():
        n = int(0.25 * SR); t = T(n); nz = rng.standard_normal(n); return (nz - lp(nz, 0.2)) * np.exp(-t / 0.07) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.4
    def hat(): n = int(0.08 * SR); t = T(n); nz = rng.standard_normal(n); return (nz - lp(nz, 0.5)) * np.exp(-t / 0.015) * 0.3
    def saw(f, d, cut=0.05): n = int(d * SR); t = T(n); x = 2 * ((f * t) % 1) - 1; return lp(x, cut) * np.exp(-t / (d * 0.6))
    def sq(f, d): n = int(d * SR); t = T(n); return np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t / (d * 0.5)) * 0.25
    K, S, Hh = kick(), snare(), hat()
    music = np.zeros(N)
    notes = [220, 261.6, 329.6, 392, 440, 392, 329.6, 261.6]
    tL, tA = SEG["launch"]["start"], SEG["audio"]["end"]
    nb = int(DUR / B) + 1
    for n in range(nb):
        t0 = n * B
        if tA + 0.05 < t0 < tL - 0.05: continue  # silencio total antes del drop
        drop = tL - 0.05 <= t0 < SEG["pov2"]["start"]
        place(music, K, t0, 1.0)
        if drop: place(music, K, t0 + B / 2, 0.7)
        if n % 2 == 1: place(music, S, t0, 0.8)
        for e in range(2): place(music, Hh, t0 + e * B / 2, 0.6 if e else 0.3)
        place(music, saw(55 if (n // 4) % 2 == 0 else 65.4, B * 0.45, 0.04), t0 + B / 2, 0.5)
        for e in range(4): place(music, sq(notes[(n * 4 + e) % 8] * (2 if drop else 1), B / 4), t0 + e * B / 4, 0.45 if drop else 0.25)
    # subida antes del drop
    n = int((tL - tA) * SR); tt = T(n); place(music, (rng.standard_normal(n) * (tt / tt[-1]) ** 2 * 0.25 + np.sin(2 * np.pi * np.cumsum(200 + 1800 * (tt / tt[-1]) ** 2) / SR) * 0.15 * (tt / tt[-1])), tA)
    # efectos
    fx = np.zeros(N)
    def boom(): n = int(1.0 * SR); t = T(n); f = 40 + 90 * np.exp(-t / 0.06); return np.tanh(3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)) * 0.9
    def buzz(): n = int(0.45 * SR); t = T(n); return np.sign(np.sin(2 * np.pi * 110 * t)) * 0.3 * np.exp(-t / 0.3) + np.sign(np.sin(2 * np.pi * 113 * t)) * 0.3 * np.exp(-t / 0.3)
    def scratch(): n = int(0.5 * SR); t = T(n); f = 300 + 900 * np.abs(np.sin(t * 22)); return lp(rng.standard_normal(n), 0.3) * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3) * 1.2
    def whip(): n = int(0.18 * SR); t = T(n); nz = rng.standard_normal(n); return (nz - lp(nz, 0.1)) * np.sin(np.pi * t / t[-1]) ** 2 * 0.5
    def ding(): n = int(0.9 * SR); t = T(n); return (np.sin(2 * np.pi * 1318 * t) + 0.5 * np.sin(2 * np.pi * 2637 * t)) * np.exp(-t / 0.35) * 0.35
    def glass(): n = int(0.6 * SR); t = T(n); return sum(np.sin(2 * np.pi * f * t + f) * np.exp(-t / (0.2 * 2000 / f)) for f in (2100, 3300, 4700, 6200)) * 0.12
    def horn():
        n = int(1.1 * SR); t = T(n); vib = 1 + 0.006 * np.sin(2 * np.pi * 6 * t); x = sum(2 * ((f * vib * t) % 1) - 1 for f in (233, 293.7, 349.2, 466))
        return np.tanh(lp(x, 0.15) * 0.8) * np.minimum(1, t / 0.02) * np.exp(-np.maximum(0, t - 0.7) / 0.15) * 0.5
    SFX = {"boom": boom(), "buzz": buzz(), "scratch": scratch(), "whip": whip(), "ding": ding(), "glass": glass(), "drop": boom()}
    for th, (f, kind) in HITS.items():
        place(fx, SFX[kind], th, 0.9)
        if kind == "drop": place(fx, horn(), th + 0.02, 0.9)
    W_ = whip()
    for sid in ORDER[1:]: place(fx, W_, RANGES[sid][0] - 0.05, 0.6)
    # tecleo en la terminal
    click = lambda: (lambda n: np.sin(2 * np.pi * 3000 * T(n)) * np.exp(-T(n) / 0.003) * 0.25)(int(0.02 * SR))
    for sid, rate in (("pov", 14), ("pedido", 30)):
        s0 = SEG[sid]["start"] + (0.4 if sid == "pov" else 0)
        for k in range(int((1.0 if sid == "pov" else 1.4) * rate)): place(fx, click(), s0 + k / rate + rng.random() * 0.01, 0.8)
    tm = wt("npm", "mano")
    for k in range(22): place(fx, click(), tm - 0.3 + k / 18, 0.7)
    # prensa del loop de abajo: golpe sordo suave
    thud = (lambda n: np.sin(2 * np.pi * 70 * T(n)) * np.exp(-T(n) / 0.06) * 0.3)(int(0.2 * SR))
    for n in range(int(DUR / (2 * B))):
        t0 = n * 2 * B + 0.25 * 2 * B
        if scene_at(t0) not in FULL and not (tA < t0 < tL): place(fx, thud, t0, 0.5)
    # voz + ducking
    v, vsr = sf.read(f"{ROOT}/build/voz.wav")
    v = np.interp(np.arange(int(len(v) * SR / vsr)) / SR, np.arange(len(v)) / vsr, v); v = np.pad(v, (0, max(0, N - len(v))))[:N]
    env = np.convolve(np.abs(v), np.ones(2400) / 2400, mode="same"); duck = np.clip(env / 0.03, 0, 1)
    duck = np.convolve(duck, np.ones(4800) / 4800, mode="same")
    music *= 10 ** (-7 * duck / 20) * 0.32
    end = np.clip((DUR - T(N)) / 1.0, 0, 1); music *= end
    mix = music + fx * 0.55 + v * 1.0
    mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= max(1, np.abs(mix).max() / 0.97)
    sf.write(f"{ROOT}/build/mezcla.wav", np.stack([mix, mix], 1)[: int(DUR * SR)].astype(np.float32), SR)

# --------------------------------------------------------------------------- main
if __name__ == "__main__":
    if "--preview" in sys.argv:
        ts = [float(x) for x in sys.argv[sys.argv.index("--preview") + 1].split(",")]
        for t in ts: Image.fromarray(frame(t)).save(f"{ROOT}/output/preview_{t:05.2f}.jpg", quality=90)
        sys.exit(0)
    audio()
    nf = int(DUR * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-i", f"{ROOT}/build/mezcla.wav", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
                           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", f"{ROOT}/output/brainrot_claude.mp4"], stdin=subprocess.PIPE)
    for i in range(nf):
        ff.stdin.write(frame(i / FPS).tobytes())
        if i % 150 == 0: print(f"{i}/{nf}", flush=True)
    ff.stdin.close(); ff.wait(); print("listo")
