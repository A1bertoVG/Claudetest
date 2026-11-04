// MEF Estudio — "¿Cómo es que bajar el volumen te puede hacer sonar más duro?"
// Video 3D vertical (1080×1920) sobre el compresor para productores de techno.
// Todo el estado visual es función pura del tiempo t (segundos): render determinista y en paralelo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1080, H = 1920;
const C = { bg: '#050509', rojo: '#FF2E4D', cian: '#22E6FF', violeta: '#7B3CFF', magenta: '#FF3CC7', blanco: '#FFFFFF', gris: '#9AA0B4', carton: '#9C7A52' };
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

// tiempos por palabra (proporcional a caracteres; los números cuentan como palabras habladas largas)
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

// ---------------------------------------------------------------- ritmo (130 BPM)
const BPM = 130, B = 60 / BPM;
const kickEnv = t => { const ph = ((t % B) + B) % B; return Math.exp(-ph / 0.09); };
function level(tau) {
  tau += 400 * B;
  const n = Math.floor(tau / B), ph = tau - n * B;
  const kick = Math.exp(-ph / 0.055);
  const clap = (n % 2 === 1) ? 0.97 * Math.exp(-Math.max(0, ph - 0.03) / 0.07) * ss(0.0, 0.03, ph) : 0;
  const ph2 = (tau + B / 2) % B; const bass = 0.4 * Math.exp(-ph2 / 0.11) * ss(0, 0.015, ph2);
  const ph16 = tau % (B / 4); const hat = 0.13 * Math.exp(-ph16 / 0.025);
  const body = 0.13 + 0.04 * Math.sin(tau * 5.3) + 0.03 * Math.sin(tau * 17.1);
  return 1 - (1 - kick) * (1 - clap) * (1 - bass) * (1 - hat) * (1 - body);
}
const DRY = { thr: 1, ratio: 1, mk: 0 }, COMP = { thr: 0.55, ratio: 4, mk: 0.3 }, HALF = { thr: 0.55, ratio: 4, mk: 0 },
  BRICK = { thr: 0.24, ratio: 20, mk: 0.74 }, BAL = { thr: 0.58, ratio: 3.2, mk: 0.25 };
const mixC = (a, b, k) => ({ thr: lerp(a.thr, b.thr, k), ratio: lerp(a.ratio, b.ratio, k), mk: lerp(a.mk, b.mk, k) });
const compress = (L, c) => Math.min(1, (L > c.thr ? c.thr + (L - c.thr) / c.ratio : L) + c.mk);

// ---------------------------------------------------------------- renderer
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.FogExp2(0x050509, 0.05);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 120);
scene.add(camera);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.9, 0.55, 0.42);
composer.addPass(bloom); composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x6a5cff, 0x080810, 0.7));
const keyL = new THREE.DirectionalLight(0xffffff, 1.4); keyL.position.set(3, 6, 6); scene.add(keyL);
const cyanL = new THREE.PointLight(0x22e6ff, 30, 14, 2); cyanL.position.set(-3, 3, 3); scene.add(cyanL);
const redL = new THREE.PointLight(0xff2e4d, 30, 14, 2); redL.position.set(3.5, 2.5, -1); scene.add(redL);

// suelo con rejilla
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.35, metalness: 0.7 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.GridHelper(60, 120, 0x3a2290, 0x1a1240); grid.position.y = 0.002; scene.add(grid);

// ---------------------------------------------------------------- paisaje de audio (onda 3D)
const COLS = 52, ROWS = 11, DX = 0.088, DZ = 0.2, HMAX = 2.0, DT = B / 7;
const barGeo = new THREE.BoxGeometry(DX * 0.78, 1, DZ * 0.7); barGeo.translate(0, 0.5, 0);
const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true });
barMat.onBeforeCompile = s => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.08, 1.0, pow(vH, 2.2));');
};
const bars = new THREE.InstancedMesh(barGeo, barMat, COLS * ROWS);
bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COLS * ROWS * 3), 3);
const land = new THREE.Group(); land.add(bars); scene.add(land);
const X0 = -(COLS - 1) * DX / 2, Z0 = -(ROWS - 1) * DZ / 2;
const colX = c => X0 + c * DX;
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), cLow = new THREE.Color(0x3b1cff), cMid = new THREE.Color(0xc02cff), cHi = new THREE.Color(0xff2e4d), cHot = new THREE.Color(0xffd0d8);
const cCy = new THREE.Color(0x22e6ff), cCart = new THREE.Color(0x6e5236);
function updateLand(t, comp, { clipGlow = 0, carton = 0, dim = 1, compTint = 1 } = {}) {
  let k = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, k++) {
    const tau = t - (COLS - 1 - c) * DT - r * 0.006;
    const L = level(tau) * (0.93 + 0.07 * hash(r, Math.floor((tau + 400) / B)));
    const y = compress(L, comp);
    const rs = 1 - r * 0.05;
    const h = Math.max(0.015, y * HMAX * rs);
    tmpM.makeScale(1, h, 1); tmpM.setPosition(colX(c), 0, Z0 + r * DZ);
    bars.setMatrixAt(k, tmpM);
    // color por nivel: violeta → magenta → rojo; los picos comprimidos se tiñen de cian
    if (y < 0.55) tmpC.copy(cLow).lerp(cMid, y / 0.55); else tmpC.copy(cMid).lerp(cHi, (y - 0.55) / 0.45);
    if (y > 0.97) tmpC.lerp(cHot, clipGlow * 0.8);
    const squash = comp.ratio > 1.05 ? clamp((L - comp.thr) * 2.5) * clamp((comp.ratio - 1) / 3) : 0;
    tmpC.lerp(cCy, squash * 0.75 * compTint);
    tmpC.lerp(cCart, carton);
    const bright = (1.15 + 0.9 * clipGlow * (y > 0.97 ? 1 : 0)) * dim * (1 - 0.55 * carton) * (1 - r * 0.045);
    tmpC.multiplyScalar(bright);
    bars.setColorAt(k, tmpC);
  }
  bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true;
}
// posición 3D del pico más reciente de un golpe (para etiquetas)
function peakCol(t, which /* 'kick' | 'clap' */, minC = 26, maxC = 44) {
  const n0 = Math.floor(t / B);
  for (let n = n0; n > n0 - 12; n--) {
    if (which === 'clap' && ((n + 400) % 2) !== 1) continue;
    if (which === 'kick' && ((n + 400) % 2) !== 0) continue;
    const c = COLS - 1 - (t - n * B) / DT;
    if (c >= minC && c <= maxC) return c + (which === 'clap' ? 0.4 : 0);
  }
  return (minC + maxC) / 2;
}

// planos: techo 0 dBFS (rojo) y threshold (cian)
function planeWithEdge(color, w, d, op) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  p.rotation.x = -Math.PI / 2; g.add(p);
  const em = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), toneMapped: false });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, 0.018), em); e.position.z = s * d / 2; g.add(e);
    const e2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, d), em); e2.position.x = s * w / 2; g.add(e2);
  }
  g.userData = { p, em }; return g;
}
const LW = COLS * DX + 0.5, LD = ROWS * DZ + 0.5;
const ceiling = planeWithEdge(HX.rojo, LW, LD, 0.16); ceiling.position.y = HMAX; scene.add(ceiling);
const thrPlane = planeWithEdge(HX.cian, LW, LD, 0.14); scene.add(thrPlane);
// prensa (el compresor)
const press = new THREE.Group(); scene.add(press);
const pressMat = new THREE.MeshStandardMaterial({ color: 0x15161d, metalness: 0.85, roughness: 0.3 });
const slabMat = new THREE.MeshStandardMaterial({ color: 0x0e1c24, metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false });
const slab = new THREE.Mesh(new RoundedBoxGeometry(LW + 0.1, 0.32, LD + 0.1, 3, 0.05), slabMat); slab.position.y = 0.16; press.add(slab);
const pressGlow = { material: new THREE.MeshBasicMaterial({ color: HX.cian.clone().multiplyScalar(2.5), toneMapped: false }) };
for (const s of [-1, 1]) {
  const a = new THREE.Mesh(new THREE.BoxGeometry(LW + 0.14, 0.035, 0.035), pressGlow.material); a.position.z = s * (LD + 0.1) / 2; press.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, LD + 0.14), pressGlow.material); b.position.x = s * (LW + 0.1) / 2; press.add(b);
}
for (const x of [-1.6, 1.6]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 20), pressMat); rod.position.set(x, 3.2, 0); press.add(rod); }

// ---------------------------------------------------------------- club: altavoces y láseres
const club = new THREE.Group(); scene.add(club);
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
for (const s of [-1, 1]) { speaker(club, s * 4.3, 0.75, -2.5, 1.2, -s * 0.5); speaker(club, s * 4.3, 2.55, -2.5, 1.2, -s * 0.5); speaker(club, s * 6.5, 0.75, -5.5, 1.3, -s * 0.4); }
const lasers = [];
const laserGeo = new THREE.CylinderGeometry(0.014, 0.014, 40, 6); laserGeo.translate(0, 20, 0);
[0x22e6ff, 0xff2e4d, 0x7b3cff, 0xff3cc7, 0x22e6ff, 0xff2e4d].forEach((col, i) => {
  const m = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  m.position.set((i - 2.5) * 1.2, 5.5, -12); scene.add(m); lasers.push(m);
});
function updateLasers(t, on) {
  lasers.forEach((m, i) => {
    m.visible = on > 0.01; m.material.opacity = 0.75 * on * (0.6 + 0.4 * kickEnv(t + i * 0.05));
    m.rotation.x = 1.25 + 0.25 * Math.sin(t * 0.9 + i);
    m.rotation.z = Math.PI + 0.5 * Math.sin(t * 0.7 + i * 1.7);
  });
}

// ---------------------------------------------------------------- perilla de volumen (gancho, pegada a cámara)
const knobG = new THREE.Group(); camera.add(knobG);
const knobMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.9, roughness: 0.25 });
const knobBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.14, 48), knobMetal); knobBody.rotation.x = Math.PI / 2; knobG.add(knobBody);
const knobCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 48), new THREE.MeshStandardMaterial({ color: 0x0c0d12, metalness: 0.5, roughness: 0.4 })); knobCap.rotation.x = Math.PI / 2; knobCap.position.z = 0.075; knobG.add(knobCap);
const knobRot = new THREE.Group(); knobG.add(knobRot);
const knobInd = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), toneMapped: false })); knobInd.position.set(0, 0.1, 0.09); knobRot.add(knobInd);
const leds = [];
for (let i = 0; i < 15; i++) {
  const a = lerp(225, -45, i / 14) * Math.PI / 180;
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  l.position.set(Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.03); knobG.add(l); leds.push(l);
}
function setKnob(v, lit = 1) { // v 0..1
  knobRot.rotation.z = lerp(225, -45, v) * Math.PI / 180 - Math.PI / 2;
  leds.forEach((l, i) => { const on = i / 14 <= v + 0.001; l.material.color.copy(i > 10 ? HX.rojo : HX.cian).multiplyScalar(on ? 2.4 * lit : 0.08); });
}

// ---------------------------------------------------------------- rack del compresor
const rack = new THREE.Group(); scene.add(rack);
rack.add(new THREE.Mesh(new RoundedBoxGeometry(3.3, 1.45, 0.42, 3, 0.06), new THREE.MeshStandardMaterial({ color: 0x14151b, metalness: 0.8, roughness: 0.35 })));
for (const x of [-1.78, 1.78]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.45, 0.06), new THREE.MeshStandardMaterial({ color: 0x24262f, metalness: 0.9, roughness: 0.3 })); ear.position.set(x, 0, -0.15); rack.add(ear); }
const faceCv = document.createElement('canvas'); faceCv.width = 1320; faceCv.height = 580;
const faceTex = new THREE.CanvasTexture(faceCv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.45), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false })); face.position.z = 0.212; rack.add(face);
const KX = [-1.18, -0.42, 0.34], KNAMES = ['ATTACK', 'RELEASE', 'RATIO'];
const rackKnobs = KX.map(x => {
  const g = new THREE.Group(); g.position.set(x, 0.06, 0.25); rack.add(g);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.16, 48), knobMetal); b.rotation.x = Math.PI / 2; g.add(b);
  const r = new THREE.Group(); g.add(r);
  const ind = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: HX.cian.clone().multiplyScalar(2.2), toneMapped: false })); ind.position.set(0, 0.12, 0.09); r.add(ind);
  return r;
});
function drawFace(title, vals, lit, gr, grMax) {
  const g = faceCv.getContext('2d'), w = faceCv.width, h = faceCv.height;
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#22242d'); grd.addColorStop(1, '#121318'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.05; for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? '#fff' : '#000'; g.fillRect(0, y, w, 1); } g.globalAlpha = 1;
  g.fillStyle = '#9AA0B4'; g.font = SANS(34); g.textAlign = 'left'; g.fillText(title, 40, 62);
  g.fillStyle = C.cian; g.beginPath(); g.arc(w - 50, 50, 10, 0, 7); g.fill();
  const px = x => (x / 3.3 + 0.5) * w;
  KNAMES.forEach((n, i) => {
    const cx = px(KX[i]);
    g.strokeStyle = '#3a3d4a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, h * 0.46, 118, (135) * Math.PI / 180, (405) * Math.PI / 180); g.stroke();
    if (lit[i] > 0) { g.strokeStyle = C.cian; g.globalAlpha = lit[i]; g.beginPath(); g.arc(cx, h * 0.46, 118, 135 * Math.PI / 180, (135 + 270 * vals[i].v) * Math.PI / 180); g.stroke(); g.globalAlpha = 1; }
    g.textAlign = 'center'; g.fillStyle = '#9AA0B4'; g.font = SANS(30); g.fillText(n, cx, h * 0.80);
    g.fillStyle = lit[i] > 0.5 ? C.cian : '#555a6a'; g.font = SANS(40); g.fillText(vals[i].label, cx, h * 0.93);
  });
  // medidor de reducción de ganancia
  const mx = px(1.12), my = 120, mh = 330;
  g.fillStyle = '#0a0b0f'; g.fillRect(mx - 70, my - 10, 140, mh + 20);
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const db = (i + 1) * 1; const on = gr >= db - 0.5;
    g.fillStyle = on ? (db > grMax ? C.rojo : C.cian) : '#1e2029';
    g.fillRect(mx - 50, my + (i) * (mh / segs) + 3, 100, mh / segs - 7);
  }
  g.textAlign = 'center'; g.fillStyle = '#9AA0B4'; g.font = SANS(30); g.fillText('GR dB', mx, h * 0.80);
  g.fillStyle = C.cian; g.font = SANS(40); g.fillText(`-${gr.toFixed(1)}`, mx, h * 0.93);
  faceTex.needsUpdate = true;
}

// ---------------------------------------------------------------- estudio (consola, monitores, letrero de neón)
const studio = new THREE.Group(); scene.add(studio);
const deskMat = new THREE.MeshStandardMaterial({ color: 0x121319, metalness: 0.6, roughness: 0.4 });
const desk = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.5, 1.8, 3, 0.06), deskMat); desk.position.set(0, 0.75, 3.4); desk.rotation.x = 0.16; studio.add(desk);
const faders = [];
for (let i = 0; i < 16; i++) {
  const x = -2.2 + i * 0.29;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.8), new THREE.MeshBasicMaterial({ color: 0x050507 })); slot.position.set(x, 0.26, 0.1); desk.add(slot);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0xd8dae4, metalness: 0.3, roughness: 0.4 })); cap.position.set(x, 0.29, 0.1); desk.add(cap); faders.push(cap);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.04), new THREE.MeshBasicMaterial({ color: (i % 4 === 0 ? HX.magenta : HX.cian).clone().multiplyScalar(2), toneMapped: false })); led.position.set(x, 0.26, -0.6); desk.add(led);
}
const monitors = [speaker(studio, -2.75, 1.55, 2.6, 0.8, 0.35), speaker(studio, 2.75, 1.55, 2.6, 0.8, -0.35)];
const signCv = document.createElement('canvas'); signCv.width = 1400; signCv.height = 560;
{
  const g = signCv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = C.magenta; g.shadowBlur = 40; g.fillStyle = '#ffffff'; g.font = HEAD(330); g.fillText('MEF', 700, 230);
  g.shadowColor = C.cian; g.shadowBlur = 26; g.font = SANS(92); g.fillStyle = '#e8fbff';
  const word = 'ESTUDIO'; let x = 700 - (word.length - 1) * 95 / 2; for (const ch of word) { g.fillText(ch, x, 470); x += 95; }
}
const signTex = new THREE.CanvasTexture(signCv); signTex.colorSpace = THREE.SRGBColorSpace;
const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, depthWrite: false, fog: false });
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.68), signMat); sign.position.set(0, 3.55, -2.6); studio.add(sign);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ color: 0x0b0b12, roughness: 0.9 })); wall.position.set(0, 3.5, -3.2); studio.add(wall);
for (const s of [-1, 1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 6, 0.05), new THREE.MeshBasicMaterial({ color: HX.violeta.clone().multiplyScalar(2), toneMapped: false })); strip.position.set(s * 4.2, 3, -3.1); studio.add(strip); }

// ---------------------------------------------------------------- cámara y estado por escena
function camLook(p, l, fov = 40) { camera.position.copy(p); camera.lookAt(l); camera.fov = fov; camera.updateProjectionMatrix(); }
const SHOTS = {
  hook: (lt) => { const k = easeOutCubic(lt / 1.4); return { p: V3(lerp(-1.0, 3.0, k) + 0.3 * Math.sin(lt), lerp(8.5, 2.2, k), lerp(5.5, 5.6, k)), l: V3(0, lerp(0, 1.0, k), 0), fov: lerp(60, 44, k) }; },
  promesa: (lt, d) => { const k = lt / d; return { p: V3(lerp(-4.6, 4.2, easeInOut(k)), 2.0 + 0.4 * Math.sin(k * 3), lerp(5.6, 5.2, k)), l: V3(lerp(-0.6, 0.6, k), 1.45, -0.6), fov: 50 }; },
  problema: (lt, d) => { const k = lt / d; return { p: V3(lerp(3.9, 3.0, k), lerp(1.9, 2.3, k), lerp(5.2, 4.7, k)), l: V3(0.1, 1.55, 0), fov: 46 }; },
  concepto: (lt, d) => { const k = lt / d; return { p: V3(lerp(-4.5, -3.8, k), lerp(2.7, 2.4, k), lerp(6.6, 6.0, k)), l: V3(0.2, 1.4, 0), fov: 46 }; },
  revelacion: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(2.6, 0.4, k), lerp(2.6, 2.9, k), lerp(5.6, 6.9, k)), l: V3(0, 1.55, 0), fov: 48 }; },
  kick: (lt, d) => { const k = lt / d; return { p: V3(lerp(-0.35, 0.35, k), 1.6 + 0.05 * Math.sin(lt * 0.8), lerp(8.4, 8.1, k)), l: V3(0, 1.77, 2.4), fov: 40 }; },
  bus: (lt, d) => { const k = lt / d; return { p: V3(lerp(0.35, 0.6, k), 1.65, lerp(8.1, 7.9, k)), l: V3(0, 1.77, 2.4), fov: 40 }; },
  aviso: (lt, d) => { const k = lt / d; return { p: V3(lerp(-3.0, -2.5, k), lerp(2.6, 2.2, k), lerp(5.4, 4.8, k)), l: V3(0.2, 1.5, 0), fov: 46 }; },
  marca: (lt, d) => { const k = easeInOut(lt / d); return { p: V3(lerp(-1.0, 0.6, k), lerp(2.2, 2.5, k), lerp(6.0, 9.4, k)), l: V3(0, lerp(1.4, 2.0, k), 0), fov: 46 }; },
  cta: (lt, d) => { const k = lt / d; return { p: V3(3.2 * Math.sin(-0.4 + k * 0.8), 2.7, 9.2 * Math.cos(-0.4 + k * 0.8)), l: V3(0, 2.1, 0), fov: 46 }; },
};
const WHIP = 0.42;
function shotAt(id, t) {
  const i = ORDER.indexOf(id), lt = LT(id, t), d = DURS(id);
  const s = SHOTS[id](lt, d);
  if (i > 0 && lt < WHIP) {
    const prev = ORDER[i - 1], sp = SHOTS[prev](DURS(prev), DURS(prev)), k = easeInOut(lt / WHIP);
    return { p: sp.p.clone().lerp(s.p, k), l: sp.l.clone().lerp(s.l, k), fov: lerp(sp.fov, s.fov, k) };
  }
  return s;
}
// parámetros del compresor (visual) en cada momento
function compAt(t) {
  const id = sceneAt(t), lt = LT(id, t);
  switch (id) {
    case 'hook': { const a = ss(0.55, 1.25, lt); const b = ss(1.35, 2.2, lt); return mixC(mixC(DRY, HALF, a), COMP, b); }
    case 'promesa': return COMP;
    case 'problema': return mixC(COMP, DRY, ss(0, 0.5, lt));
    case 'concepto': {
      const thr = lerp(1, COMP.thr, ss(wt('concepto', 'baja') - RANGES.concepto[0], wt('concepto', 'solo') - RANGES.concepto[0] + 0.6, lt));
      const ratio = lerp(1, 4, ss(wt('concepto', 'aplasta') - RANGES.concepto[0] - 0.3, wt('concepto', 'aplasta') - RANGES.concepto[0] + 0.4, lt));
      return { thr, ratio, mk: 0 };
    }
    case 'revelacion': { const t0 = wt('revelacion', 'subes') - RANGES.revelacion[0]; return mixC(HALF, COMP, ss(t0, t0 + 1.0, lt)); }
    case 'kick': case 'bus': return COMP;
    case 'aviso': { const t0 = wt('aviso', 'aplastas') - RANGES.aviso[0]; return mixC(COMP, BRICK, ss(t0 - 0.1, t0 + 0.25, lt)); }
    case 'marca': return mixC(BRICK, BAL, ss(0.1, 1.2, lt));
    default: return BAL;
  }
}

// ---------------------------------------------------------------- capa 2D (textos)
const out = document.getElementById('out'); const ctx = out.getContext('2d');
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const parseMarks = text => { const res = []; let on = false; for (const part of text.split(/(\*)/)) { if (part === '*') { on = !on; continue; } if (part) res.push({ s: part, m: on }); } return res; };
function richWidth(parts, font) { ctx.font = font; return parts.reduce((a, p) => a + ctx.measureText(p.s).width, 0); }
function drawRich(text, x, y, font, { color = '#fff', mark = C.cian, align = 'center', alpha = 1 } = {}) {
  const parts = parseMarks(text); const w = richWidth(parts, font); let cx = align === 'center' ? x - w / 2 : x;
  ctx.font = font; ctx.textAlign = 'left'; ctx.globalAlpha = alpha;
  for (const p of parts) { ctx.fillStyle = p.m ? mark : color; ctx.fillText(p.s, cx, y); cx += ctx.measureText(p.s).width; }
  ctx.globalAlpha = 1; return w;
}
function project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, z: p.z }; }
function chip(x, y, text, k, { bg = 'rgba(8,10,18,0.82)', border = C.cian, fg = '#fff', font = SANS(40), padX = 26, h = 64 } = {}) {
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.font = font; const w = richWidth(parseMarks(text), font) + padX * 2;
  rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = border; ctx.stroke();
  ctx.textBaseline = 'middle'; drawRich(text, 0, 2, font, { color: fg }); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
// subtítulos: frases cortas (estilo reel), palabra activa resaltada
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
    const font = SANS(58); ctx.font = font;
    // reparte en máximo 2 líneas
    const lines = [[]]; let lw = 0;
    for (const w of ch) { const ww = ctx.measureText(w.w.replace(/\*/g, '') + ' ').width; if (lw + ww > 900 && lines.at(-1).length) { lines.push([]); lw = 0; } lines.at(-1).push(w); lw += ww; }
    const baseY = 1440 - (lines.length - 1) * 38;
    const k = easeOutBack((t - ch[0].s + 0.05) / 0.22);
    ctx.save(); ctx.translate(W / 2, baseY); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    lines.forEach((ln, li) => {
      const txt = ln.map(w => w.w.replace(/\*/g, '')).join(' ');
      const tw = ctx.measureText(txt).width; let x = -tw / 2; const y = li * 76;
      let inMark = false;
      for (const w of ln) {
        const raw = w.w; const m = raw.includes('*') || inMark; if (raw.split('*').length % 2 === 0) inMark = !inMark;
        const clean = raw.replace(/\*/g, ''); const active = t >= w.s && t < w.e + 0.05;
        ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(clean, x, y);
        ctx.fillStyle = m ? C.cian : (active ? '#ffffff' : 'rgba(255,255,255,0.86)');
        if (active && !m) { ctx.fillStyle = '#FFE14D'; }
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
  drawRich(text, 0, 0, font, { mark: C.cian });
  ctx.restore();
}
function meter(x, y, w, h, v, label, col, k = 1) {
  if (k <= 0.01) return;
  ctx.save(); ctx.globalAlpha = k;
  rrect(x, y, w, h, 14); ctx.fillStyle = 'rgba(8,10,18,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
  const n = 16;
  for (let i = 0; i < n; i++) { const on = i / n < v; ctx.fillStyle = on ? (i > n * 0.8 ? C.rojo : col) : 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 12, y + h - 14 - (i + 1) * (h - 28) / n + 3, w - 24, (h - 28) / n - 6); }
  ctx.fillStyle = '#fff'; ctx.font = SANS(30); ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h + 40);
  ctx.restore();
}
// medida "loudness" aproximada del paisaje (promedio de energía en un compás)
function loudness(t, c) { let s = 0; const N = 48; for (let i = 0; i < N; i++) { const y = compress(level(t - i * B * 2 / N), c); s += y * y; } return Math.sqrt(s / N); }
function peakNow(t, c) { let m = 0; for (let i = 0; i < 10; i++) m = Math.max(m, compress(level(t - i * 0.012), c)); return m; }

function drawRetention(t) {
  const a = SEG.promesa.start + 3.2, b = SEG.kick.start;
  if (t < a || t > b + 1.4) return;
  const k = t < b ? easeOutBack((t - a) / 0.4) : 1 - ss(b + 1.0, b + 1.4, t);
  const prog = clamp((t - a) / (b - a));
  ctx.save(); ctx.translate(W / 2, 250); ctx.scale(k, k); ctx.globalAlpha = clamp(k);
  const w = 640, h = 78; rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(8,10,18,0.88)'; ctx.fill(); ctx.strokeStyle = C.cian; ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); rrect(-w / 2, -h / 2, w, h, h / 2); ctx.clip(); ctx.fillStyle = 'rgba(34,230,255,0.22)'; ctx.fillRect(-w / 2, -h / 2, w * prog, h); ctx.restore();
  ctx.textBaseline = 'middle'; drawRich(t < b ? 'Números para tu *kick* → al final' : '*¡Aquí están!*', 0, 3, SANS(38)); ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
function bookmark(x, y, s, fill, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-60, -80); ctx.lineTo(60, -80); ctx.lineTo(60, 85); ctx.lineTo(0, 40); ctx.lineTo(-60, 85); ctx.closePath();
  ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.stroke();
  if (fill > 0) { ctx.save(); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(-70, 90 - 180 * fill, 140, 180 * fill); ctx.restore(); }
  ctx.restore();
}
function wordmark(x, y, s, a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
  ctx.drawImage(signCv, -signCv.width / 2, -signCv.height / 2); ctx.restore();
}

// ---------------------------------------------------------------- dibujo por escena (2D)
function overlay(t, id, lt) {
  const S = RANGES[id][0];
  const at = (seg, w, n) => wt(seg, w, n);
  if (id === 'hook') {
    headline('¿*BAJAR* EL VOLUMEN', 430, easeOutBack(lt / 0.35), 118);
    headline('= SONAR *MÁS DURO*?', 560, easeOutBack((lt - 0.5) / 0.35), 118);
    const c = compAt(t);
    const pk = peakNow(t, c), ld = loudness(t, c);
    const kk = ss(0.2, 0.5, lt);
    meter(70, 760, 120, 430, clamp(lerp(1.0, 0.62, ss(0.55, 1.25, lt)) * (0.7 + 0.3 * kickEnv(t))), 'PICOS ↓', C.cian, kk);
    meter(W - 190, 760, 120, 430, clamp((ld - 0.25) / 0.6), 'LOUDNESS ↑', C.magenta, kk);
  }
  if (id === 'problema') {
    const pkk = project(V3(colX(peakCol(t, 'kick')), HMAX + 0.25, Z0));
    const pcl = project(V3(colX(peakCol(t, 'clap', 10, 24)), HMAX + 0.25, Z0));
    chip(clamp(pkk.x, 130, W - 130), pkk.y - 40, 'KICK', pop(at('problema', 'kick') - 0.1, t), { border: C.rojo });
    chip(clamp(pcl.x, 130, W - 130), pcl.y - 40, 'CLAP', pop(at('problema', 'clap') - 0.1, t), { border: C.rojo });
    const pc = project(V3(X0 - 0.1, HMAX, Z0 + LD / 2 - 0.2));
    chip(clamp(pc.x, 200, 880), pc.y - 10, '0 dBFS · *techo*', pop(at('problema', 'techo') - 0.15, t), { border: C.rojo, font: SANS(36), h: 58 });
  }
  if (id === 'concepto') {
    const c = compAt(t);
    const pt = project(V3(X0 + 0.3, c.thr * HMAX, Z0 + LD / 2));
    chip(clamp(pt.x + 40, 230, 850), pt.y + 50, 'THRESHOLD', pop(at('concepto', 'trechold') - 0.1, t));
    chip(W / 2 + 160, 640, `RATIO ${Math.round(c.ratio)}:1`, pop(at('concepto', 'reichio') - 0.1, t), { font: SANS(46), h: 74 });
    const gr = clamp(1 - compress(level(t), c) / Math.max(0.01, level(t))) * 12;
    meter(W - 170, 760, 100, 380, gr / 8 * ss(1, 4, c.ratio), 'GR', C.cian, ss(at('concepto', 'aplasta') - 0.3, at('concepto', 'aplasta'), t));
  }
  if (id === 'revelacion') {
    const t0 = at('revelacion', 'subes');
    chip(W / 2, 560, 'MAKE-UP GAIN ↑', pop(t0 - 0.05, t), { border: C.magenta, font: SANS(48), h: 78 });
    const kk = ss(t0 + 0.3, t0 + 0.8, t);
    const lA = loudness(t, DRY), lB = loudness(t, compAt(t));
    meter(80, 760, 120, 420, clamp((lA - 0.25) / 0.6), 'ANTES', C.violeta, kk);
    meter(W - 200, 760, 120, 420, clamp((lB - 0.25) / 0.6), 'DESPUÉS', C.cian, kk);
    headline('MENOS PICOS = *MÁS VOLUMEN*', 430, easeOutBack((t - at('revelacion', 'mismo')) / 0.35), 76);
  }
  if (id === 'kick' || id === 'bus') {
    headline(id === 'kick' ? 'NÚMEROS PARA TU *KICK*' : 'BUS DE *BATERÍA*', 400, easeOutBack((lt - 0.15) / 0.35), 92);
    const cards = id === 'kick'
      ? [['ATTACK', '10–30 ms', at('kick', 'atak')], ['RELEASE', '≈115 ms', at('kick', 'rilis')], ['@ 130 BPM', '1/16', at('kick', 'ciento', 0)], ['RATIO · GR', '4:1 · 3–6 dB', at('kick', 'reichio')]]
      : [['RATIO', '2:1', at('bus', 'dos')], ['GR', '1–3 dB', at('bus', 'solo')], ['OBJETIVO', 'PEGAR TODO', at('bus', 'pegar')]];
    const cols = 2, cw = 440, ch = 150, gx = 24, gy = 22, top = 520;
    cards.forEach((cd, i) => {
      const k = pop(cd[2] - 0.05, t); if (k <= 0) return;
      const row = Math.floor(i / cols), col = i % cols;
      const n = Math.min(cols, cards.length - row * cols);
      const x = W / 2 + (col - (n - 1) / 2) * (cw + gx), y = top + row * (ch + gy) + ch / 2;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      rrect(-cw / 2, -ch / 2, cw, ch, 22); ctx.fillStyle = 'rgba(8,10,18,0.86)'; ctx.fill(); ctx.strokeStyle = C.cian; ctx.lineWidth = 3; ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = C.gris; ctx.font = SANS(30); ctx.fillText(cd[0], 0, -22);
      ctx.fillStyle = '#fff'; ctx.font = HEAD(62); ctx.fillText(cd[1], 0, 46);
      ctx.restore();
    });
  }
  if (id === 'aviso') {
    const t0 = at('aviso', 'aplastas');
    headline('SOBRECOMPRESIÓN', 430, easeOutBack((t - t0) / 0.3), 110);
    headline('= *SIN PUNCH*', 550, easeOutBack((t - at('aviso', 'panch')) / 0.3), 100);
    chip(W / 2, 720, 'kick de *cartón*', pop(at('aviso', 'carton') - 0.1, t), { border: C.carton, font: SANS(44), h: 74 });
  }
  if (id === 'marca') {
    const t0 = at('marca', 'mef');
    chip(W / 2, 830, '*MEZCLA* & *MÁSTER*', pop(at('marca', 'mezcla') - 0.05, t), { border: C.magenta, font: SANS(50), h: 82 });
    if (t > t0) { ctx.globalAlpha = 0.85 * ss(t0, t0 + 0.6, t); wordmark(W - 120, 140, 0.13); ctx.globalAlpha = 1; }
  }
  if (id === 'cta') {
    const tG = at('cta', 'guarda'), tS = at('cta', 'siguenos'), tEnd = SEG.cta.end + 0.15;
    ctx.globalAlpha = 1; const fadeOut = 1 - ss(tEnd, tEnd + 0.35, t);
    ctx.save(); ctx.globalAlpha = fadeOut;
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
      ctx.globalAlpha = clamp(kf); ctx.fillStyle = '#fff'; ctx.font = SANS(54); ctx.textAlign = 'center'; ctx.fillText(HANDLE, W / 2, 1140); ctx.globalAlpha = 1;
    }
    ctx.restore();
    wordmark(W - 120, 140, 0.13, 0.85 * fadeOut);
    // cierre: placa final con la marca
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
  const id = sceneAt(t), lt = LT(id, t), d = DURS(id);
  const c = compAt(t);
  // visibilidad
  const inStudio = id === 'marca' || id === 'cta';
  const rackOn = id === 'kick' || id === 'bus';
  knobG.visible = id === 'hook';
  club.visible = !inStudio;
  studio.visible = inStudio;
  rack.visible = rackOn;
  // paisaje
  const carton = id === 'aviso' ? ss(wt('aviso', 'aplastas') - 0.1, wt('aviso', 'carton'), t) : (id === 'marca' ? 1 - ss(0.1, 1.0, lt) : 0);
  updateLand(t, c, { clipGlow: id === 'problema' ? 1 : (id === 'hook' ? 0.6 * (1 - ss(0.5, 1.2, lt)) : 0), carton, dim: rackOn ? 0.45 : 1 });
  // techo y threshold
  ceiling.visible = ['hook', 'problema', 'concepto', 'revelacion', 'aviso'].includes(id);
  ceiling.userData.p.material.opacity = 0.1 + 0.12 * (id === 'problema' ? kickEnv(t) : 0);
  const thrOn = (id === 'concepto' && t > wt('concepto', 'baja') - 0.2) || id === 'revelacion' || id === 'aviso';
  thrPlane.visible = thrOn; thrPlane.position.y = Math.min(c.thr, 1) * HMAX + 0.004;
  // prensa
  let pressY = 9;
  if (id === 'concepto') pressY = lerp(6, c.thr * HMAX, ss(wt('concepto', 'baja') - 0.3, wt('concepto', 'solo') + 0.4, t));
  if (id === 'revelacion') pressY = lerp(c.thr * HMAX, 6, ss(wt('revelacion', 'subes') - 0.4, wt('revelacion', 'subes') + 0.4, t));
  if (id === 'aviso') { const t0 = wt('aviso', 'aplastas'); pressY = t < t0 - 0.15 ? lerp(7, 4.5, ss(RANGES.aviso[0], t0 - 0.15, t)) : lerp(4.5, c.thr * HMAX + 0.0, easeOutCubic((t - t0 + 0.15) / 0.22)); }
  press.visible = pressY < 8.5; press.position.y = pressY;
  pressGlow.material.color.copy(id === 'aviso' ? HX.rojo : HX.cian).multiplyScalar(2.4);
  // club / luces
  updateLasers(t, id === 'promesa' ? 1 : (id === 'hook' ? ss(1.4, 2.4, lt) : (id === 'cta' ? 0.6 : (id === 'revelacion' ? ss(1.5, 3, lt) * 0.5 : 0))));
  cones.forEach(m => { m.position.z = 0.47 + 0.04 * kickEnv(t); });
  cyanL.intensity = 18 + 25 * kickEnv(t); redL.intensity = 14 + 30 * kickEnv(t + B / 2);
  bloom.strength = 0.8 + 0.25 * kickEnv(t);
  // perilla (gancho)
  if (knobG.visible) {
    knobG.position.set(0, -0.1, -2.4); knobG.rotation.set(0.12, 0, 0);
    const kin = easeOutBack(lt / 0.4); knobG.scale.setScalar(Math.max(0.001, kin) * 0.7);
    setKnob(lerp(0.95, 0.35, easeInOut(ss(0.3, 1.3, lt) )));
    knobG.position.y -= 1.2 * ss(2.4, 3.0, lt);
    knobG.visible = lt < 3.05;
  }
  // rack
  if (rackOn) {
    const k = id === 'kick' ? easeOutBack((lt - 0.05) / 0.5) : 1;
    rack.position.set(0, 1.42 + 0.03 * Math.sin(t * 1.3), 2.4); rack.rotation.set(-0.05, 0.08 * Math.sin(t * 0.5), 0); rack.scale.setScalar(Math.max(0.001, k) * 0.55);
    const isK = id === 'kick';
    const tA = wt('kick', 'atak'), tR = wt('kick', 'rilis'), tQ = wt('kick', 'reichio');
    const vA = isK ? lerp(0.2, 0.62, ss(tA, tA + 0.5, t)) : 0.68;
    const vR = isK ? lerp(0.85, 0.42, ss(tR, tR + 0.5, t)) : lerp(0.42, 0.5, ss(RANGES.bus[0], RANGES.bus[0] + 0.5, t));
    const vQ = isK ? lerp(0.05, 0.45, ss(tQ, tQ + 0.5, t)) : lerp(0.45, 0.22, ss(wt('bus', 'dos'), wt('bus', 'dos') + 0.5, t));
    [vA, vR, vQ].forEach((v, i) => rackKnobs[i].rotation.z = -(lerp(-135, 135, v)) * Math.PI / 180);
    const lit = isK ? [ss(tA, tA + 0.3, t), ss(tR, tR + 0.3, t), ss(tQ, tQ + 0.3, t)] : [1, 1, 1];
    const labels = isK ? [{ v: vA, label: t > tA ? '20 ms' : '—' }, { v: vR, label: t > tR ? '115 ms' : '—' }, { v: vQ, label: t > tQ ? '4:1' : '—' }]
      : [{ v: vA, label: '30 ms' }, { v: vR, label: '150 ms' }, { v: vQ, label: t > wt('bus', 'dos') ? '2:1' : '4:1' }];
    const grMax = isK ? 6 : 3; const grOn = isK ? ss(wt('kick', 'tres', 0) - 0.5, wt('kick', 'tres', 0), t) : 1;
    const ph = ((t % B) + B) % B; const atk = isK ? 0.02 : 0.03, rel = isK ? 0.115 : 0.15;
    const env = ph < atk ? ph / atk : Math.exp(-(ph - atk) / rel);
    drawFace(isK ? 'COMP · KICK' : 'COMP · DRUM BUS', labels, lit, grOn * (isK ? 5.2 : 2.6) * env, grMax);
  }
  // estudio
  if (inStudio) {
    faders.forEach((f, i) => { f.position.z = 0.1 + 0.28 * Math.sin(i * 1.7 + t * 0.6) * 0.6; });
    const tM = wt('marca', 'mef');
    const on = id === 'cta' ? 0.38 * (1 - ss(0, 0.5, lt)) : (t < tM - 0.05 ? 0 : (t < tM + 0.35 ? (Math.sin((t - tM) * 70) > 0 ? 0.38 : 0.08) : 0.38));
    sign.visible = on > 0; signMat.color.setScalar(on * (1 + 0.15 * kickEnv(t)));
  }
  // cámara
  const s = shotAt(id, t);
  const bob = (inStudio || rackOn ? 0.012 : 0.03) * kickEnv(t);
  let shake = 0; if (id === 'aviso') { const t0 = wt('aviso', 'aplastas'); shake = 0.06 * Math.exp(-Math.max(0, t - t0 - 0.07) / 0.12) * (t > t0 ? 1 : 0); }
  camLook(V3(s.p.x + shake * Math.sin(t * 90), s.p.y + bob + shake * Math.cos(t * 77), s.p.z), s.l, s.fov);
  composer.render();
  // composición final
  ctx.drawImage(glCanvas, 0, 0, W, H);
  // viñeta
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  overlay(t, id, lt);
  drawRetention(t);
  drawSubs(t);
};
window.frameJpeg = function (t, q = 0.92) { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = TL.duration;
window.READY = true;
