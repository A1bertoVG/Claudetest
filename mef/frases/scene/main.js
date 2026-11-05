// MEF Estudio — misma frase, 6 estilos de animación 2D para elegir.
// Paleta: negro, blanco y un acento (naranja; rojo solo para el tachado). Todo es función de t.
const W = 1080, H = 1920;
const NARANJA = '#FF7A1A', ROJO = '#FF3B30', BLANCO = '#FFFFFF', GRIS = 'rgba(255,255,255,0.45)';
const F = (sz, w = 700) => `${w} ${sz}px Grotesk`;
await Promise.all([F(96), F(30, 500)].map(f => document.fonts.load(f)));

const STYLES = [
  ['01', 'MÁQUINA DE ESCRIBIR'],
  ['02', 'PALABRA POR PALABRA'],
  ['03', 'MATRIZ DE PUNTOS'],
  ['04', 'REVELADO EDITORIAL'],
  ['05', 'DECODIFICADO'],
  ['06', 'TACHADO EN VIVO'],
];
const DUR = 5.0, B = 60 / 130;

// la frase: líneas → palabras { s, acc }  (acento naranja en "sin decisiones")
const LINES = [
  [['Tu'], ['track'], ['no']],
  [['suena'], ['débil.']],
  [['Suena'], ['sin', 1]],
  [['decisiones.', 1]],
].map(l => l.map(([s, acc]) => ({ s, acc: !!acc })));
const SIZE = 118, LH = 132, X0 = 96, Y0 = 760;
const out = document.getElementById('out'); const ctx = out.getContext('2d');

// --- utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const easeIO = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
ctx.font = F(SIZE); ctx.letterSpacing = '-3px';
const SPACE = ctx.measureText(' ').width;
// posiciones de cada palabra / letra
const WORDS = []; let gi = 0;
LINES.forEach((ln, li) => { let x = X0; ln.forEach(w => { const wd = ctx.measureText(w.s).width; WORDS.push({ ...w, x, y: Y0 + li * LH, w: wd, li, i: gi++ }); x += wd + SPACE; }); });
const CHARS = []; WORDS.forEach(w => { let x = w.x; for (const ch of w.s) { const cw = ctx.measureText(ch).width; CHARS.push({ ch, x, y: w.y, acc: w.acc, wi: w.i, li: w.li }); x += cw; } CHARS.push({ ch: ' ', x, y: w.y, acc: false, wi: w.i, li: w.li, space: true }); });
const colorOf = w => w.acc ? NARANJA : BLANCO;
function text(s, x, y, c, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.font = F(SIZE); ctx.letterSpacing = '-3px'; ctx.textAlign = 'left'; ctx.fillText(s, x, y); ctx.globalAlpha = 1; }
function dot(x, y, r, c, a = 1) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }

function chrome(n, t) {
  ctx.font = F(28, 500); ctx.letterSpacing = '6px'; ctx.fillStyle = GRIS; ctx.textAlign = 'left';
  ctx.fillText(`ESTILO ${STYLES[n][0]} — ${STYLES[n][1]}`, X0, 300);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X0, 330, W - 2 * X0, 2);
  ctx.fillStyle = GRIS; ctx.fillText('@MEF.ESTUDIOS', X0, 1420); ctx.letterSpacing = '0px';
  const k = 1 + 0.6 * Math.exp(-(((t % B) + B) % B) / 0.1); ctx.fillStyle = NARANJA; ctx.beginPath(); ctx.arc(W - X0 - 8, 1410, 8 * k, 0, 6.2832); ctx.fill();
}

// 01 — máquina de escribir: letra por letra, cursor de bloque
function s1(t) {
  const cps = 17, t0 = 0.3; const n = Math.floor((t - t0) * cps);
  let last = null;
  CHARS.forEach((c, i) => { if (i < n) { if (!c.space) text(c.ch, c.x, c.y, c.acc ? NARANJA : BLANCO); last = c; } });
  const done = n >= CHARS.length;
  const cx = last ? last.x + ctx.measureText(last.ch).width + 6 : X0, cy = last ? last.y : Y0;
  if (!done || Math.floor(t * 2.2) % 2 === 0) { ctx.fillStyle = NARANJA; ctx.fillRect(cx, cy - SIZE * 0.78, 14, SIZE * 0.9); }
}
// 02 — palabra por palabra, al ritmo (cada corchea), con rebote
function s2(t) {
  WORDS.forEach((w, i) => {
    const t0 = 0.25 + i * B / 2 * 1.15; if (t < t0) return;
    const k = back((t - t0) / 0.32), a = clamp((t - t0) / 0.12);
    const sc = lerp(1.5, 1, k); const cx = w.x + w.w / 2, cy = w.y - SIZE * 0.35;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); text(w.s, w.x, w.y, colorOf(w), a); ctx.restore();
  });
}
// 03 — matriz de puntos: el texto se arma con puntos que llegan desde el caos (guiño a thinking-orbs)
const DOTS = (() => {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 900; const g = cv.getContext('2d');
  g.font = F(SIZE); g.letterSpacing = '-3px'; g.textAlign = 'left';
  WORDS.forEach(w => { g.fillStyle = w.acc ? '#ff0000' : '#ffffff'; g.fillText(w.s, w.x, w.y - Y0 + 200); });
  const d = g.getImageData(0, 0, W, 900).data, out = []; const step = 7;
  for (let y = 0; y < 900; y += step) for (let x = 0; x < W; x += step) { const k = (y * W + x) * 4; if (d[k + 3] > 140) out.push({ x, y: y + Y0 - 200, acc: d[k + 1] < 100 }); }
  return out;
})();
function s3(t) {
  DOTS.forEach((p, i) => {
    const h1 = hash(i, 1), h2 = hash(i, 2), h3 = hash(i, 3);
    const t0 = 0.2 + (p.x / W) * 1.1 + h3 * 0.5, k = easeIO((t - t0) / 1.0);
    const sx = W / 2 + (h1 - 0.5) * 1400, sy = 1000 + (h2 - 0.5) * 1500;
    const x = lerp(sx, p.x, k), y = lerp(sy, p.y, k);
    const r = lerp(1.2, 2.9, k) * (1 + 0.25 * Math.sin(t * 3 + p.x * 0.05) * (1 - k));
    dot(x, y, r, p.acc ? NARANJA : BLANCO, lerp(0.25, 1, k));
  });
}
// 04 — revelado editorial: cada línea sube desde una máscara, una regla se dibuja antes
function s4(t) {
  LINES.forEach((ln, li) => {
    const t0 = 0.3 + li * 0.32, k = ease((t - t0) / 0.7), y = Y0 + li * LH;
    const rule = ease((t - t0 + 0.2) / 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(X0, y + 22, (W - 2 * X0) * rule, 2);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - SIZE, W, SIZE + 24); ctx.clip();
    WORDS.filter(w => w.li === li).forEach(w => text(w.s, w.x, y + (1 - k) * (SIZE + 30), colorOf(w)));
    ctx.restore();
  });
}
// 05 — decodificado: caracteres aleatorios que se resuelven de izquierda a derecha
const GLYPHS = '01#%&*+=<>/\\|ABCDEFGHJKLMNPRSTUVXYZ';
function s5(t) {
  const f = Math.floor(t * 30 / 2);
  CHARS.forEach((c, i) => {
    if (c.space) return;
    const tStart = 0.15 + i * 0.012, tSolve = 0.5 + i * 0.045;
    if (t < tStart) return;
    if (t >= tSolve) { text(c.ch, c.x, c.y, c.acc ? NARANJA : BLANCO); return; }
    const g = GLYPHS[Math.floor(hash(i, f) * GLYPHS.length)];
    text(g, c.x, c.y, c.acc ? 'rgba(255,122,26,0.55)' : 'rgba(255,255,255,0.4)');
  });
}
// 06 — tachado en vivo: la primera idea se escribe, se tacha en rojo y aparece la verdad
function s6(t) {
  const first = WORDS.filter(w => w.li < 2), second = WORDS.filter(w => w.li >= 2);
  first.forEach((w, i) => { const t0 = 0.2 + i * 0.16; if (t >= t0) text(w.s, w.x, w.y + (1 - ease((t - t0) / 0.25)) * 20, BLANCO, clamp((t - t0) / 0.2)); });
  const deb = first.at(-1), tS = 1.35, ks = easeIO((t - tS) / 0.35);
  if (t > tS) {
    ctx.fillStyle = ROJO; ctx.fillRect(deb.x - 6, deb.y - SIZE * 0.32, (deb.w + 12) * ks, 10);
    const dim = ease((t - tS - 0.4) / 0.4); if (dim > 0) { ctx.fillStyle = `rgba(0,0,0,${0.55 * dim})`; ctx.fillRect(deb.x - 8, deb.y - SIZE, deb.w + 16, SIZE + 20); }
  }
  second.forEach((w, i) => { const t0 = 2.0 + i * 0.22; if (t >= t0) { const k = back((t - t0) / 0.35); const cy = w.y - SIZE * 0.35; ctx.save(); ctx.translate(w.x, cy); ctx.scale(1, k); ctx.translate(-w.x, -cy); text(w.s, w.x, w.y, colorOf(w)); ctx.restore(); } });
}
const FN = [s1, s2, s3, s4, s5, s6];

let STYLE = +(new URLSearchParams(location.search).get('s') || 0);
window.setStyle = n => { STYLE = n; };
window.renderAt = function (t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  chrome(STYLE, t);
  FN[STYLE](t);
};
window.frameJpeg = (t, q = 0.92) => { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = DUR; window.NSTYLES = STYLES.length; window.STYLES = STYLES;
window.READY = true;
