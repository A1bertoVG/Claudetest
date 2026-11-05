// MEF Estudio — prueba de estilo "pizarra" (explicador dibujado a mano, tipo DistilBook).
// Papel blanco, plumón negro, acentos: naranja = compresor, verde = limiter, rojo = picos.
// Todo se "dibuja" en el tiempo: cada trazo tiene inicio y duración, y un plumón sigue la punta.
const W = 1080, H = 1920;
const INK = '#151515', NAR = '#F26B1D', VER = '#1FA65A', ROJ = '#E0352B', PAPER = '#F7F5F0';
const HAND = sz => `700 ${sz}px Caveat`;
await Promise.all([HAND(80), '500 26px Grotesk'].map(f => document.fonts.load(f)));
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = x => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), u) - 0.5; };

// ---- señal (misma que los videos) y procesado
const B = 60 / 130;
function level(tau) {
  tau += 400 * B; const n = Math.floor(tau / B), ph = tau - n * B;
  const kick = Math.exp(-ph / 0.11) * (0.95 + 0.05 * hash(n, 3));
  const clap = (n % 2 === 1) ? 0.9 * Math.exp(-Math.max(0, ph - 0.03) / 0.09) * Math.min(1, ph / 0.03) : 0;
  const ph2 = (tau + B / 2) % B; const bass = 0.4 * Math.exp(-ph2 / 0.12) * Math.min(1, ph2 / 0.02);
  const body = 0.16 + 0.04 * Math.sin(tau * 5.3);
  return 1 - (1 - kick) * (1 - clap) * (1 - bass) * (1 - body);
}
const THR = 0.5, RATIO = 4, MK = 1.3, BOOST = 1.22, CEIL = 0.86;
const comp = a => (a > THR ? THR + (a - THR) / RATIO : a);
const limit = a => Math.min(comp(a) * MK * BOOST, CEIL);

// ---- trazos "a mano": polilíneas con temblor, dibujadas hasta una fracción
function wobble(pts, seed, amt = 1.6) {
  return pts.map(([x, y], i) => [x + noise(i * 0.35, seed) * amt * 2, y + noise(i * 0.35, seed + 9) * amt * 2]);
}
function linePts(x0, y0, x1, y1, step = 8) { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)); return Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(y0, y1, i / n)]); }
function rectPts(x, y, w, h) { return [...linePts(x, y, x + w, y), ...linePts(x + w, y, x + w, y + h).slice(1), ...linePts(x + w, y + h, x, y + h).slice(1), ...linePts(x, y + h, x, y + 4).slice(1)]; }
function ellipsePts(cx, cy, rx, ry, turns = 1.08) { const n = 60; return Array.from({ length: n + 1 }, (_, i) => { const a = -2.2 + i / n * turns * 2 * Math.PI; return [cx + Math.cos(a) * rx * (1 + 0.04 * Math.sin(i)), cy + Math.sin(a) * ry]; }); }
let TIP = null; // punta activa del plumón: [x, y, color]
function stroke(pts, p, color = INK, width = 5, seed = 1, dash = null, double = true) {
  if (p <= 0) return; const n = Math.max(2, Math.floor(pts.length * clamp(p)));
  const w = wobble(pts.slice(0, n), seed);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); w.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  if (double) { ctx.globalAlpha = 0.35; ctx.lineWidth = width * 0.6; const w2 = wobble(pts.slice(0, n), seed + 50, 1.2); ctx.beginPath(); w2.forEach(([x, y], i) => i ? ctx.lineTo(x + 1.5, y + 1) : ctx.moveTo(x + 1.5, y + 1)); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.setLineDash([]);
  if (p < 1) TIP = [...w.at(-1), color];
}
function write(text, x, y, p, color = INK, size = 76, align = 'left') {
  if (p <= 0) return; ctx.font = HAND(size); ctx.textAlign = 'left'; const tw = ctx.measureText(text).width; const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 10, y - size, (tw + 20) * clamp(p), size * 1.5); ctx.clip();
  ctx.fillStyle = color; ctx.fillText(text, x0, y); ctx.restore();
  if (p < 1) TIP = [x0 + tw * p, y - size * 0.3, color];
}
function arrow(x0, y0, x1, y1, p, color = INK, seed = 3) {
  stroke(linePts(x0, y0, x1, y1), p, color, 5, seed);
  if (p >= 1) { const a = Math.atan2(y1 - y0, x1 - x0), L = 26; stroke([[x1 - L * Math.cos(a - 0.45), y1 - L * Math.sin(a - 0.45)], [x1, y1], [x1 - L * Math.cos(a + 0.45), y1 - L * Math.sin(a + 0.45)]], 1, color, 5, seed + 1, null, false); }
}
// forma de onda dibujada como zigzag (lo que haría alguien con plumón)
function wavePts(cx0, cx1, cy, A, fn) {
  const pts = []; let s = 1;
  for (let x = cx0; x <= cx1; x += 7) { const tau = 1.2 + (x - cx0) / 330; const v = fn(level(tau)); pts.push([x, cy - s * v * A]); s = -s; }
  return pts;
}
// plumón que sigue la punta
function marker() {
  if (!TIP) return; const [x, y, c] = TIP;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.roundRect(14, 12, 46, 230, 18); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -6); ctx.lineTo(24, 30); ctx.lineTo(-8, 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.roundRect(-14, 28, 50, 220, 16); ctx.fill();
  ctx.fillStyle = c; ctx.fillRect(-14, 70, 50, 26);
  ctx.restore();
}

// ---- guion visual (segundos)
const RX0 = 150, RX1 = 930, A = 120;
const ROWS = { a: 600, b: 1000, c: 1400 };
const S = [
  // título
  [0.0, 1.1, p => write('Onda → Compresor → Limiter', W / 2, 300, p, INK, 82, 'center')],
  [1.0, 0.5, p => stroke(linePts(250, 330, 830, 336), p, NAR, 6, 7)],
  // fila A: la onda cruda
  [1.5, 0.5, p => write('1. tu onda', RX0, ROWS.a - A - 40, p, INK, 60)],
  [1.8, 1.6, p => stroke(wavePts(RX0, RX1, ROWS.a, A, a => a), p, INK, 4, 11, null, false)],
  [3.4, 0.5, p => stroke(linePts(RX0, ROWS.a - CEIL * A, RX1, ROWS.a - CEIL * A), p, 'rgba(21,21,21,0.35)', 3, 12, [10, 12], false)],
  [3.6, 0.6, p => stroke(ellipsePts(368, ROWS.a - A * 0.95, 42, 30), p, ROJ, 5, 13)],
  [3.9, 0.6, p => stroke(ellipsePts(522, ROWS.a - A * 0.95, 42, 30), p, ROJ, 5, 14)],
  [4.2, 0.5, p => write('picos', 590, ROWS.a - A - 50, p, ROJ, 54)],
  // flecha y fila B: compresor
  [4.7, 0.5, p => arrow(W / 2, ROWS.a + A + 12, W / 2, ROWS.b - A - 88, p)],
  [5.1, 0.6, p => write('2. compresor', RX0, ROWS.b - A - 40, p, NAR, 60)],
  [5.4, 0.4, p => write('4:1', RX1, ROWS.b - A - 40, p, NAR, 64, 'right')],
  [5.6, 0.7, p => stroke(linePts(RX0, ROWS.b - THR * A, RX1, ROWS.b - THR * A), p, NAR, 4, 21, [14, 12], false)],
  [5.6, 0.7, p => stroke(linePts(RX0, ROWS.b + THR * A, RX1, ROWS.b + THR * A), p, NAR, 3, 22, [14, 12], false)],
  [6.1, 0.4, p => write('threshold', RX1, ROWS.b - THR * A - 14, p, NAR, 44, 'right')],
  [6.3, 1.5, p => stroke(wavePts(RX0, RX1, ROWS.b, A, a => comp(a)), p, INK, 4, 23, null, false)],
  // flecha y fila C: limiter, techo de cristal
  [7.8, 0.5, p => arrow(W / 2, ROWS.b + A + 12, W / 2, ROWS.c - A - 88, p)],
  [8.2, 0.6, p => write('3. limiter', RX0, ROWS.c - A - 40, p, VER, 60)],
  [8.5, 0.6, p => { const y = ROWS.c - CEIL * A - 8; stroke(linePts(RX0 - 10, y, RX1 + 10, y), p, VER, 6, 31); stroke(linePts(RX0 - 10, y - 14, RX1 + 10, y - 14), p, VER, 3, 32, null, false); }],
  [8.9, 0.6, p => { const y = ROWS.c - CEIL * A - 22; const n = Math.floor(29 * clamp(p)); for (let i = 0; i < n; i++) { const x = RX0 + 4 + i * 27; stroke(linePts(x, y + 12, x + 16, y - 8, 4), 1, VER, 3, 40 + i, null, false); } }],
  [9.2, 0.5, p => write('techo de cristal · −1 dB', RX1, ROWS.c - CEIL * A - 52, p, VER, 44, 'right')],
  [9.4, 1.5, p => stroke(wavePts(RX0, RX1, ROWS.c, A, a => limit(a)), p, INK, 4, 33, null, false)],
  [10.9, 0.6, p => stroke(ellipsePts(W / 2, ROWS.c - CEIL * A + 4, 380, 28, 1.02), p, VER, 4, 34)],
  // cierre
  [11.6, 0.7, p => write('más fuerte, sin perder el golpe', W / 2, 1660, p, INK, 58, 'center')],
  [12.2, 0.5, p => stroke(linePts(300, 1680, 780, 1684), p, NAR, 6, 41)],
  [12.6, 0.5, p => write('MEF Estudio · @mef.estudios', W / 2, 1770, p, 'rgba(21,21,21,0.7)', 46, 'center')],
];
function paper() {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.035)'; for (let i = 0; i < 2500; i++) { const x = hash(i, 1) * W, y = hash(i, 2) * H; ctx.fillRect(x, y, 2, 2); }
}
window.renderAt = function (t) {
  TIP = null; paper();
  for (const [t0, d, fn] of S) { const p = (t - t0) / d; if (p > 0) fn(ease(p)); }
  marker();
};
window.frameJpeg = (t, q = 0.92) => { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = 14; window.READY = true;
