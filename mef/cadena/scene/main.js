// MEF Estudio — la cadena ONDA → COMPRESOR → LIMITER en 6 estilos de animación 2D para elegir.
// Negro y blanco; NARANJA = compresor/threshold, VERDE = limiter/techo, ROJO = picos que pasarían el techo.
const W = 1080, H = 1920;
const NAR = '#FF7A1A', VER = '#2EE67A', ROJ = '#FF3B30', BL = '#FFFFFF', DIM = 'rgba(255,255,255,0.18)', GR = 'rgba(255,255,255,0.5)';
const F = (sz, w = 700) => `${w} ${sz}px Grotesk`;
await Promise.all([F(60), F(28, 500)].map(f => document.fonts.load(f)));
const STYLES = [['01', 'OSCILOSCOPIO'], ['02', 'BARRAS DE DAW'], ['03', 'MATRIZ DE PUNTOS'], ['04', 'DIAGRAMA DE FLUJO'], ['05', 'MEDIDORES'], ['06', 'CAPAS APILADAS']];
const DUR = 5.0, B = 60 / 130;
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const kickEnv = t => { const ph = ((t % B) + B) % B; return Math.exp(-ph / 0.09); };

// ---- señal y procesado (igual que en los videos)
function level(tau) {
  tau += 400 * B; const n = Math.floor(tau / B), ph = tau - n * B;
  const kick = Math.exp(-ph / 0.11) * (0.95 + 0.05 * hash(n, 3));
  const clap = (n % 2 === 1) ? 0.9 * Math.exp(-Math.max(0, ph - 0.03) / 0.09) * Math.min(1, ph / 0.03) : 0;
  const ph2 = (tau + B / 2) % B; const bass = 0.4 * Math.exp(-ph2 / 0.12) * Math.min(1, ph2 / 0.02);
  const hat = 0.14 * Math.exp(-(tau % (B / 4)) / 0.03); const body = 0.16 + 0.04 * Math.sin(tau * 5.3);
  return 1 - (1 - kick) * (1 - clap) * (1 - bass) * (1 - hat) * (1 - body);
}
const THR = 0.5, RATIO = 4, MK = 1.3, BOOST = 1.22, CEIL = 0.86;
function stages(tau) {
  const a = level(tau);
  const c = (a > THR ? THR + (a - THR) / RATIO : a) * MK;
  const bo = c * BOOST, l = Math.min(bo, CEIL);
  return { a, c, l, over: a > THR, lim: bo > CEIL * 0.98 };
}
// zona según x (para los estilos de una sola línea): 0 entrada, 1 compresor, 2 limiter
const X0 = 96, X1 = 984, ZW = (X1 - X0) / 3, V = 360; // px/s
const zoneOf = x => x < X0 + ZW ? 0 : x < X0 + 2 * ZW ? 1 : 2;
const tauX = (x, t) => t - (x - X0) / V;
function procX(x, t) { const s = stages(tauX(x, t)); const z = zoneOf(x); return { ...s, z, amp: z === 0 ? s.a : z === 1 ? s.c / MK : s.l }; }
// nota: en la zona del compresor se muestra la reducción sin make-up (para que se vea la línea del threshold),
// y en la del limiter, la señal completa (con make-up y boost) contra el techo.

// ---- dibujo
const CY = 960, AMP = 300;
function dot(x, y, r, c, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
function label(x, y, s, c = GR, sz = 24, align = 'center', ls = 5) { ctx.font = F(sz, 500); ctx.letterSpacing = `${ls}px`; ctx.fillStyle = c; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.letterSpacing = '0px'; }
function hline(x0, x1, y, c, dash = [10, 10], w = 3, a = 1) { ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
function chrome(n, t) {
  label(X0, 300, `ESTILO ${STYLES[n][0]} — ${STYLES[n][1]}`, GR, 28, 'left', 6);
  ctx.fillStyle = DIM; ctx.fillRect(X0, 330, X1 - X0, 2);
  ctx.font = F(60); ctx.letterSpacing = '-2px'; ctx.textAlign = 'left'; let x = X0;
  for (const [s, c] of [['Onda', BL], [' → ', GR], ['Compresor', NAR], [' → ', GR], ['Limiter', VER]]) { ctx.fillStyle = c; ctx.fillText(s, x, 430); x += ctx.measureText(s).width; }
  ctx.letterSpacing = '0px';
  label(X0, 1440, '@MEF.ESTUDIOS', GR, 28, 'left', 6);
  dot(X1 - 8, 1430, 8 * (1 + 0.6 * kickEnv(t)), NAR);
}
function zoneLabels(y = CY + AMP + 90) {
  ['ENTRADA', 'COMPRESOR', 'LIMITER'].forEach((s, i) => label(X0 + ZW * (i + 0.5), y, s, [BL, NAR, VER][i], 24));
  for (const i of [1, 2]) { const x = X0 + ZW * i; ctx.fillStyle = DIM; for (let y = CY - AMP - 40; y < CY + AMP + 40; y += 14) ctx.fillRect(x - 1, y, 2, 7); }
}
function zoneLines(alpha = 1) {
  hline(X0 + ZW, X0 + 2 * ZW, CY - THR * AMP, NAR, [10, 10], 3, alpha); hline(X0 + ZW, X0 + 2 * ZW, CY + THR * AMP, NAR, [10, 10], 3, alpha * 0.45);
  hline(X0 + 2 * ZW, X1, CY - CEIL * AMP, VER, [], 3, alpha); hline(X0 + 2 * ZW, X1, CY + CEIL * AMP, VER, [], 3, alpha * 0.45);
  label(X0 + ZW + 6, CY - THR * AMP - 14, 'THRESHOLD', NAR, 18, 'left', 3);
  label(X1, CY - CEIL * AMP - 14, 'TECHO −1 dB', VER, 18, 'right', 3);
}
// color de la parte "procesada" de un punto/segmento a la altura v (0..1) en la zona z
function colAt(p, v) {
  if (p.z === 0) return p.a > CEIL && v > CEIL ? ROJ : BL;
  if (p.z === 1) return p.over && v > THR * 0.96 ? NAR : BL;
  return p.lim && v > CEIL - 0.05 ? VER : BL;
}

// 01 — osciloscopio: una línea fina que oscila
function s1(t) {
  zoneLines(); zoneLabels();
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  let prev = null;
  for (let x = X0; x <= X1; x += 2) {
    const p = procX(x, t), tau = tauX(x, t), car = Math.sin(2 * Math.PI * 28 * tau);
    const v = p.amp * car, y = CY - v * AMP;
    if (prev) { ctx.strokeStyle = colAt(p, Math.abs(v)); ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke(); }
    prev = [x, y];
  }
}
// 02 — barras de DAW (espejadas)
function s2(t) {
  zoneLines(0.7); zoneLabels();
  for (let x = X0 + 4; x < X1; x += 12) {
    const p = procX(x, t), h = p.amp * AMP;
    const split = p.z === 1 && p.over ? THR : p.z === 2 && p.lim ? CEIL - 0.05 : p.z === 0 && p.a > CEIL ? CEIL : 2;
    const hs = Math.min(h, split * AMP);
    ctx.fillStyle = BL; ctx.fillRect(x - 3, CY - hs, 7, hs * 2);
    if (h > hs) { ctx.fillStyle = colAt(p, 1); ctx.fillRect(x - 3, CY - h, 7, h - hs); ctx.fillRect(x - 3, CY + hs, 7, h - hs); }
  }
}
// 03 — matriz de puntos
function s3(t) {
  zoneLines(0.5); zoneLabels();
  for (let x = X0 + 7; x < X1; x += 15) {
    const p = procX(x, t), n = Math.floor(p.amp * AMP / 15);
    for (let k = -n; k <= n; k++) { const v = Math.abs(k * 15) / AMP; dot(x, CY - k * 15, 4.2 - 1.4 * v, colAt(p, v)); }
  }
}
// 04 — diagrama de flujo: tres cajas conectadas, pulsos viajan con cada kick
function s4(t) {
  const bw = 250, bh = 300, gap = (X1 - X0 - 3 * bw) / 2, ys = CY - bh / 2;
  const names = ['ONDA', 'COMPRESOR', 'LIMITER'], cols = [BL, NAR, VER];
  for (let i = 0; i < 3; i++) {
    const bx = X0 + i * (bw + gap);
    ctx.strokeStyle = i ? cols[i] : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(bx, ys, bw, bh, 22); ctx.stroke();
    label(bx + bw / 2, ys + bh + 56, names[i], cols[i], 24);
    // mini onda (barras) de la salida de cada etapa
    const cy = ys + bh / 2, A = bh * 0.38;
    for (let k = 0; k < 18; k++) {
      const x = bx + 22 + k * 12, s = stages(t - (18 - k) * 0.035), v = [s.a, s.c / MK, s.l][i];
      const c = i === 0 ? (s.a > CEIL ? ROJ : BL) : i === 1 ? (s.over ? NAR : BL) : (s.lim ? VER : BL);
      ctx.fillStyle = c; ctx.fillRect(x - 3, cy - v * A, 6, v * A * 2);
    }
    if (i === 1) hline(bx + 14, bx + bw - 14, cy - THR * A, NAR, [6, 6], 2);
    if (i === 2) hline(bx + 14, bx + bw - 14, cy - CEIL * A, VER, [], 2);
    if (i < 2) {
      const ax0 = bx + bw + 14, ax1 = bx + bw + gap - 14;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax0, CY); ctx.lineTo(ax1, CY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax1 - 12, CY - 8); ctx.lineTo(ax1, CY); ctx.lineTo(ax1 - 12, CY + 8); ctx.stroke();
      const ph = (((t % B) + B) % B) / B, px = lerp(ax0, ax1, ease(ph * 1.6));
      dot(px, CY, 7 * (1 - 0.5 * ph), cols[i + 1], 1 - ph * 0.6);
    }
  }
  label(W / 2, ys - 60, 'RATIO 4:1  ·  TECHO −1 dB', GR, 22);
}
// 05 — medidores: entrada, compresor (con GR), limiter (con GR)
const peakHold = (fn, t) => { let m = 0; for (let i = 0; i < 12; i++) m = Math.max(m, fn(t - i * 0.02) * Math.exp(-i * 0.02 / 0.25)); return m; };
function s5(t) {
  const mh = 640, mw = 120, top = CY - mh / 2, xs = [X0 + 90, W / 2 - mw / 2, X1 - 90 - mw], N = 32;
  const vals = [peakHold(x => stages(x).a, t), peakHold(x => stages(x).c / MK * 1, t), peakHold(x => stages(x).l, t)];
  const gr = [0, peakHold(x => { const s = stages(x); return s.a - s.c / MK; }, t), peakHold(x => { const s = stages(x); return s.c * BOOST - s.l; }, t)];
  const names = ['ENTRADA', 'COMPRESOR', 'LIMITER'], cols = [BL, NAR, VER];
  xs.forEach((x, i) => {
    for (let k = 0; k < N; k++) {
      const v = (k + 0.5) / N, on = v <= vals[i], y = top + mh - (k + 1) * (mh / N) + 3;
      let c = 'rgba(255,255,255,0.08)';
      if (on) c = i === 0 ? (v > CEIL ? ROJ : BL) : i === 1 ? (v > THR ? NAR : BL) : (v > CEIL - 0.06 ? VER : BL);
      ctx.fillStyle = c; ctx.fillRect(x, y, mw, mh / N - 6);
    }
    if (i === 1) { hline(x - 20, x + mw + 20, top + mh * (1 - THR), NAR, [8, 6], 3); label(x + mw / 2, top + mh * (1 - THR) - 14, 'THRESHOLD', NAR, 16, 'center', 3); }
    if (i === 2) { hline(x - 20, x + mw + 20, top + mh * (1 - CEIL), VER, [], 3); label(x + mw / 2, top + mh * (1 - CEIL) - 14, 'TECHO', VER, 16, 'center', 3); }
    if (i > 0) { // reducción de ganancia (baja desde arriba)
      const gx = x + mw + 26, g = clamp(gr[i] * 2.2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(gx, top, 14, mh * 0.5);
      ctx.fillStyle = cols[i]; ctx.fillRect(gx, top, 14, mh * 0.5 * g);
      label(gx + 7, top - 16, 'GR', cols[i], 16, 'center', 2);
    }
    label(x + mw / 2, top + mh + 56, names[i], cols[i], 24);
  });
}
// 06 — capas apiladas: la misma señal en tres filas alineadas en el tiempo
function s6(t) {
  const rows = [[630, 'ENTRADA', BL, 0], [925, 'COMPRESOR', NAR, 1], [1220, 'LIMITER', VER, 2]], A = 110;
  rows.forEach(([cy, name, col, i]) => {
    label(X0, cy - A - 22, name, col, 22, 'left', 5);
    if (i === 1) hline(X0, X1, cy - THR * A, NAR, [8, 8], 2, 0.8);
    if (i === 2) hline(X0, X1, cy - CEIL * A, VER, [], 2, 0.8);
    if (i === 0) hline(X0, X1, cy - CEIL * A, 'rgba(255,255,255,0.25)', [4, 8], 2);
    for (let x = X0 + 4; x < X1; x += 10) {
      const s = stages(tauX(x, t)), v = [s.a, s.c / MK, s.l][i], h = v * A;
      const split = i === 0 ? (s.a > CEIL ? CEIL : 2) : i === 1 ? (s.over ? THR : 2) : (s.lim ? CEIL - 0.06 : 2);
      const hs = Math.min(h, split * A);
      ctx.fillStyle = BL; ctx.fillRect(x - 2.5, cy - hs, 5, hs * 2);
      if (h > hs) { ctx.fillStyle = i === 0 ? ROJ : col; ctx.fillRect(x - 2.5, cy - h, 5, h - hs); ctx.fillRect(x - 2.5, cy + hs, 5, h - hs); }
    }
  });
}
const FN = [s1, s2, s3, s4, s5, s6];
let STYLE = 0; window.setStyle = n => { STYLE = n; };
window.renderAt = function (t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  chrome(STYLE, t);
  ctx.save(); ctx.globalAlpha = 1; FN[STYLE](t); ctx.restore();
  const k = ease(t / 0.5); if (k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - k})`; ctx.fillRect(0, 480, W, 900); }
};
window.frameJpeg = (t, q = 0.92) => { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = DUR; window.NSTYLES = STYLES.length; window.STYLES = STYLES;
window.READY = true;
