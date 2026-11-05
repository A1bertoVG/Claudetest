// MEF Estudio — Video #2, versión minimalista.
// Negro y blanco; acentos: NARANJA = compresor/threshold, VERDE = limiter/correcto, ROJO = picos/error.
// Todo en puntos, con el lenguaje visual de thinking-orbs (github.com/Jakubantalik/thinking-orbs, MIT):
// geometría 3D real, puntos ordenados por profundidad, tamaño y tinta según la profundidad.
import { MODE_FRAMES } from '../../../vendor/thinking-orbs/engine/registry.js';
import { resolvePreset } from '../../../vendor/thinking-orbs/presets.js';
import { makeProj } from '../../../vendor/thinking-orbs/engine/core.js';

const W = 1080, H = 1920;
const COL = { blanco: [255, 255, 255], naranja: [255, 122, 26], verde: [46, 230, 122], rojo: [255, 59, 48], gris: [120, 120, 120] };
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ACC = { naranja: css(COL.naranja), verde: css(COL.verde), rojo: css(COL.rojo) };
const F = (sz, w = 700) => `${w} ${sz}px Grotesk`;
const HANDLE = '@mef.estudios';

const TL = await (await fetch('timeline.json')).json();
const SEG = Object.fromEntries(TL.segments.map(s => [s.id, s]));
const ORDER = TL.segments.map(s => s.id);
await Promise.all([F(88), F(58), F(40, 500)].map(f => document.fonts.load(f)));

// ---------------------------------------------------------------- utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const pop = (t0, t, d = 0.4) => t < t0 ? 0 : easeOutBack((t - t0) / d);
const fade = (t0, t, d = 0.35) => ss(t0, t0 + d, t);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function timeWords(s, text) {
  const words = text.split(/\s+/).filter(Boolean);
  const w = words.map(x => { const c = x.replace(/\*/g, ''); return (/\d/.test(c) ? 7 * c.replace(/\D/g, '').length / 1.6 + 3 : c.length) + 1 + (/[,.;:]\**$/.test(x) ? 6 : 0) + (/[?!]\**$/.test(x) ? 4 : 0); });
  const tot = w.reduce((a, b) => a + b, 0); const d = s.end - s.start; let acc = 0;
  return words.map((x, i) => { const st = s.start + acc / tot * d; acc += w[i]; return { w: x, s: st, e: s.start + acc / tot * d }; });
}
const WORDS = {}, SUBW = {};
for (const s of TL.segments) { WORDS[s.id] = timeWords(s, s.text); SUBW[s.id] = timeWords(s, s.sub); }
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
function wt(id, prefix, nth = 0) { let n = 0; for (const w of WORDS[id]) if (norm(w.w).startsWith(norm(prefix))) { if (n++ === nth) return w.s; } console.warn('no encontrada', id, prefix); return SEG[id].start; }
const RANGES = {};
ORDER.forEach((id, i) => { RANGES[id] = [i ? SEG[id].start - 0.22 : 0, i < ORDER.length - 1 ? SEG[ORDER[i + 1]].start - 0.22 : TL.duration + 0.01]; });
const sceneAt = t => { for (const id of ORDER) if (t >= RANGES[id][0] && t < RANGES[id][1]) return id; return ORDER.at(-1); };
const LT = (id, t) => t - RANGES[id][0];

// ---------------------------------------------------------------- señal (130 BPM)
const B = 60 / 130;
const kickEnv = t => { const ph = ((t % B) + B) % B; return Math.exp(-ph / 0.09); };
function level(tau) {
  tau += 400 * B;
  const n = Math.floor(tau / B), ph = tau - n * B;
  const kick = Math.exp(-ph / 0.11) * (0.95 + 0.05 * hash(n, 3));
  const clap = (n % 2 === 1) ? 0.9 * Math.exp(-Math.max(0, ph - 0.03) / 0.09) * ss(0, 0.03, ph) : 0;
  const ph2 = (tau + B / 2) % B; const bass = 0.4 * Math.exp(-ph2 / 0.12) * ss(0, 0.02, ph2);
  const ph16 = tau % (B / 4); const hat = 0.14 * Math.exp(-ph16 / 0.03);
  const body = 0.16 + 0.04 * Math.sin(tau * 5.3);
  return 1 - (1 - kick) * (1 - clap) * (1 - bass) * (1 - hat) * (1 - body);
}

// ---------------------------------------------------------------- lienzo
const out = document.getElementById('out'); const ctx = out.getContext('2d');
function dot(x, y, r, c, a = 1) { ctx.fillStyle = css(c, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }

// orbe de thinking-orbs: geometría del motor original, pintada en blanco (tema oscuro) o con un acento
const PRE = {}; const pre = s => PRE[s] || (PRE[s] = resolvePreset(s, 64));
function orb(state, cx, cy, size, t, { tint = null, tintK = 0, alpha = 1, warp = null, rMul = 1.9 } = {}) {
  const { mode, speed, opts } = pre(state);
  const fr = MODE_FRAMES[mode](size, t * speed * 0.55, opts);
  for (const l of fr.lines) {
    const g = 1 - l.white; ctx.strokeStyle = css(tint ? mixc([255 * g, 255 * g, 255 * g], tint, tintK) : [255 * g, 255 * g, 255 * g], (l.a ?? 1) * alpha);
    ctx.lineWidth = l.w; ctx.beginPath(); ctx.moveTo(cx - size / 2 + l.x1, cy - size / 2 + l.y1); ctx.lineTo(cx - size / 2 + l.x2, cy - size / 2 + l.y2); ctx.stroke();
  }
  for (const d of fr.dots) {
    let x = cx - size / 2 + d.x, y = cy - size / 2 + d.y, c, g = 1 - clamp(d.white);
    c = [255 * g, 255 * g, 255 * g];
    if (tint) c = mixc(c, tint.map(v => v * (0.35 + 0.65 * g)), tintK);
    if (warp) { const w = warp(x, y, c); x = w.x; y = w.y; c = w.c; }
    dot(x, y, d.r * rMul, c, (d.a ?? 1) * alpha);
  }
}

// ---------------------------------------------------------------- forma de onda de puntos (3D)
const NC = 46, NZ = 3, DY = 0.046, XS = -1, XE = 1, V = 0.55;   // columnas, filas en profundidad, paso vertical
const XC = -0.34, XL = 0.34;                                      // fronteras: ENTRADA | COMPRESOR | LIMITER
const WCX = 540, WCY = 1010, SC = 452, AMP = 0.52;                 // centro y escala en pantalla
const CEIL = 0.86;
// P: { comp, thr, ratio, mk, lim, boost, raw, err, zones }
function procCol(x, tau, P) {
  const a = level(tau) * P.raw * (0.92 + 0.08 * hash(Math.round(x * 100), Math.floor(tau / B)));
  const inC = P.zones ? (x >= XC ? 1 : 0) : 1, inL = P.zones ? (x >= XL ? 1 : 0) : 1;
  const wC = inC * P.comp, wL = inL * P.lim;
  const c = a > P.thr ? P.thr + (a - P.thr) / P.ratio : a;
  const pre = lerp(a, c * P.mk, wC);
  const bo = pre * P.boost;
  const lim = Math.min(bo, P.ceil);
  return { a, pre, amp: lerp(pre, lim, wL), wC, wL, thrY: P.thr, limited: wL * clamp((bo - P.ceil * 0.97) * 8) };
}
function drawWave(t, P, yaw, tilt, alpha = 1) {
  const pt = makeProj(yaw, tilt, WCX, WCY, SC);
  const dots = [];
  for (let c = 0; c < NC; c++) {
    const x = lerp(XS, XE, c / (NC - 1));
    for (let r = 0; r < NZ; r++) {
      const z = (r - (NZ - 1) / 2) * 0.1;
      const tau = t - (x - XS) / V - r * 0.012;
      const pc = procCol(x, tau, P);
      const h = pc.amp * AMP;
      const n = Math.max(1, Math.floor(h / DY));
      for (let k = -n; k <= n; k++) {
        const y = k * DY; const v = Math.abs(y) / AMP;
        const [px, py, pz] = pt(x, y, z);
        const depth = (pz / 0.2 + 1) / 2;
        let col = COL.blanco;
        if (P.showRaw && pc.a > CEIL * 0.97 && v > 0.62 && pc.wC < 0.5) col = COL.rojo;                    // picos crudos
        if (pc.wC > 0.5 && pc.a > pc.thrY && v > pc.thrY * P.mk * 0.98 && P.tintC) col = COL.naranja;        // lo comprimido
        if (pc.limited > 0.5 && v > P.ceil - DY * 1.6 / AMP) col = P.err > 0.5 ? COL.rojo : COL.verde;       // contra el cristal
        if (P.err > 0 && pc.wL > 0.5) col = mixc(col, COL.gris, P.err * 0.65);
        const g = 0.35 + 0.65 * clamp(depth);
        dots.push([pz, px, py, (1.5 + 2.6 * clamp(depth)), col, (0.3 + 0.7 * g) * alpha]);
      }
    }
  }
  dots.sort((a, b) => a[0] - b[0]);
  for (const d of dots) dot(d[1], d[2], d[3], d[4], d[5]);
  return pt;
}
// línea punteada en 3D (threshold / techo de cristal)
function dline(pt, x0, x1, yv, c, a = 1, r = 2.2, step = 0.022, both = true) {
  for (const s of both ? [1, -1] : [1]) for (const z of [-0.16, 0.16]) for (let x = x0; x <= x1 + 1e-6; x += step) {
    const [px, py, pz] = pt(x, s * yv * AMP, z); const depth = (pz / 0.2 + 1) / 2;
    dot(px, py, r * (0.7 + 0.5 * depth), c, a * (s < 0 ? 0.45 : 1) * (0.45 + 0.55 * depth));
  }
}
function vline(pt, x, c, a = 0.5) { for (let y = -0.62; y <= 0.62; y += 0.04) { const [px, py] = pt(x, y, 0); dot(px, py, 1.6, c, a); } }

// ---------------------------------------------------------------- textos
function rich(text, x, y, font, { color = '#fff', mark = ACC.naranja, align = 'center' } = {}) {
  const parts = []; let on = false; for (const p of text.split(/(\*)/)) { if (p === '*') { on = !on; continue; } if (p) parts.push({ s: p, m: on }); }
  ctx.font = font; const w = parts.reduce((a, p) => a + ctx.measureText(p.s).width, 0);
  let cx = align === 'center' ? x - w / 2 : x; ctx.textAlign = 'left';
  for (const p of parts) { ctx.fillStyle = p.m ? mark : color; ctx.fillText(p.s, cx, y); cx += ctx.measureText(p.s).width; }
  return w;
}
function tag(text, y, k, color = 'rgba(255,255,255,0.55)') {
  if (k <= 0.01) return; ctx.save(); ctx.globalAlpha = clamp(k); ctx.font = F(30, 500); ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.letterSpacing = '8px'; ctx.fillText(text, W / 2 + 4, y); ctx.letterSpacing = '0px'; ctx.restore();
}
function headline(text, y, k, size = 88, mark = ACC.naranja) {
  if (k <= 0.01) return; ctx.save(); ctx.globalAlpha = clamp(k); ctx.translate(0, (1 - clamp(k)) * 18);
  ctx.letterSpacing = '-2px'; rich(text, W / 2, y, F(size), { mark }); ctx.letterSpacing = '0px'; ctx.restore();
}
function label(x, y, text, k, color = 'rgba(255,255,255,0.7)', size = 28, align = 'center') {
  if (k <= 0.01) return; ctx.save(); ctx.globalAlpha = clamp(k); ctx.font = F(size, 500); ctx.fillStyle = color; ctx.textAlign = align;
  ctx.letterSpacing = '4px'; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; ctx.restore();
}
const CHUNKS = {};
for (const s of TL.segments) { const ws = SUBW[s.id]; const ch = []; let cur = []; ws.forEach((w, i) => { cur.push(w); const end = /[,.;:?!]\**$/.test(w.w); if (cur.length >= 5 || (end && cur.length >= 2) || i === ws.length - 1) { ch.push(cur); cur = []; } }); CHUNKS[s.id] = ch; }
const SUBMARK = { hook: ACC.verde, limiter: ACC.verde, tip: ACC.verde, revelacion: ACC.verde, error: ACC.rojo, cruda: ACC.rojo, marca: '#fff', cta: ACC.verde };
function drawSubs(t) {
  for (const s of TL.segments) {
    if (t < s.start - 0.05 || t > s.end + 0.25) continue;
    const ch = CHUNKS[s.id].find((c, i, arr) => t < (arr[i + 1] ? arr[i + 1][0].s : s.end + 0.25)) || CHUNKS[s.id].at(-1);
    ctx.font = F(52, 500); const mark = SUBMARK[s.id] || ACC.naranja;
    const lines = [[]]; let lw = 0;
    for (const w of ch) { const ww = ctx.measureText(w.w.replace(/\*/g, '') + ' ').width; if (lw + ww > 900 && lines.at(-1).length) { lines.push([]); lw = 0; } lines.at(-1).push(w); lw += ww; }
    const baseY = 1450 - (lines.length - 1) * 34; const k = clamp((t - ch[0].s + 0.05) / 0.18);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 10);
    lines.forEach((ln, li) => {
      const txt = ln.map(w => w.w.replace(/\*/g, '')).join(' ');
      let x = W / 2 - ctx.measureText(txt).width / 2; const y = baseY + li * 68; let inMark = false;
      for (const w of ln) {
        const raw = w.w; const m = raw.includes('*') || inMark; if (raw.split('*').length % 2 === 0) inMark = !inMark;
        const clean = raw.replace(/\*/g, ''); const active = t >= w.s - 0.02;
        ctx.textAlign = 'left'; ctx.fillStyle = m ? mark : (active ? '#ffffff' : 'rgba(255,255,255,0.4)');
        ctx.fillText(clean, x, y); x += ctx.measureText(clean + ' ').width;
      }
    });
    ctx.restore();
  }
}
function progressPill(t) {
  const a = wt('promesa', 'error') - 0.1, b = SEG.error.start;
  if (t < a || t > b + 1.2) return;
  const k = t < b ? fade(a, t) : 1 - ss(b + 0.8, b + 1.2, t), prog = clamp((t - a) / (b - a));
  ctx.save(); ctx.globalAlpha = k;
  ctx.font = F(28, 500); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.letterSpacing = '4px';
  ctx.fillText(t < b ? 'EL ERROR MÁS COMÚN · AL FINAL' : 'AQUÍ ESTÁ EL ERROR', W / 2, 170); ctx.letterSpacing = '0px';
  const n = 40; for (let i = 0; i < n; i++) dot(W / 2 - 300 + i * (600 / (n - 1)), 200, 3, i / (n - 1) <= prog ? COL.rojo : [60, 60, 60]);
  ctx.restore();
}
// gráfica entrada/salida, en puntos
function transfer(cx, cy, s, thr, ratio, k, ceil = null) {
  if (k <= 0.01) return; ctx.save(); ctx.globalAlpha = clamp(k);
  const X = v => cx - s / 2 + v * s, Y = v => cy + s / 2 - v * s;
  for (let i = 0; i <= 20; i++) { dot(X(i / 20), Y(0), 1.6, [90, 90, 90]); dot(X(0), Y(i / 20), 1.6, [90, 90, 90]); dot(X(i / 20), Y(i / 20), 1.4, [70, 70, 70]); }
  for (let i = 0; i <= 20; i++) dot(X(i / 20), Y(thr), 1.8, COL.naranja, 0.6);
  for (let i = 0; i <= 48; i++) { const vi = i / 48; let vo = vi > thr ? thr + (vi - thr) / ratio : vi; if (ceil != null) vo = Math.min(vo, ceil); dot(X(vi), Y(vo), 3.2, vi > thr ? COL.naranja : COL.blanco); }
  label(cx, cy + s / 2 + 44, 'ENTRADA →', 1, 'rgba(255,255,255,0.5)', 22);
  ctx.save(); ctx.translate(cx - s / 2 - 26, cy); ctx.rotate(-Math.PI / 2); label(0, 0, 'SALIDA →', 1, 'rgba(255,255,255,0.5)', 22); ctx.restore();
  ctx.restore();
}
function ratioDots(cx, cy, t) {
  const kIn = fade(wt('ratio', 'pasa') - 0.2, t), kOut = ss(wt('ratio', 'sale') - 0.1, wt('ratio', 'sale') + 0.5, t);
  if (kIn <= 0.01) return; ctx.save(); ctx.globalAlpha = kIn;
  for (let i = -6; i <= 6; i++) dot(cx + i * 14, cy, 2.2, COL.naranja, 0.8);
  for (let i = 0; i < 4; i++) {
    const a = i === 0 ? 1 : 1 - kOut; if (a <= 0.01) continue;
    const y = cy - 40 - i * 46 * (i === 0 ? 1 : 1 - 0.7 * kOut);
    dot(cx, y, 14 * pop(wt('ratio', 'pasa') - 0.2 + i * 0.1, t), i === 0 && kOut > 0.5 ? COL.naranja : COL.rojo, a);
  }
  label(cx, cy + 50, kOut > 0.5 ? 'SALE +1 dB' : 'ENTRA +4 dB', 1, 'rgba(255,255,255,0.7)', 24);
  ctx.restore();
}
function dotMeter(x, y, v, lbl, c, k) {
  if (k <= 0.01) return; ctx.save(); ctx.globalAlpha = k; const n = 24;
  for (let i = 0; i < n; i++) dot(x + i * 22, y, 6, i / n < v ? c : [50, 50, 50]);
  label(x - 24, y + 10, lbl, 1, 'rgba(255,255,255,0.6)', 24, 'right'); ctx.restore();
}
function loud(t, P) { let s = 0; const N = 40; for (let i = 0; i < N; i++) { const a = procCol(0.8, t - i * B * 2 / N, P).amp; s += a * a; } return Math.sqrt(s / N); }
function bookmark(x, y, s, fill, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(-50, -70); ctx.lineTo(50, -70); ctx.lineTo(50, 75); ctx.lineTo(0, 36); ctx.lineTo(-50, 75); ctx.closePath();
  ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke();
  if (fill > 0) { ctx.save(); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(-60, 80 - 160 * fill, 120, 160 * fill); ctx.restore(); }
  ctx.restore();
}
function wordmark(cx, cy, s, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.textAlign = 'center';
  ctx.font = F(220); ctx.letterSpacing = '-3px'; ctx.fillStyle = '#fff'; ctx.fillText('MEF', -10, 0); ctx.letterSpacing = '0px';
  dot(205, -14, 16, COL.naranja);
  ctx.font = F(46, 500); ctx.letterSpacing = '26px'; ctx.fillText('ESTUDIO', 13, 80); ctx.letterSpacing = '0px';
  ctx.restore();
}

// ---------------------------------------------------------------- procesado por escena
const P0 = { comp: 0, thr: 0.5, ratio: 1, mk: 1, lim: 0, boost: 1, raw: 1.0, err: 0, ceil: CEIL, zones: true, showRaw: false, tintC: true };
const GOOD = { comp: 1, ratio: 4, mk: 1.3, lim: 1, boost: 1.22 };
const P = o => Object.assign({}, P0, o);
function procAt(t) {
  const id = sceneAt(t);
  switch (id) {
    case 'hook': return P(GOOD);
    case 'promesa': return P(GOOD);
    case 'cruda': return P({ showRaw: true });
    case 'threshold': return P({ comp: 1, ratio: 1, tintC: t > wt('threshold', 'cruza') - 0.2 });
    case 'ratio': { const k = ss(wt('ratio', 'cuatro') - 0.1, wt('ratio', 'cuatro') + 0.6, t); return P({ comp: 1, ratio: lerp(1, 4, k) }); }
    case 'limiter': { const k = ss(RANGES.limiter[0] + 0.2, RANGES.limiter[0] + 1.2, t); return P({ comp: 1, ratio: 4, mk: lerp(1, 1.3, k), lim: 1, boost: lerp(1, 1.22, k) }); }
    case 'revelacion': { const k = ss(wt('revelacion', 'subir') - 0.1, wt('revelacion', 'subir') + 0.8, t); return P({ ...GOOD, mk: lerp(1, 1.3, k), boost: lerp(1, 1.22, k) }); }
    case 'error': { const k = ss(wt('error', 'aprietas') - 0.2, wt('error', 'aprietas') + 0.5, t); return P({ ...GOOD, boost: lerp(1.22, 4.5, k), err: ss(wt('error', 'empana') - 0.3, wt('error', 'empana') + 0.5, t) }); }
    case 'tip': { const k = ss(RANGES.tip[0] + 0.2, RANGES.tip[0] + 1.1, t); return P({ ...GOOD, boost: lerp(4.5, 1.22, k), err: 1 - k }); }
    default: return P(GOOD);
  }
}

// ---------------------------------------------------------------- escenas
function sceneHook(t, lt) {
  // el orbe (tu track) empuja contra un techo de cristal: lo que pasa la línea se aplana y se pinta verde
  const glassY = 680, cy = 945 - 120 * kickEnv(t), size = 720 * (0.94 + 0.08 * kickEnv(t));
  const k = easeOut(lt / 0.5);
  orb('listening', W / 2, cy, size * k, t, {
    warp: (x, y, c) => {
      if (y < glassY) return { x, y: glassY - (glassY - y) * 0.06, c: COL.verde };
      const near = clamp(1 - (y - glassY) / 26); return { x, y, c: near > 0 ? mixc(c, COL.verde, near) : c };
    }
  });
  const hit = kickEnv(t);
  for (let x = 90; x <= 990; x += 12) dot(x, glassY - 10, 2.3, mixc(COL.blanco, COL.verde, hit * 0.8), 0.9);
  label(990, glassY - 34, 'TECHO · −1 dBTP', fade(0.3, lt), 'rgba(255,255,255,0.6)', 22, 'right');
  headline('El techo', 330, fade(0.05, lt, 0.3), 104, ACC.verde);
  headline('de *cristal*', 440, fade(0.35, lt, 0.3), 104, ACC.verde);
}
function stationOrbs(t, active, k = 1) {
  const st = [['listening', 'ENTRADA', null], ['solving', 'COMPRESOR', COL.naranja], ['searching', 'LIMITER', COL.verde]];
  st.forEach(([s, name, c], i) => {
    const x = 540 + (i - 1) * 300, on = active.includes(i) ? 1 : 0.4;
    orb(s, x, 630, 170, t, { tint: c, tintK: c ? 1 : 0, alpha: on * k, rMul: 2.4 });
    label(x, 760, name, k * (0.4 + 0.6 * on), c ? css(c, 1) : 'rgba(255,255,255,0.8)', 22);
  });
}
function sceneMain(t, id, lt) {
  const Pp = procAt(t);
  const yaw = -0.32 + 0.12 * Math.sin(t * 0.25), tilt = 0.24;
  const pt = drawWave(t, Pp, yaw, tilt);
  // fronteras y líneas
  vline(pt, XC, COL.blanco, 0.25); vline(pt, XL, COL.blanco, 0.25);
  const thrOn = id === 'threshold' ? fade(wt('threshold', 'tre') - 0.3, t, 0.6) : (Pp.comp > 0 ? 1 : 0);
  if (thrOn > 0.01) dline(pt, XC, lerp(XC, XL, thrOn), Pp.thr * Pp.mk * (id === 'threshold' || id === 'ratio' ? 1 : 1), COL.naranja, thrOn);
  if (Pp.lim > 0) dline(pt, XL, XE, Pp.ceil + 0.02, Pp.err > 0.5 ? COL.rojo : mixc(COL.blanco, COL.verde, 0.6 * kickEnv(t)), 1, 2.6, 0.018);
  // estaciones
  const act = { promesa: [0, 1, 2], cruda: [0], threshold: [1], ratio: [1], limiter: [2], revelacion: [1, 2], error: [2], tip: [2] }[id] || [0, 1, 2];
  const showSt = ['promesa', 'cruda', 'threshold', 'limiter', 'error', 'tip'].includes(id);
  if (showSt) stationOrbs(t, act, id === 'promesa' ? fade(RANGES.promesa[0], t, 0.6) : 1);
  return pt;
}
function overlay(t, id, lt) {
  const at = (s, w, n) => wt(s, w, n);
  if (id === 'promesa') { tag('EL VIAJE DE TU TRACK', 300, fade(RANGES.promesa[0] + 0.1, t)); headline('Compresor → *Limiter*', 400, fade(at('promesa', 'compresor') - 0.1, t), 76, ACC.verde); }
  if (id === 'cruda') { tag('00 · ENTRADA', 300, fade(RANGES.cruda[0], t)); headline('Picos sin *control*', 400, fade(RANGES.cruda[0] + 0.15, t), 80, ACC.rojo); }
  if (id === 'threshold') { tag('01 · COMPRESOR', 300, fade(RANGES.threshold[0], t)); headline('*Threshold*', 400, fade(at('threshold', 'tre') - 0.1, t), 92); label(W / 2, 1320, 'ARRIBA SE COMPRIME · ABAJO PASA INTACTO', fade(at('threshold', 'cruza'), t), 'rgba(255,255,255,0.55)', 22); }
  if (id === 'ratio') {
    tag('01 · COMPRESOR', 300, 1); headline('Ratio *4:1*', 400, fade(RANGES.ratio[0] + 0.1, t), 92);
    transfer(760, 610, 220, 0.5, procAt(t).ratio, fade(at('ratio', 'cuatro') - 0.2, t, 0.5));
    ratioDots(300, 690, t);
  }
  if (id === 'limiter') { tag('02 · LIMITER', 300, fade(RANGES.limiter[0], t)); headline('Techo de *cristal*', 400, fade(at('limiter', 'techo') - 0.1, t), 88, ACC.verde); label(W / 2, 1320, 'RATIO ∞:1 · NINGÚN PICO PASA', fade(at('limiter', 'infinito') - 0.2, t), css(COL.verde, 0.9), 22); }
  if (id === 'revelacion') {
    tag('RESULTADO', 300, 1); headline('Controla y *protege*', 400, fade(at('revelacion', 'compresor') - 0.1, t), 80, ACC.verde);
    const k = fade(at('revelacion', 'subir'), t), lA = loud(t, P({ zones: false })), lB = loud(t, procAt(t));
    dotMeter(330, 600, clamp((lA - 0.15) / 0.7), 'ANTES', COL.blanco, k); dotMeter(330, 680, clamp((lB - 0.15) / 0.7), 'DESPUÉS', COL.verde, k);
  }
  if (id === 'error') { tag('EL ERROR', 300, 1, css(COL.rojo, 0.9)); headline('Todo al *limiter*', 400, fade(at('error', 'dejarle') - 0.1, t), 88, ACC.rojo); label(W / 2, 1320, 'EL KICK PIERDE EL GOLPE', fade(at('error', 'golpe') - 0.2, t), css(COL.rojo, 0.9), 22); }
  if (id === 'tip') { tag('LA REGLA', 300, 1, css(COL.verde, 0.9)); headline('Limiter: *1–3 dB*', 400, fade(RANGES.tip[0] + 0.1, t), 92, ACC.verde); label(W / 2, 1320, 'DE REDUCCIÓN, MÁXIMO', fade(at('tip', 'maximo') - 0.3, t), css(COL.verde, 0.9), 22); }
}
function sceneMarca(t, lt) {
  const tM = wt('marca', 'mef');
  const kW = 1 - ss(RANGES.marca[0], RANGES.marca[0] + 0.8, t);
  if (kW > 0.01) drawWave(t, P(GOOD), -0.32, 0.24, kW);
  const k = fade(RANGES.marca[0] + 0.3, t, 0.8);
  orb('connecting', W / 2, 860, 620 * (0.9 + 0.1 * k), t, { alpha: k * (t > tM ? 0.45 : 1) });
  if (t > tM) wordmark(W / 2, 880, 0.95 * (0.96 + 0.04 * easeOutBack((t - tM) / 0.5)), fade(tM, t, 0.3));
  label(W / 2, 1180, 'MEZCLA  ·  MÁSTER', fade(wt('marca', 'mezcla') - 0.1, t), css(COL.naranja, 1), 30);
  tag('EQUILIBRIO', 300, fade(RANGES.marca[0] + 0.2, t));
}
function sceneCta(t, lt) {
  const tG = wt('cta', 'guarda'), tS = wt('cta', 'siguenos'), tEnd = SEG.cta.end + 0.15;
  const fo = 1 - ss(tEnd, tEnd + 0.4, t);
  ctx.save(); ctx.globalAlpha = fo;
  orb('breathing', W / 2, 640, 300, t, { alpha: 0.9 });
  const kb = pop(tG - 0.05, t, 0.5); if (kb > 0) { bookmark(W / 2, 640, kb * 0.9, ss(tG + 0.4, tG + 1.0, t), ACC.verde); headline('Guárdalo', 860, kb * fo, 92); }
  const kf = pop(tS - 0.05, t);
  if (kf > 0) {
    ctx.save(); ctx.translate(W / 2, 1000); ctx.scale(kf, kf); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-220, -46, 440, 92, 46); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = F(42); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+ Seguir', 0, 3); ctx.textBaseline = 'alphabetic'; ctx.restore();
    label(W / 2, 1120, HANDLE, kf * fo, '#fff', 40);
  }
  ctx.restore();
  if (t > tEnd) {
    const k = fade(tEnd, t, 0.5);
    orb('connecting', W / 2, 860, 640, t, { alpha: k * 0.35 });
    wordmark(W / 2, 880, 0.95 * (1 + 0.015 * kickEnv(t)), k);
    label(W / 2, 1120, HANDLE, k, '#fff', 40);
    label(W / 2, 1180, 'MIX & MASTER PARA TECHNO', k, 'rgba(255,255,255,0.5)', 24);
  }
}

// ---------------------------------------------------------------- render
window.renderAt = function (t) {
  const id = sceneAt(t), lt = LT(id, t);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // transición: corte limpio con un barrido de opacidad muy corto
  const tin = clamp(lt / 0.25);
  ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * tin;
  if (id === 'hook') sceneHook(t, lt);
  else if (id === 'marca') sceneMarca(t, lt);
  else if (id === 'cta') sceneCta(t, lt);
  else { sceneMain(t, id, lt); overlay(t, id, lt); }
  ctx.restore();
  if (id === 'marca' || (id === 'cta' && t < SEG.cta.end + 0.15)) { if (t > wt('marca', 'mef')) wordmarkSmall(t); }
  progressPill(t);
  drawSubs(t);
};
function wordmarkSmall(t) { if (sceneAt(t) === 'cta') { ctx.save(); wordmark(W - 110, 140, 0.22, 0.8); ctx.restore(); } }
window.frameJpeg = function (t, q = 0.92) { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = TL.duration;
window.READY = true;
