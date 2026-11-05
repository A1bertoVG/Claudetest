// MEF Estudio — Video #2: "Compresor → Limiter: el techo de cristal".
// Una onda de neón viaja por un túnel: entra cruda, pasa por el COMPRESOR (threshold + ratio)
// y termina bajo el LIMITER (techo de cristal). Todo es función pura del tiempo t.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1080, H = 1920;
const C = { bg: '#050509', rojo: '#FF2E4D', cian: '#22E6FF', violeta: '#7B3CFF', magenta: '#FF3CC7', hielo: '#D8F4FF', gris: '#9AA0B4', amarillo: '#FFE14D' };
const HX = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, new THREE.Color(v)]));
const HEAD = sz => `400 ${sz}px Anton`;
const SANS = (sz, w = 700) => `${w} ${sz}px Grotesk`;
const HANDLE = '@mef.estudios';

const TL = await (await fetch('timeline.json')).json();
const SEG = Object.fromEntries(TL.segments.map(s => [s.id, s]));
const ORDER = TL.segments.map(s => s.id);
await Promise.all([HEAD(120), SANS(56), SANS(40, 500)].map(f => document.fonts.load(f)));

// ---------------------------------------------------------------- utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const pop = (t0, t, d = 0.4) => t < t0 ? 0 : easeOutBack((t - t0) / d);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function timeWords(s, text) {
  const words = text.split(/\s+/).filter(Boolean);
  const w = words.map(x => { const c = x.replace(/\*/g, ''); return (/\d/.test(c) ? 7 * c.replace(/\D/g, '').length / 1.6 + 3 : c.length) + 1 + (/[,.;:]\**$/.test(x) ? 6 : 0) + (/[?!]\**$/.test(x) ? 4 : 0); });
  const tot = w.reduce((a, b) => a + b, 0); const d = s.end - s.start; let acc = 0;
  return words.map((x, i) => { const st = s.start + acc / tot * d; acc += w[i]; return { w: x, s: st, e: s.start + acc / tot * d }; });
}
const WORDS = {}, SUBW = {};
for (const s of TL.segments) { WORDS[s.id] = timeWords(s, s.text); SUBW[s.id] = timeWords(s, s.sub); }
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
function wt(id, prefix, nth = 0) {
  let n = 0;
  for (const w of WORDS[id]) if (norm(w.w).startsWith(norm(prefix))) { if (n++ === nth) return w.s; }
  console.warn('palabra no encontrada', id, prefix); return SEG[id].start;
}
const RANGES = {};
ORDER.forEach((id, i) => {
  const a = i ? SEG[id].start - 0.22 : 0;
  const b = i < ORDER.length - 1 ? SEG[ORDER[i + 1]].start - 0.22 : TL.duration + 0.01;
  RANGES[id] = [a, b];
});
const sceneAt = t => { for (const id of ORDER) if (t >= RANGES[id][0] && t < RANGES[id][1]) return id; return ORDER[ORDER.length - 1]; };
const LT = (id, t) => t - RANGES[id][0];
const DURS = id => RANGES[id][1] - RANGES[id][0];

// ---------------------------------------------------------------- señal (130 BPM)
const BPM = 130, B = 60 / BPM;
const kickEnv = t => { const ph = ((t % B) + B) % B; return Math.exp(-ph / 0.09); };
function level(tau) { // envolvente 0..1 (kick, clap, bajo, hats)
  tau += 400 * B;
  const n = Math.floor(tau / B), ph = tau - n * B;
  const kick = Math.exp(-ph / 0.15) * (0.94 + 0.06 * hash(n, 3));
  const clap = (n % 2 === 1) ? 0.9 * Math.exp(-Math.max(0, ph - 0.03) / 0.12) * ss(0.0, 0.03, ph) : 0;
  const ph2 = (tau + B / 2) % B; const bass = 0.42 * Math.exp(-ph2 / 0.12) * ss(0, 0.015, ph2);
  const ph16 = tau % (B / 4); const hat = 0.14 * Math.exp(-ph16 / 0.03);
  const body = 0.15 + 0.04 * Math.sin(tau * 5.3);
  return 1 - (1 - kick) * (1 - clap) * (1 - bass) * (1 - hat) * (1 - body);
}
const carrier = tau => Math.sin(2 * Math.PI * 15 * tau + 1.3 * Math.sin(tau * 2.1)) * (0.82 + 0.18 * Math.sin(tau * 31.7));

// ---------------------------------------------------------------- mundo
const BASE = 1.55, A = 1.15;            // centro de la onda y amplitud máxima (en unidades 3D)
const XS = -14, XE = 14, V = 2.3;       // la onda viaja hacia +x a V unidades/s
const XC = -2.2, XL = 3.6;              // estaciones: compresor y limiter
const CEIL = 0.84;                      // techo del limiter (≈ -1.5 dB, relativo a la amplitud A)
const yOf = v => BASE + v * A;
const tauAt = (x, t) => t - (x - XS) / V;

const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.FogExp2(0x050509, 0.045);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 120); scene.add(camera);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.8, 0.45, 0.55);
composer.addPass(bloom); composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x6a5cff, 0x080810, 0.7));
const keyL = new THREE.DirectionalLight(0xffffff, 1.3); keyL.position.set(3, 6, 6); scene.add(keyL);
const cyanL = new THREE.PointLight(0x22e6ff, 25, 14, 2); cyanL.position.set(XC, 3.5, 2.5); scene.add(cyanL);
const iceL = new THREE.PointLight(0xd8f4ff, 25, 14, 2); iceL.position.set(XL + 2, 3.8, 2.5); scene.add(iceL);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.3, metalness: 0.75 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(80, 160, 0x3a2290, 0x1a1240); grid.position.y = 0.002; scene.add(grid);

// ---------------------------------------------------------------- la onda (cinta 3D en capas)
const NS = 2600, LAYERS = [{ z: 0, b: 1 }, { z: -0.22, b: 0.45 }, { z: 0.22, b: 0.45 }, { z: -0.44, b: 0.2 }];
const waveGroup = new THREE.Group(); scene.add(waveGroup);
function stripMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 2 * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 2 * 3), 3));
  const idx = []; for (let i = 0; i < NS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  return g;
}
const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const edgeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
const strips = LAYERS.map(L => {
  const fill = new THREE.Mesh(stripMesh(), fillMat); fill.position.z = L.z; fill.frustumCulled = false; waveGroup.add(fill);
  const edge = new THREE.Mesh(stripMesh(), edgeMat); edge.position.z = L.z + 0.002; edge.frustumCulled = false; waveGroup.add(edge);
  return { fill, edge, b: L.b };
});
const cLow = new THREE.Color(0x3b1cff), cMid = new THREE.Color(0xc02cff), cHi = new THREE.Color(0xff2e4d), cCy = HX.cian, cIce = new THREE.Color(0xbfe9ff), cDull = new THREE.Color(0x4a4650);
const tc = new THREE.Color(), tb = new THREE.Color();
// P: estado del procesado { comp, thr, ratio, mk, lim, boost, raw, dull, tint }
function ampAt(x, tau, P) {
  const a = level(tau) * P.raw;
  const wC = ss(XC - 0.12, XC + 0.12, x) * P.comp;
  const c = (a > P.thr ? P.thr + (a - P.thr) / P.ratio : a) * P.mk;
  const pre = lerp(a, c, wC);
  const wL = ss(XL - 0.1, XL + 0.1, x) * P.lim;
  const boosted = pre * P.boost;
  const l = boosted < CEIL * 0.9 ? boosted : CEIL * 0.9 + (CEIL * 0.1) * Math.tanh((boosted - CEIL * 0.9) / (CEIL * 0.1));
  return { amp: lerp(pre, l, wL), a, over: wC * clamp((a - P.thr) * 4) * (P.ratio > 1.05 ? 1 : 0.6) * P.tint, lim: wL * clamp((boosted - CEIL * 0.85) * 5) };
}
function updateWave(t, P) {
  for (const S of strips) {
    const pf = S.fill.geometry.attributes.position.array, cf = S.fill.geometry.attributes.color.array;
    const pe = S.edge.geometry.attributes.position.array, ce = S.edge.geometry.attributes.color.array;
    const zoff = S.fill.position.z;
    for (let i = 0; i < NS; i++) {
      const x = lerp(XS, XE, i / (NS - 1));
      const tau = tauAt(x, t) - Math.abs(zoff) * 0.03;
      const r = ampAt(x, tau, P);
      const v = r.amp * carrier(tau);
      const y = yOf(v);
      const k = i * 6;
      pf[k] = x; pf[k + 1] = BASE; pf[k + 2] = 0; pf[k + 3] = x; pf[k + 4] = y; pf[k + 5] = 0;
      // color por nivel; lo que cruza el threshold se pinta cian; lo que toca el cristal, blanco hielo
      const lv = Math.abs(v);
      if (lv < 0.5) tc.copy(cLow).lerp(cMid, lv / 0.5); else tc.copy(cMid).lerp(cHi, clamp((lv - 0.5) / 0.4));
      tc.lerp(cCy, r.over * 0.85); tc.lerp(cIce, r.lim * 0.7 * P.iceTint); tc.lerp(cDull, P.dull * ss(XL - 0.2, XL + 0.2, x));
      const fade = ss(XS, XS + 2.5, x) * (1 - ss(XE - 2.5, XE, x)) * S.b * P.vis;
      tb.copy(tc).multiplyScalar(0.05 * fade); cf[k] = tb.r; cf[k + 1] = tb.g; cf[k + 2] = tb.b;
      tb.copy(tc).multiplyScalar(0.38 * fade); cf[k + 3] = tb.r; cf[k + 4] = tb.g; cf[k + 5] = tb.b;
      // borde: cinta fina sobre la curva
      pe[k] = x; pe[k + 1] = y - 0.016; pe[k + 2] = 0; pe[k + 3] = x; pe[k + 4] = y + 0.016; pe[k + 5] = 0;
      tb.copy(tc).lerp(cIce, 0.15).multiplyScalar((1.35 - 0.8 * P.dull * ss(XL - 0.2, XL + 0.2, x)) * fade); ce[k] = tb.r; ce[k + 1] = tb.g; ce[k + 2] = tb.b; ce[k + 3] = tb.r; ce[k + 4] = tb.g; ce[k + 5] = tb.b;
    }
    for (const m of [S.fill, S.edge]) { m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.color.needsUpdate = true; }
  }
}
// eje central
const axis = new THREE.Mesh(new THREE.BoxGeometry(XE - XS, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0x2a2450, toneMapped: false })); axis.position.y = BASE; scene.add(axis);

// ---------------------------------------------------------------- túnel de marcos de neón + estaciones
const tunnel = new THREE.Group(); scene.add(tunnel);
const frames = [];
function frame(x, w, h, col, thick = 0.035) {
  const g = new THREE.Group(); g.position.x = x;
  const m = new THREE.MeshBasicMaterial({ color: col.clone(), toneMapped: false });
  const parts = [[0, h, 0, thick, thick, w], [0, 0.02, 0, thick, thick, w], [0, h / 2, -w / 2, thick, h, thick], [0, h / 2, w / 2, thick, h, thick]];
  for (const [px, py, pz, sx, sy, sz] of parts) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(px, py, pz); g.add(b); }
  g.userData.m = m; g.userData.base = col.clone(); return g;
}
for (let x = -13; x <= 13; x += 1.6) { if (Math.abs(x - XC) < 0.5 || Math.abs(x - XL) < 0.5) continue; const f = frame(x, 3.6, 3.6, HX.violeta.clone().multiplyScalar(0.9)); tunnel.add(f); frames.push(f); }
const compGate = frame(XC, 3.4, 3.8, HX.cian.clone().multiplyScalar(2.2), 0.06); scene.add(compGate);
const limGate = frame(XL, 3.4, 3.8, HX.hielo.clone().multiplyScalar(2.0), 0.06); scene.add(limGate);
function neonLabel(text, col, glow, w = 1024, h = 220, size = 140) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = HEAD(size); g.shadowColor = glow; g.shadowBlur = 30; g.fillStyle = col;
  let x = w / 2 - (text.length - 1) * size * 0.52 / 2; for (const ch of text) { g.fillText(ch, x, h / 2); x += size * 0.52; }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 400, h / 400), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, fog: false }));
  return m;
}
const compSign = neonLabel('COMPRESOR', '#e8fdff', C.cian); compSign.position.set(XC, 4.25, 0); scene.add(compSign);
const limSign = neonLabel('LIMITER', '#ffffff', '#bfe9ff'); limSign.position.set(XL, 4.25, 0); scene.add(limSign);

// threshold: láser horizontal (y su espejo, tenue) en la zona del compresor
const thrGroup = new THREE.Group(); scene.add(thrGroup);
const thrMat = new THREE.MeshBasicMaterial({ color: HX.cian.clone().multiplyScalar(2.6), toneMapped: false });
const thrMat2 = new THREE.MeshBasicMaterial({ color: HX.cian.clone().multiplyScalar(0.9), toneMapped: false, transparent: true, opacity: 0.6 });
const thrTop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.03), thrMat); thrGroup.add(thrTop);
const thrBot = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.02), thrMat2); thrGroup.add(thrBot);
const thrSheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3), new THREE.MeshBasicMaterial({ color: HX.cian, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); thrSheet.rotation.x = -Math.PI / 2; thrGroup.add(thrSheet);

// techo de cristal (y piso, tenue) en la zona del limiter
const glass = new THREE.Group(); scene.add(glass);
const GL = XE - XL + 0.2;
const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfefff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, emissive: 0x9fdcff, emissiveIntensity: 0.05 });
const pane = new THREE.Mesh(new THREE.BoxGeometry(GL, 0.04, 2.0), glassMat); glass.add(pane);
const edgeGlassMat = new THREE.MeshBasicMaterial({ color: HX.hielo.clone().multiplyScalar(2.2), toneMapped: false });
for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(GL, 0.025, 0.025), edgeGlassMat); e.position.z = s * 1.0; glass.add(e); }
const crackCv = document.createElement('canvas'); crackCv.width = 1024; crackCv.height = 256;
{
  const g = crackCv.getContext('2d'); g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  let seed = 11; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 7; c++) {
    const cx = 80 + c * 140 + R() * 60, cy = 128;
    for (let k = 0; k < 7; k++) {
      let x = cx, y = cy, a = R() * Math.PI * 2; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * (14 + R() * 18); y += Math.sin(a) * (10 + R() * 12); g.lineTo(x, y); }
      g.stroke();
    }
  }
}
const crackTex = new THREE.CanvasTexture(crackCv);
const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.6, 1.9, 2.2) });
const crack = new THREE.Mesh(new THREE.PlaneGeometry(GL, 2.0), crackMat); crack.rotation.x = -Math.PI / 2; crack.position.y = 0.025; glass.add(crack);
const fogMat = new THREE.MeshBasicMaterial({ color: 0xa8b0bc, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const fogPane = new THREE.Mesh(new THREE.PlaneGeometry(GL, 2.0), fogMat); fogPane.rotation.x = -Math.PI / 2; fogPane.position.y = -0.025; glass.add(fogPane);
const floorGlass = new THREE.Mesh(new THREE.BoxGeometry(GL, 0.03, 2.0), new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.07, depthWrite: false, metalness: 0.1, roughness: 0.05 }));
scene.add(floorGlass);

// chispas al chocar con el cristal
const NSP = 260;
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NSP * 3), 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NSP * 3), 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
sparks.frustumCulled = false; scene.add(sparks);
function updateSparks(t, on) {
  const p = sparkGeo.attributes.position.array, c = sparkGeo.attributes.color.array; const per = NSP / 4;
  const travel = (XL - XS) / V; // la cabeza de un golpe llega al cristal este tiempo después de sonar
  const nNow = Math.floor((t - travel) / B);
  for (let h = 0; h < 4; h++) {
    const n = nNow - h, th = n * B + travel, age = t - th;
    for (let j = 0; j < per; j++) {
      const i = h * per + j, k = i * 3;
      const r1 = hash(n, j), r2 = hash(j, n + 7), r3 = hash(n + j, 3.3);
      const x0 = XL + 0.15 + r1 * 1.4, vx = (r2 - 0.3) * 2.2, vy = 0.6 + r3 * 2.0, vz = (r1 - 0.5) * 2.4;
      const life = 0.55 + r3 * 0.4, alive = age >= 0 && age < life && on > 0;
      p[k] = x0 + vx * age; p[k + 1] = yOf(CEIL) - 0.02 - vy * age * 0.25 - 4.5 * age * age * 0.2 + (r2 - 0.5) * 0.02; p[k + 2] = vz * age;
      const f = alive ? (1 - age / life) * on : 0; const ice = r2 > 0.6;
      c[k] = (ice ? 0.8 : 0.3) * f * 2; c[k + 1] = (ice ? 0.95 : 0.9) * f * 2; c[k + 2] = 1.0 * f * 2;
    }
  }
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
}
const lastHit = t => { const travel = (XL - XS) / V; const n = Math.floor((t - travel) / B); return t - (n * B + travel); };

// bloques del ratio (4 → 1)
const ratioG = new THREE.Group(); scene.add(ratioG);
const blkMats = [];
const blocks = [0, 1, 2, 3].map(i => { const m = new THREE.MeshBasicMaterial({ color: HX.cian.clone().multiplyScalar(1.6), transparent: true, toneMapped: false }); blkMats.push(m); const b = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.2, 0.42, 2, 0.03), m); ratioG.add(b); return b; });

// ---------------------------------------------------------------- estudio (cierre, igual que el video #1)
const SX = 9.0; // el estudio está al final del túnel
const studio = new THREE.Group(); studio.position.x = SX; scene.add(studio);
const knobMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.9, roughness: 0.25 });
const deskMat = new THREE.MeshStandardMaterial({ color: 0x121319, metalness: 0.6, roughness: 0.4 });
const desk = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.5, 1.8, 3, 0.06), deskMat); desk.position.set(0, 0.75, 3.4); desk.rotation.x = 0.16; studio.add(desk);
const faders = [];
for (let i = 0; i < 16; i++) {
  const x = -2.2 + i * 0.29;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.8), new THREE.MeshBasicMaterial({ color: 0x050507 })); slot.position.set(x, 0.26, 0.1); desk.add(slot);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0xd8dae4, metalness: 0.3, roughness: 0.4 })); cap.position.set(x, 0.29, 0.1); desk.add(cap); faders.push(cap);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.04), new THREE.MeshBasicMaterial({ color: (i % 4 === 0 ? HX.magenta : HX.cian).clone().multiplyScalar(2), toneMapped: false })); led.position.set(x, 0.26, -0.6); desk.add(led);
}
const spkMat = new THREE.MeshStandardMaterial({ color: 0x101116, metalness: 0.4, roughness: 0.6 });
const coneMat = new THREE.MeshStandardMaterial({ color: 0x1c1d24, metalness: 0.6, roughness: 0.35 });
const ringMat = new THREE.MeshBasicMaterial({ color: HX.violeta.clone().multiplyScalar(1.8), toneMapped: false });
const cones = [];
function speaker(parent, x, y, z, s = 1, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); parent.add(g);
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.5, 0.9, 2, 0.06), spkMat));
  for (const [cy, r] of [[0.32, 0.36], [-0.38, 0.22]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.5, 0.12, 32), coneMat); cone.rotation.x = Math.PI / 2; cone.position.set(0, cy, 0.47); g.add(cone); cones.push(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, 0.018, 8, 40), ringMat); ring.position.set(0, cy, 0.5); g.add(ring);
  }
  return g;
}
speaker(studio, -2.75, 1.55, 2.6, 0.8, 0.35); speaker(studio, 2.75, 1.55, 2.6, 0.8, -0.35);
const signCv = document.createElement('canvas'); signCv.width = 1400; signCv.height = 560;
{
  const g = signCv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = C.magenta; g.shadowBlur = 40; g.fillStyle = '#ffffff'; g.font = HEAD(330); g.fillText('MEF', 700, 230);
  g.shadowColor = C.cian; g.shadowBlur = 26; g.font = SANS(92); g.fillStyle = '#e8fbff';
  const word = 'ESTUDIO'; let x = 700 - (word.length - 1) * 95 / 2; for (const ch of word) { g.fillText(ch, x, 470); x += 95; }
}
const signTex = new THREE.CanvasTexture(signCv); signTex.colorSpace = THREE.SRGBColorSpace;
const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, depthWrite: false, fog: false });
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.68), signMat); sign.position.set(0, 3.75, -2.6); studio.add(sign);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.9 })); wall.position.set(0, 3.5, -3.2); studio.add(wall);
for (const s of [-1, 1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 6, 0.05), new THREE.MeshBasicMaterial({ color: HX.violeta.clone().multiplyScalar(2), toneMapped: false })); strip.position.set(s * 4.2, 3, -3.1); studio.add(strip); }

// ---------------------------------------------------------------- cámara por escena
function camLook(p, l, fov = 40) { camera.position.copy(p); camera.lookAt(l); camera.fov = fov; camera.updateProjectionMatrix(); }
const GY = yOf(CEIL);
const SHOTS = {
  hook: lt => { const k = easeOutCubic(lt / 2.2); return { p: V3(lerp(XL - 5.5, XL + 1.6, k), lerp(2.0, 1.25, k), lerp(3.6, 3.9, k)), l: V3(lerp(XL - 1, XL + 3.0, k), lerp(1.9, GY, k), 0), fov: lerp(56, 48, k) }; },
  promesa: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(-11, -9.5, k), lerp(3.4, 3.0, k), lerp(5.5, 4.6, k)), l: V3(lerp(2, 3, k), 2.0, 0), fov: 46 }; },
  cruda: (lt, d) => { const k = lt / d; return { p: V3(lerp(-8.4, -7.6, k), 1.9, lerp(4.6, 4.3, k)), l: V3(-6.6, 2.0, 0), fov: 46 }; },
  threshold: (lt, d) => { const k = lt / d; return { p: V3(lerp(XC + 0.2, XC + 0.9, k), 2.3, lerp(4.9, 4.5, k)), l: V3(XC + 1.0, 2.1, 0), fov: 46 }; },
  ratio: (lt, d) => { const k = lt / d; return { p: V3(lerp(XC + 1.3, XC + 1.7, k), 2.5, lerp(4.3, 4.0, k)), l: V3(XC + 1.5, 2.35, 0), fov: 46 }; },
  limiter: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(XL + 0.6, XL + 2.6, k), lerp(1.2, 1.0, k), lerp(4.4, 3.9, k)), l: V3(XL + 2.2, 2.45, 0), fov: 48 }; },
  revelacion: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(XL - 0.5, XL - 1.5, k), lerp(2.6, 3.0, k), lerp(6.4, 7.6, k)), l: V3(XL + 0.5, 2.0, 0), fov: 48 }; },
  error: (lt, d) => { const k = lt / d; return { p: V3(lerp(XL + 1.6, XL + 2.3, k), 2.2, lerp(4.6, 4.1, k)), l: V3(XL + 2.2, 2.15, 0), fov: 46 }; },
  tip: (lt, d) => { const k = lt / d; return { p: V3(lerp(XL + 2.3, XL + 2.6, k), 2.3, lerp(4.4, 4.9, k)), l: V3(XL + 2.3, 2.2, 0), fov: 46 }; },
  marca: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(SX - 1.2, SX + 0.6, k), lerp(2.3, 2.6, k), lerp(5.5, 9.4, k)), l: V3(SX, lerp(1.8, 2.1, k), 0), fov: 46 }; },
  cta: (lt, d) => { const k = lt / d; return { p: V3(SX + 3.2 * Math.sin(-0.4 + k * 0.8), 2.8, 9.2 * Math.cos(-0.4 + k * 0.8)), l: V3(SX, 2.2, 0), fov: 46 }; },
};
const WHIP = 0.45;
function shotAt(id, t) {
  const i = ORDER.indexOf(id), lt = LT(id, t), d = DURS(id);
  const s = SHOTS[id](lt, d);
  if (i > 0 && lt < WHIP) {
    const prev = ORDER[i - 1], sp = SHOTS[prev](DURS(prev), DURS(prev)), k = easeInOut(lt / WHIP);
    return { p: sp.p.clone().lerp(s.p, k), l: sp.l.clone().lerp(s.l, k), fov: lerp(sp.fov, s.fov, k) };
  }
  return s;
}

// ---------------------------------------------------------------- procesado por escena
const P0 = { comp: 0, thr: 1, ratio: 1, mk: 1, lim: 0, boost: 1, raw: 1.0, dull: 0, tint: 1, iceTint: 1, vis: 1 };
const GOOD = { comp: 1, thr: 0.5, ratio: 4, mk: 1.25, lim: 1, boost: 1.15, raw: 1.0 };
const P = (o) => Object.assign({}, P0, o);
function procAt(t) {
  const id = sceneAt(t), lt = LT(id, t);
  switch (id) {
    case 'hook': return P({ comp: 0, lim: 1, boost: 1.25, raw: 1.05 });
    case 'promesa': return P(GOOD);
    case 'cruda': return P({ comp: 0, lim: 0, raw: 1.05 });
    case 'threshold': { const k = ss(wt('threshold', 'cruza') - 0.2, wt('threshold', 'cruza') + 0.3, t); return P({ comp: 1, thr: 0.5, ratio: 1, mk: 1, lim: 0, raw: 1.05, tint: 0.35 + 0.65 * k }); }
    case 'ratio': { const k = ss(wt('ratio', 'cuatro') - 0.1, wt('ratio', 'cuatro') + 0.5, t); return P({ comp: 1, thr: 0.5, ratio: lerp(1, 4, k), mk: 1, lim: 0, raw: 1.05 }); }
    case 'limiter': { const k = ss(RANGES.limiter[0], RANGES.limiter[0] + 0.8, t); return P({ comp: 1, thr: 0.5, ratio: 4, mk: lerp(1, 1.25, k), lim: 1, boost: lerp(1, 1.3, k), raw: 1.05 }); }
    case 'revelacion': { const k = ss(wt('revelacion', 'subir') - 0.1, wt('revelacion', 'subir') + 0.8, t); return P({ ...GOOD, boost: lerp(1.0, 1.3, k), mk: lerp(1.0, 1.25, k) }); }
    case 'error': { const k = ss(wt('error', 'aprietas') - 0.2, wt('error', 'aprietas') + 0.5, t); return P({ ...GOOD, boost: lerp(1.3, 4.5, k), dull: ss(wt('error', 'empana') - 0.2, wt('error', 'empana') + 0.6, t), iceTint: 1 - k }); }
    case 'tip': { const k = ss(RANGES.tip[0] + 0.2, RANGES.tip[0] + 1.2, t); return P({ ...GOOD, boost: lerp(4.5, 1.3, k), dull: 1 - k, iceTint: k }); }
    default: return P({ ...GOOD, boost: 1.3 });
  }
}

// ---------------------------------------------------------------- capa 2D
const out = document.getElementById('out'); const ctx = out.getContext('2d');
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const parseMarks = text => { const res = []; let on = false; for (const part of text.split(/(\*)/)) { if (part === '*') { on = !on; continue; } if (part) res.push({ s: part, m: on }); } return res; };
function richWidth(parts, font) { ctx.font = font; return parts.reduce((a, p) => a + ctx.measureText(p.s).width, 0); }
function drawRich(text, x, y, font, { color = '#fff', mark = C.cian } = {}) {
  const parts = parseMarks(text); const w = richWidth(parts, font); let cx = x - w / 2;
  ctx.font = font; ctx.textAlign = 'left';
  for (const p of parts) { ctx.fillStyle = p.m ? mark : color; ctx.fillText(p.s, cx, y); cx += ctx.measureText(p.s).width; }
  return w;
}
function project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; }
function chip(x, y, text, k, { bg = 'rgba(8,10,18,0.84)', border = C.cian, fg = '#fff', font = SANS(40), padX = 26, h = 64 } = {}) {
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const w = richWidth(parseMarks(text), font) + padX * 2;
  rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = border; ctx.stroke();
  ctx.textBaseline = 'middle'; drawRich(text, 0, 2, font, { color: fg }); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
const CHUNKS = {};
for (const s of TL.segments) {
  const ws = SUBW[s.id]; const ch = []; let cur = [];
  ws.forEach((w, i) => { cur.push(w); const end = /[,.;:?!]\**$/.test(w.w); if (cur.length >= 5 || (end && cur.length >= 2) || i === ws.length - 1) { ch.push(cur); cur = []; } });
  CHUNKS[s.id] = ch;
}
function drawSubs(t) {
  for (const s of TL.segments) {
    if (t < s.start - 0.05 || t > s.end + 0.25) continue;
    const ch = CHUNKS[s.id].find((c, i, arr) => t < (arr[i + 1] ? arr[i + 1][0].s : s.end + 0.25)) || CHUNKS[s.id].at(-1);
    ctx.font = SANS(58);
    const lines = [[]]; let lw = 0;
    for (const w of ch) { const ww = ctx.measureText(w.w.replace(/\*/g, '') + ' ').width; if (lw + ww > 900 && lines.at(-1).length) { lines.push([]); lw = 0; } lines.at(-1).push(w); lw += ww; }
    const baseY = 1440 - (lines.length - 1) * 38;
    const k = easeOutBack((t - ch[0].s + 0.05) / 0.22);
    ctx.save(); ctx.translate(W / 2, baseY); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    lines.forEach((ln, li) => {
      const txt = ln.map(w => w.w.replace(/\*/g, '')).join(' ');
      let x = -ctx.measureText(txt).width / 2; const y = li * 76; let inMark = false;
      for (const w of ln) {
        const raw = w.w; const m = raw.includes('*') || inMark; if (raw.split('*').length % 2 === 0) inMark = !inMark;
        const clean = raw.replace(/\*/g, ''); const active = t >= w.s && t < w.e + 0.05;
        ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.textAlign = 'left'; ctx.strokeText(clean, x, y);
        ctx.fillStyle = m ? C.cian : (active ? C.amarillo : 'rgba(255,255,255,0.88)');
        ctx.fillText(clean, x, y); x += ctx.measureText(clean + ' ').width;
      }
    });
    ctx.restore();
  }
}
function headline(text, y, k, size = 104, maxW = 960) {
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(W / 2, y); ctx.scale(k, k);
  let font = HEAD(size); while (richWidth(parseMarks(text), font) > maxW && size > 40) font = HEAD(size -= 4);
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 24; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.font = font; ctx.textAlign = 'center'; ctx.strokeText(text.replace(/\*/g, ''), 0, 0); ctx.shadowBlur = 0;
  drawRich(text, 0, 0, font);
  ctx.restore();
}
function meter(x, y, w, h, v, label, col, k = 1) {
  if (k <= 0.01) return;
  ctx.save(); ctx.globalAlpha = k;
  rrect(x, y, w, h, 14); ctx.fillStyle = 'rgba(8,10,18,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
  const n = 16;
  for (let i = 0; i < n; i++) { const on = i / n < v; ctx.fillStyle = on ? (i > n * 0.82 ? C.rojo : col) : 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 12, y + h - 14 - (i + 1) * (h - 28) / n + 3, w - 24, (h - 28) / n - 6); }
  ctx.fillStyle = '#fff'; ctx.font = SANS(30); ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h + 40);
  ctx.restore();
}
// gráfica entrada/salida (curva de transferencia)
function transferGraph(x, y, s, thr, ratio, k, ceil = null) {
  if (k <= 0.01) return;
  ctx.save(); ctx.globalAlpha = clamp(k); ctx.translate(x, y); ctx.scale(k, k);
  rrect(-s / 2 - 20, -s / 2 - 20, s + 40, s + 90, 22); ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fill(); ctx.strokeStyle = 'rgba(34,230,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  const X = v => -s / 2 + v * s, Y = v => s / 2 - v * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(X(i / 4), Y(0)); ctx.lineTo(X(i / 4), Y(1)); ctx.moveTo(X(0), Y(i / 4)); ctx.lineTo(X(1), Y(i / 4)); ctx.stroke(); }
  ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = C.cian; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(0), Y(thr)); ctx.lineTo(X(1), Y(thr)); ctx.globalAlpha = 0.5 * clamp(k); ctx.stroke(); ctx.globalAlpha = clamp(k);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const vi = i / 60; let vo = vi > thr ? thr + (vi - thr) / ratio : vi; if (ceil !== null) vo = Math.min(vo, ceil); i ? ctx.lineTo(X(vi), Y(vo)) : ctx.moveTo(X(vi), Y(vo)); }
  ctx.stroke();
  ctx.fillStyle = C.gris; ctx.font = SANS(26); ctx.textAlign = 'center'; ctx.fillText('ENTRADA →', 0, s / 2 + 44); ctx.save(); ctx.rotate(-Math.PI / 2); ctx.fillText('SALIDA →', 0, -s / 2 - 0); ctx.restore();
  ctx.restore();
}
function ratioBlocks(x, y, t) {
  const kIn = pop(wt('ratio', 'pasa') - 0.2, t, 0.5), kOut = ss(wt('ratio', 'sale') - 0.1, wt('ratio', 'sale') + 0.5, t);
  if (kIn <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(kIn, kIn);
  const s = 270; rrect(-s / 2 - 20, -s / 2 - 20, s + 40, s + 90, 22); ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fill(); ctx.strokeStyle = 'rgba(34,230,255,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  const ly = 95; ctx.fillStyle = C.cian; ctx.fillRect(-s / 2, ly, s, 5);
  ctx.fillStyle = C.gris; ctx.font = SANS(24); ctx.textAlign = 'center'; ctx.fillText('THRESHOLD', 0, ly + 40);
  for (let i = 0; i < 4; i++) {
    const a = i === 0 ? 1 : 1 - kOut; if (a <= 0.01) continue;
    const yy = ly - 8 - (i + 1) * 44 * (i === 0 ? 1 : 1 - 0.6 * kOut);
    ctx.globalAlpha = a; rrect(-70, yy, 140, 38, 8); ctx.fillStyle = kOut > 0.5 && i === 0 ? C.cian : C.rojo; ctx.fill();
    ctx.fillStyle = '#0a0b10'; ctx.font = SANS(28); ctx.fillText('+1 dB', 0, yy + 29);
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = HEAD(44); ctx.fillText(kOut > 0.5 ? 'SALE: +1 dB' : 'ENTRA: +4 dB', 0, -s / 2 + 22);
  ctx.restore();
}
function drawRetention(t) {
  const a = wt('promesa', 'error') - 0.1, b = SEG.error.start;
  if (t < a || t > b + 1.4) return;
  const k = t < b ? easeOutBack((t - a) / 0.4) : 1 - ss(b + 1.0, b + 1.4, t);
  const prog = clamp((t - a) / (b - a));
  ctx.save(); ctx.translate(W / 2, 250); ctx.scale(k, k); ctx.globalAlpha = clamp(k);
  const w = 660, h = 78; rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fill(); ctx.strokeStyle = C.rojo; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); rrect(-w / 2, -h / 2, w, h, h / 2); ctx.clip(); ctx.fillStyle = 'rgba(255,46,77,0.22)'; ctx.fillRect(-w / 2, -h / 2, w * prog, h); ctx.restore();
  ctx.textBaseline = 'middle'; drawRich(t < b ? 'El *error* más común → al final' : '*Aquí está el error*', 0, 3, SANS(38), { mark: '#FF6B83' }); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
function bookmark(x, y, s, fill, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-60, -80); ctx.lineTo(60, -80); ctx.lineTo(60, 85); ctx.lineTo(0, 40); ctx.lineTo(-60, 85); ctx.closePath();
  ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.stroke();
  if (fill > 0) { ctx.save(); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(-70, 90 - 180 * fill, 140, 180 * fill); ctx.restore(); }
  ctx.restore();
}
function wordmark(x, y, s, a = 1) { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s); ctx.drawImage(signCv, -signCv.width / 2, -signCv.height / 2); ctx.restore(); }
function loud(t, P, x) { let s = 0; const N = 40; for (let i = 0; i < N; i++) { const tau = tauAt(x, t) - i * B * 2 / N; const a = ampAt(x, tau, P).amp; s += a * a; } return Math.sqrt(s / N); }

function overlay(t, id, lt) {
  const at = (seg, w, n) => wt(seg, w, n);
  if (id === 'hook') {
    headline('EL *TECHO*', 420, easeOutBack((lt - 0.05) / 0.35), 150);
    headline('DE *CRISTAL*', 570, easeOutBack((lt - 0.45) / 0.35), 150);
    const flash = Math.exp(-lastHit(t) / 0.05) * 0.06; if (flash > 0.01) { ctx.fillStyle = `rgba(220,245,255,${flash})`; ctx.fillRect(0, 0, W, H); }
  }
  if (id === 'promesa') {
    const pc = project(V3(XC, 4.25, 0)), pl = project(V3(XL, 4.25, 0));
    chip(clamp(pc.x, 170, W - 170), pc.y - 70, '1 · COMPRESOR', pop(at('promesa', 'compresor') - 0.1, t), { font: SANS(36), h: 58 });
    chip(clamp(pl.x, 170, W - 170), pl.y - 70, '2 · LIMITER', pop(at('promesa', 'limiter') - 0.1, t), { border: C.hielo, font: SANS(36), h: 58 });
  }
  if (id === 'cruda') {
    headline('*ENTRADA*', 420, easeOutBack((lt - 0.1) / 0.35), 120);
    chip(W / 2, 540, 'picos sin control', pop(at('cruda', 'picos') - 0.1, t), { border: C.rojo });
  }
  if (id === 'threshold') {
    headline('*THRESHOLD*', 420, easeOutBack((lt - 0.1) / 0.35), 120);
    const pt = project(V3(XC + 0.4, yOf(0.5), 0.6));
    chip(clamp(pt.x + 60, 200, W - 200), pt.y - 46, 'THRESHOLD', pop(at('threshold', 'linea') - 0.1, t), { font: SANS(34), h: 56 });
    chip(W / 2, 545, 'abajo: *intacto*  ·  arriba: *se comprime*', pop(at('threshold', 'cruza') - 0.1, t), { font: SANS(34), h: 60 });
  }
  if (id === 'ratio') {
    headline('RATIO *4:1*', 420, easeOutBack((lt - 0.1) / 0.35), 120);
    const r = procAt(t).ratio;
    transferGraph(W - 230, 790, 270, 0.5, r, pop(at('ratio', 'cuatro') - 0.2, t, 0.5));
    chip(W / 2, 545, '+4 dB *→* +1 dB', pop(at('ratio', 'sale') - 0.15, t), { font: SANS(44), h: 72 });
    ratioBlocks(230, 790, t);
  }
  if (id === 'limiter') {
    headline('*LIMITER*', 420, easeOutBack((lt - 0.1) / 0.35), 120);
    chip(W / 2, 545, 'techo *−1 dBTP*', pop(at('limiter', 'techo') - 0.1, t), { border: C.hielo, font: SANS(42), h: 70 });
    chip(W / 2, 640, 'ratio *∞:1*', pop(at('limiter', 'infinito') - 0.25, t), { border: C.hielo, font: SANS(42), h: 70 });
  }
  if (id === 'revelacion') {
    headline('COMPRESOR *CONTROLA*', 400, easeOutBack((t - at('revelacion', 'compresor')) / 0.3), 84);
    headline('LIMITER *PROTEGE*', 505, easeOutBack((t - at('revelacion', 'protege') + 0.3) / 0.3), 84);
    const kk = ss(at('revelacion', 'subir') - 0.1, at('revelacion', 'subir') + 0.4, t);
    const lA = loud(t, P({ raw: 1.0 }), 0), lB = loud(t, procAt(t), XL + 3);
    meter(70, 640, 120, 420, clamp((lA - 0.2) / 0.65), 'ANTES', C.violeta, kk);
    meter(W - 190, 640, 120, 420, clamp((lB - 0.2) / 0.65), 'DESPUÉS', C.cian, kk);
  }
  if (id === 'error') {
    headline('EL *ERROR*', 420, easeOutBack((lt - 0.05) / 0.3), 130);
    chip(W / 2, 560, 'todo el trabajo al *limiter*', pop(at('error', 'dejarle') - 0.1, t), { border: C.rojo, font: SANS(40) });
    chip(W / 2, 660, 'kick *sin golpe*', pop(at('error', 'golpe') - 0.15, t), { border: C.rojo, font: SANS(40) });
  }
  if (id === 'tip') {
    headline('LIMITER: *1–3 dB*', 420, easeOutBack((lt - 0.05) / 0.35), 110);
    chip(W / 2, 545, 'de reducción, *máximo*', pop(at('tip', 'maximo') - 0.2, t), { font: SANS(42), h: 70 });
  }
  if (id === 'marca') {
    const t0 = at('marca', 'mef');
    chip(W / 2, 830, '*MEZCLA* & *MÁSTER*', pop(at('marca', 'mezcla') - 0.05, t), { border: C.magenta, font: SANS(50), h: 82 });
    if (t > t0) wordmark(W - 120, 140, 0.13, 0.85 * ss(t0, t0 + 0.6, t));
  }
  if (id === 'cta') {
    const tG = at('cta', 'guarda'), tS = at('cta', 'siguenos'), tEnd = SEG.cta.end + 0.15;
    const kb = pop(tG - 0.05, t, 0.5);
    if (kb > 0) {
      ctx.save(); ctx.translate(W / 2, 640); ctx.scale(kb * (1 + 0.06 * kickEnv(t)), kb * (1 + 0.06 * kickEnv(t)));
      bookmark(0, 0, 1.25, ss(tG + 0.4, tG + 1.0, t), C.cian); ctx.restore();
      headline('*GUÁRDALO*', 860, kb, 96);
    }
    const kf = pop(tS - 0.05, t);
    if (kf > 0) {
      ctx.save(); ctx.translate(W / 2, 1010); ctx.scale(kf, kf);
      const w = 520, h = 100; rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = C.magenta; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = SANS(50); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+ SEGUIR', 0, 3);
      ctx.restore(); ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff'; ctx.font = SANS(54); ctx.textAlign = 'center'; ctx.fillText(HANDLE, W / 2, 1140);
    }
    wordmark(W - 120, 140, 0.13, 0.85);
    if (t > tEnd) {
      const k = ss(tEnd, tEnd + 0.5, t);
      ctx.fillStyle = `rgba(5,5,9,${0.96 * k})`; ctx.fillRect(0, 0, W, H);
      wordmark(W / 2, 820, 0.62 * (0.9 + 0.1 * easeOutBack((t - tEnd) / 0.5)) * (1 + 0.025 * kickEnv(t)), k);
      ctx.globalAlpha = k; ctx.fillStyle = '#fff'; ctx.font = SANS(56); ctx.textAlign = 'center'; ctx.fillText(HANDLE, W / 2, 1110);
      ctx.fillStyle = C.gris; ctx.font = SANS(40, 500); ctx.fillText('Mix & Master para techno', W / 2, 1180); ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- render
window.renderAt = function (t) {
  const id = sceneAt(t), lt = LT(id, t);
  const Pp = procAt(t);
  const inStudio = id === 'marca' || id === 'cta';
  updateWave(t, Pp);
  const camP = shotAt(id, t).p;
  // túnel: persecución de luz a tempo
  frames.forEach(f => {
    const d = ((f.position.x - XS) / V) % B; const e = Math.exp(-((((t - d) % B) + B) % B) / 0.12);
    f.userData.m.color.copy(f.userData.base).multiplyScalar(0.45 + 0.9 * e);
    f.visible = (!inStudio || f.position.x < SX - 3.5) && Math.hypot(f.position.x - camP.x, Math.max(0, Math.abs(camP.z) - 1.8)) > 1.3;
  });
  // estaciones
  const compOn = Pp.comp;
  compGate.userData.m.color.copy(HX.cian).multiplyScalar(0.4 + 1.0 * (compOn > 0 || id === 'promesa' ? 1 : 0.3));
  compGate.visible = compSign.visible = !inStudio && Math.abs(XC - camP.x) > 1.0;
  limGate.visible = limSign.visible = !inStudio && Math.abs(XL - camP.x) > 1.0;
  limGate.userData.m.color.copy(HX.hielo).multiplyScalar(id === "hook" ? 0.25 : 0.35 + 0.6 * (Pp.lim > 0 ? 1 : 0.3));
  // threshold
  const thrK = id === 'threshold' ? ss(wt('threshold', 'tre') - 0.3, wt('threshold', 'linea'), t) : (['ratio', 'limiter', 'revelacion', 'promesa', 'error', 'tip'].includes(id) ? 1 : 0);
  thrGroup.visible = thrK > 0.01;
  const tw = (XL - XC) * thrK; thrGroup.position.set(XC + tw / 2, 0, 0);
  thrTop.scale.x = thrBot.scale.x = thrSheet.scale.x = Math.max(0.001, tw);
  thrTop.position.y = yOf(0.5); thrBot.position.y = yOf(-0.5); thrSheet.position.y = yOf(0.5);
  thrMat.color.copy(HX.cian).multiplyScalar(2.0 + 1.2 * kickEnv(t - (XC - XS) / V));
  // ratio: 4 bloques → 1
  ratioG.visible = false;
  if (ratioG.visible) {
    const kIn = ss(wt('ratio', 'pasa') - 0.2, wt('ratio', 'pasa') + 0.3, t), kOut = ss(wt('ratio', 'sale') - 0.1, wt('ratio', 'sale') + 0.5, t);
    ratioG.position.set(XC + 1.55, yOf(0.5), 1.25);
    blocks.forEach((b, i) => {
      const y0 = 0.13 + i * 0.22, y1 = 0.13;
      b.position.set(0, lerp(y0, y1, easeInOut(kOut)), 0);
      b.scale.setScalar(Math.max(0.001, pop(wt('ratio', 'pasa') - 0.2 + i * 0.12, t)));
      blkMats[i].opacity = i === 0 ? kIn : kIn * (1 - kOut);
      blkMats[i].color.copy(i === 0 && kOut > 0.5 ? HX.cian : HX.rojo).multiplyScalar(1.7);
    });
  }
  // cristal
  const glassOn = !['cruda', 'threshold', 'ratio'].includes(id) || false;
  glass.visible = floorGlass.visible = glassOn && id !== 'promesa' ? true : id === 'promesa';
  glass.position.set(XL + GL / 2 - 0.1, yOf(CEIL) + 0.025, 0); floorGlass.position.set(XL + GL / 2 - 0.1, yOf(-CEIL) - 0.02, 0);
  const hit = Math.exp(-lastHit(t) / 0.08);
  const errK = id === 'error' ? ss(wt('error', 'empana') - 0.3, wt('error', 'empana') + 0.6, t) : (id === 'tip' ? 1 - ss(RANGES.tip[0] + 0.2, RANGES.tip[0] + 1.2, t) : 0);
  glassMat.opacity = 0.1 + 0.08 * hit + 0.25 * errK; glassMat.emissiveIntensity = 0.02 + 0.2 * hit * (1 - errK);
  fogMat.opacity = 0.55 * errK;
  const crackK = id === 'hook' ? hit * 0.9 : (id === 'limiter' ? hit * 0.5 : 0) + 0.8 * errK;
  crackMat.opacity = crackK;
  edgeGlassMat.color.copy(errK > 0.3 ? HX.rojo : HX.hielo).multiplyScalar(1.2 + 1.0 * hit);
  updateSparks(t, ['hook', 'limiter', 'revelacion'].includes(id) ? 1 : (id === 'tip' ? 0.5 : 0));
  // estudio
  studio.visible = inStudio;
  if (inStudio) {
    faders.forEach((f, i) => { f.position.z = 0.1 + 0.17 * Math.sin(i * 1.7 + t * 0.6); });
    cones.forEach(m => { m.position.z = 0.47 + 0.04 * kickEnv(t); });
    const tM = wt('marca', 'mef');
    const on = id === 'cta' ? 0.38 * (1 - ss(0, 0.5, lt)) : (t < tM - 0.05 ? 0 : (t < tM + 0.35 ? (Math.sin((t - tM) * 70) > 0 ? 0.38 : 0.08) : 0.38));
    sign.visible = on > 0; signMat.color.setScalar(on * (1 + 0.15 * kickEnv(t)));
  }
  cyanL.intensity = 15 + 20 * kickEnv(t); iceL.intensity = 15 + 25 * hit;
  bloom.strength = 0.8 + 0.2 * kickEnv(t);
  // cámara
  const s = shotAt(id, t);
  const bob = 0.02 * kickEnv(t);
  const sh = id === 'hook' ? 0.05 * hit : (id === 'error' ? 0.02 * hit : 0);
  camLook(V3(s.p.x + sh * Math.sin(t * 90), s.p.y + bob + sh * Math.cos(t * 77), s.p.z), s.l, s.fov);
  composer.render();
  ctx.drawImage(glCanvas, 0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  overlay(t, id, lt);
  drawRetention(t);
  drawSubs(t);
};
window.frameJpeg = function (t, q = 0.92) { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = TL.duration;
window.READY = true;
