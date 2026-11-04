// Video 3D para CANIS Spa Canino: "Los nudos lastiman — agenda en CANIS".
// Escena three.js renderizada cuadro a cuadro. Todo el estado visual es función
// pura del tiempo t (segundos), para renderizar en paralelo y de forma determinista.
// Sigue el Manual de Marca CANIS v2: paleta, tipografías, zonas seguras 1080×1920,
// marca de agua, subtítulos en píldora grafito, cierre azul con logo blanco original.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920;
// ---------------------------------------------------------------- marca
const C = { azul: '#2F80B7', crema: '#F4EFE4', amarillo: '#F4C95D', coral: '#E98B75', grafito: '#3E4247', blanco: '#FFFFFF' };
const HEX = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, parseInt(v.slice(1), 16)]));
const SAFE_TOP = 220, SAFE_BOTTOM = H - 420, MARGIN = 48;
const TITLE = (sz, w = 700) => `${w} ${sz}px Fraunces`;
const TEXT = (sz, w = 800) => `${w} ${sz}px Nunito`;

const TL = await (await fetch('timeline.json')).json();
const SEG = Object.fromEntries(TL.segments.map(s => [s.id, s]));
const ORDER = TL.segments.map(s => s.id);
await Promise.all(['800 96px Fraunces', '700 60px Fraunces', '800 48px Nunito', '700 44px Nunito'].map(f => document.fonts.load(f)));
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const LOGO = { blanco: await loadImg('/brand/canis-logo-blanco.png'), iconoAzul: await loadImg('/brand/canis-icono-azul.png'), iconoBlanco: await loadImg('/brand/canis-icono-blanco.png') };

// ---------------------------------------------------------------- utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const pop = (t0, t, d = 0.45) => easeOutBack((t - t0) / d);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// tiempos por palabra (aprox. proporcional a caracteres + pausas en puntuación)
function timeWords(s, text) {
  const words = text.split(/\s+/).filter(Boolean);
  const w = words.map(x => x.replace(/\*/g, '').length + 1 + (/[,.;:]\**$/.test(x) ? 6 : 0) + (/[?!]\**$/.test(x) ? 4 : 0));
  const tot = w.reduce((a, b) => a + b, 0); const d = s.end - s.start; let acc = 0;
  return words.map((x, i) => { const st = s.start + acc / tot * d; acc += w[i]; return { w: x, s: st, e: s.start + acc / tot * d }; });
}
const WORDS = {}, SUBW = {};
for (const s of TL.segments) { WORDS[s.id] = timeWords(s, s.text); if (s.sub) SUBW[s.id] = timeWords(s, s.sub); }
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
function wt(id, prefix, nth = 0) {
  let n = 0;
  for (const w of WORDS[id]) if (norm(w.w).startsWith(norm(prefix))) { if (n++ === nth) return w.s; }
  console.warn('palabra no encontrada', id, prefix); return SEG[id].start;
}

const RANGES = {};
ORDER.forEach((id, i) => {
  const a = i ? SEG[id].start - 0.25 : 0;
  const b = i < ORDER.length - 1 ? SEG[ORDER[i + 1]].start - 0.25 : TL.duration + 0.01;
  RANGES[id] = [a, b];
});
const OPEN = 1.3; // regalo que se abre al inicio del resultado (la recompensa)
const DARK = { intro: 1, problema: 1, dano: 1, aviso: 1, cta: 1, cierre: 1 };

// ---------------------------------------------------------------- renderer
const glCanvas = document.createElement('canvas'); glCanvas.id = 'gl';
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 100);

scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8070, 1.15));
const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(3, 7, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 });
key.shadow.bias = -0.0005; key.shadow.radius = 4; scene.add(key);
const rim = new THREE.DirectionalLight(0xdcecff, 1.4); rim.position.set(-4, 4, -5); scene.add(rim);

function gradTex(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BG = { crema: gradTex('#FBF8F2', C.crema), azul: gradTex('#3A8CC2', C.azul), grafito: gradTex('#4A4F55', '#33373B') };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function sprite(tex, sx, sy = sx) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(sx, sy, 1); return s; }
const radialTex = (inner, outer) => canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
const badge = (bg, draw) => canvasTex(256, 256, (g) => { g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill(); g.lineWidth = 12; g.strokeStyle = '#fff'; g.stroke(); draw(g); });
const TEX = {
  bang: badge(C.amarillo, g => { g.fillStyle = C.grafito; g.font = TITLE(180, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 128, 140); }),
  quest: badge(C.amarillo, g => { g.fillStyle = C.grafito; g.font = TITLE(170, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 142); }),
  check: badge(C.azul, g => { g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 28; g.beginPath(); g.moveTo(72, 132); g.lineTo(112, 172); g.lineTo(186, 92); g.stroke(); }),
  spark: canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,248,220,0.85)'); gr.addColorStop(1, 'rgba(244,201,93,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 4); g.lineTo(70, 58); g.lineTo(124, 64); g.lineTo(70, 70); g.lineTo(64, 124); g.lineTo(58, 70); g.lineTo(4, 64); g.lineTo(58, 58); g.closePath(); g.fill(); }),
  painGlow: radialTex('rgba(233,139,117,0.95)', 'rgba(233,139,117,0)'),
  goodGlow: radialTex('rgba(47,128,183,0.75)', 'rgba(47,128,183,0)'),
  inflam: radialTex('rgba(205,70,60,0.9)', 'rgba(233,139,117,0)'),
  shadow: radialTex('rgba(40,35,30,0.35)', 'rgba(40,35,30,0)'),
};

// ---------------------------------------------------------------- materiales
const M = {
  fur: new THREE.MeshStandardMaterial({ color: 0xE3A766, roughness: 0.9 }),
  furLight: new THREE.MeshStandardMaterial({ color: 0xF8E6CB, roughness: 0.95 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0xA9622C, roughness: 0.9 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x141012, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  pink: new THREE.MeshStandardMaterial({ color: 0xF08AA0, roughness: 0.5 }),
  blush: new THREE.MeshBasicMaterial({ color: 0xF2A39A, transparent: true, opacity: 0.55 }),
  ground: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  azul: new THREE.MeshPhysicalMaterial({ color: HEX.azul, roughness: 0.3, clearcoat: 0.8 }),
  crema: new THREE.MeshPhysicalMaterial({ color: HEX.crema, roughness: 0.4, clearcoat: 0.4 }),
  amarillo: new THREE.MeshPhysicalMaterial({ color: HEX.amarillo, roughness: 0.3, clearcoat: 0.8 }),
  grafito: new THREE.MeshPhysicalMaterial({ color: HEX.grafito, roughness: 0.35, clearcoat: 0.6 }),
};
const sph = new THREE.SphereGeometry(1, 48, 32);
function mesh(geo, mat, parent, pos = [0, 0, 0], scl = null, rot = null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (scl) m.scale.set(...scl); if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

// ---------------------------------------------------------------- perrito (Canela)
function makeDog(seed = 1) {
  const R = rng(seed);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const matted = new THREE.MeshStandardMaterial({ color: 0x8A5428, roughness: 1, emissive: HEX.coral, emissiveIntensity: 0 });
  const furMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const TORSO = { c: V3(0, 1.05, 0), s: V3(0.95, 1.05, 0.85) };
  mesh(sph, M.fur, body, TORSO.c.toArray(), TORSO.s.toArray());
  mesh(sph, M.furLight, body, [0, 1.18, 0.42], [0.62, 0.78, 0.5]);
  for (const s of [-1, 1]) {
    mesh(sph, M.fur, body, [s * 0.64, 0.52, -0.05], [0.46, 0.46, 0.62]);
    mesh(sph, M.furLight, body, [s * 0.72, 0.12, 0.42], [0.26, 0.15, 0.36]);
    mesh(new THREE.CapsuleGeometry(0.18, 0.72, 8, 20), M.fur, body, [s * 0.33, 0.5, 0.56]);
    mesh(sph, M.furLight, body, [s * 0.33, 0.1, 0.7], [0.23, 0.14, 0.28]);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.55, -0.72); body.add(tail);
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, 0.25, -0.3), V3(0, 0.65, -0.42), V3(0, 0.95, -0.25)]), 32, 0.11, 12), M.fur, tail);
  mesh(sph, M.furLight, tail, [0, 0.98, -0.22], [0.16, 0.16, 0.16]);
  const head = new THREE.Group(); head.position.set(0, 2.25, 0.2); g.add(head);
  mesh(sph, M.fur, head, [0, 0, 0], [0.8, 0.72, 0.72]);
  mesh(sph, M.furLight, head, [0, -0.22, 0.54], [0.44, 0.31, 0.36]);
  mesh(sph, M.furLight, head, [0, 0.12, 0.5], [0.3, 0.3, 0.25]);
  mesh(sph, M.black, head, [0, -0.08, 0.88], [0.14, 0.1, 0.1]);
  const eyes = [], brows = [], ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.3, 0.1, 0.56); head.add(e);
    mesh(sph, M.black, e, [0, 0, 0], [0.135, 0.15, 0.1]);
    mesh(sph, M.white, e, [0.045 * -s + 0.02, 0.06, 0.08], [0.045, 0.045, 0.03]);
    mesh(sph, M.white, e, [-0.04 * s, -0.05, 0.085], [0.02, 0.02, 0.015]);
    eyes.push(e);
    brows.push(mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), M.furDark, head, [s * 0.3, 0.32, 0.6], null, [0, 0, Math.PI / 2]));
    mesh(sph, M.blush, head, [s * 0.46, -0.18, 0.5], [0.11, 0.07, 0.05]);
    const ep = new THREE.Group(); ep.position.set(s * 0.6, 0.38, -0.02); head.add(ep);
    mesh(sph, M.furDark, ep, [s * 0.12, -0.42, 0], [0.22, 0.55, 0.36], [0, 0, s * 0.25]);
    ears.push(ep);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 24, Math.PI), M.black, head, [0, -0.34, 0.74]);
  const tongue = mesh(sph, M.pink, head, [0, -0.47, 0.7], [0.08, 0.12, 0.04]);
  // moño azul CANIS (sale peinada y con moño)
  const bow = new THREE.Group(); bow.position.set(0.42, 0.55, 0.25); bow.rotation.z = -0.4; head.add(bow);
  for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.12, 0.22, 16), M.azul, bow, [s * 0.11, 0, 0], null, [0, 0, s * Math.PI / 2]);
  mesh(sph, M.azul, bow, [0, 0, 0], [0.06, 0.06, 0.06]);
  const tuftGeo = new THREE.IcosahedronGeometry(1, 1);
  function fluff(parent, c, s, n, skip, rad = [0.07, 0.115]) {
    const im = new THREE.InstancedMesh(tuftGeo, furMat, n);
    im.castShadow = true; im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(); let i = 0;
    while (i < n) {
      const u = V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (u.length() > 1 || u.length() < 0.1) continue; u.normalize();
      if (skip(u)) continue;
      const p = V3(u.x * s.x, u.y * s.y, u.z * s.z).multiplyScalar(0.985).add(c);
      const r = lerp(rad[0], rad[1], R());
      q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6));
      m4.compose(p, q, V3(r, r * 0.75, r * 1.1)); im.setMatrixAt(i, m4);
      col.setHex(0xE3A766).lerp(new THREE.Color(R() < 0.5 ? 0xF2C48C : 0xD08E4E), R() * 0.45); im.setColorAt(i, col); i++;
    }
    parent.add(im); return im;
  }
  fluff(body, TORSO.c, TORSO.s, 750, u => u.y < -0.55 || (u.z > 0.35 && u.y < 0.6 && Math.abs(u.x) < 0.55));
  fluff(head, V3(0, 0, 0), V3(0.8, 0.72, 0.72), 380, u => (u.z > 0.35 && u.y < 0.75) || u.y < -0.5, [0.06, 0.1]);
  const knotGeo = new THREE.TorusKnotGeometry(0.15, 0.065, 96, 12, 2, 3);
  const knots = [];
  for (const d of [V3(0.82, 0.32, 0.48), V3(0.95, -0.25, 0.2), V3(0.45, 0.7, 0.55)]) {
    d.normalize(); const p = V3(d.x * TORSO.s.x, d.y * TORSO.s.y, d.z * TORSO.s.z).add(TORSO.c);
    const kg = new THREE.Group(); kg.position.copy(p); kg.lookAt(p.clone().add(d)); body.add(kg);
    mesh(knotGeo, matted, kg, [0, 0, 0.02]); mesh(knotGeo, matted, kg, [0.05, 0.03, 0.0], [0.8, 0.8, 0.8], [1.2, 0.4, 0.8]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.29, 48), new THREE.MeshBasicMaterial({ color: HEX.coral, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.z = 0.12; kg.add(ring);
    const ring2 = ring.clone(); ring2.material = ring.material.clone(); kg.add(ring2);
    knots.push({ g: kg, ring, ring2, dir: d, pos: p });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; g.add(shadow);

  function pose(t, { mood = 0, wag = 0, pain = 0, bounce = 0, tilt = 0, messy = 0 }) {
    const sad = clamp(-mood), happy = clamp(mood);
    brows[0].rotation.z = Math.PI / 2 + 0.45 * sad - 0.15 * happy; brows[1].rotation.z = Math.PI / 2 - 0.45 * sad + 0.15 * happy;
    brows[0].position.y = brows[1].position.y = 0.32 + 0.04 * sad + 0.03 * happy;
    const sq = 1 - 0.3 * pain * (0.5 + 0.5 * Math.sin(t * 6)) - 0.35 * happy;
    eyes.forEach(e => e.scale.set(1, sq, 1));
    mouth.scale.set(1, mood >= 0 ? -(0.35 + 0.75 * happy) : (0.35 + 0.65 * sad), 1);
    mouth.position.y = -0.34 - 0.03 * happy;
    tongue.visible = happy > 0.35; tongue.scale.set(0.08, 0.12 * ss(0.35, 0.9, happy) + 0.001, 0.04);
    ears.forEach((e, i) => { const s = i ? 1 : -1; e.rotation.z = s * (0.05 - 0.12 * sad + 0.18 * happy * (0.5 + 0.5 * Math.sin(t * 8 + i))); e.rotation.x = -0.15 * sad; });
    tail.rotation.z = Math.sin(t * 13) * 0.5 * wag; tail.rotation.x = -0.35 * sad;
    const b = Math.abs(Math.sin(t * 6)) * bounce;
    body.position.y = b * 0.5; head.position.y = 2.25 + b * 0.55 - 0.08 * sad; head.rotation.z = tilt;
    head.rotation.x = 0.12 * sad; shadow.scale.setScalar(1 - b * 0.35);
    furMat.color.setHex(0xffffff).lerp(new THREE.Color(0xC2A584), messy * 0.4); // pelo opaco/enmarañado vs. limpio
    matted.emissiveIntensity = pain * (0.25 + 0.2 * Math.sin(t * 5));
  }
  function setKnots(t, show, painAmt) {
    knots.forEach((k, i) => {
      k.g.visible = show > 0.01; k.g.scale.setScalar(Math.max(0.001, show));
      const f = (t * 1.0 + i * 0.33) % 1, f2 = (t * 1.0 + i * 0.33 + 0.5) % 1;
      k.ring.scale.setScalar(0.6 + f * 1.5); k.ring.material.opacity = (1 - f) * painAmt * 0.9;
      k.ring2.scale.setScalar(0.6 + f2 * 1.5); k.ring2.material.opacity = (1 - f2) * painAmt * 0.9;
      k.ring.visible = k.ring2.visible = painAmt > 0.01;
    });
  }
  return { g, body, head, tail, knots, bow, pose, setKnots, torso: TORSO };
}

function makeBrush() {
  const g = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.8, 0.14, 0.38, 4, 0.06), M.azul, g, [0, 0.07, 0]);
  mesh(new THREE.CapsuleGeometry(0.075, 0.9, 6, 16), M.crema, g, [0.85, 0.14, 0], null, [0, 0, Math.PI / 2 + 0.12]);
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 60);
  const m4 = new THREE.Matrix4(); let i = 0;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 5; z++) { m4.makeTranslation(-0.33 + x * 0.06, -0.08, -0.13 + z * 0.065); im.setMatrixAt(i++, m4); }
  g.add(im); return g;
}

const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ================================================================ SET: PERRO
const dogSet = new THREE.Group(); scene.add(dogSet);
const dog = makeDog(7); dogSet.add(dog.g);
const bang = sprite(TEX.bang, 0.55); dogSet.add(bang);
const brush = makeBrush(); dogSet.add(brush);
const sparkPool = []; for (let i = 0; i < 40; i++) { const s = sprite(TEX.spark, 0.25); dogSet.add(s); sparkPool.push(s); }
const deadHair = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xC9884A, roughness: 1 }), 40); deadHair.castShadow = true; dogSet.add(deadHair);
const heartShape = new THREE.Shape(); heartShape.moveTo(0, 0.25); heartShape.bezierCurveTo(0, 0.25, -0.05, 0, -0.25, 0); heartShape.bezierCurveTo(-0.55, 0, -0.55, 0.35, -0.55, 0.35); heartShape.bezierCurveTo(-0.55, 0.55, -0.35, 0.77, 0, 0.95); heartShape.bezierCurveTo(0.35, 0.77, 0.55, 0.55, 0.55, 0.35); heartShape.bezierCurveTo(0.55, 0.35, 0.55, 0, 0.25, 0); heartShape.bezierCurveTo(0.1, 0, 0, 0.25, 0, 0.25);
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 24 }); heartGeo.center(); heartGeo.rotateZ(Math.PI);
const heartWhite = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 });
const hearts = []; for (let i = 0; i < 8; i++) hearts.push(mesh(heartGeo, i % 2 ? M.crema : heartWhite, dogSet));

// ================================================================ SET: ANTES / DESPUÉS
const baSet = new THREE.Group(); scene.add(baSet);
const dogBefore = makeDog(7); dogBefore.bow.visible = false; baSet.add(dogBefore.g);
const dogAfter = makeDog(7); baSet.add(dogAfter.g);
const baSparks = []; for (let i = 0; i < 18; i++) { const s = sprite(TEX.spark, 0.25); baSet.add(s); baSparks.push(s); }

// ================================================================ SET: REGALO (promesa y recompensa)
const giftSet = new THREE.Group(); scene.add(giftSet);
const giftBox = new THREE.Group(); giftSet.add(giftBox);
mesh(new RoundedBoxGeometry(1.5, 1.2, 1.5, 4, 0.08), M.crema, giftBox, [0, 0.6, 0]);
mesh(new THREE.BoxGeometry(0.26, 1.21, 1.52), M.amarillo, giftBox, [0, 0.6, 0]);
mesh(new THREE.BoxGeometry(1.52, 1.21, 0.26), M.amarillo, giftBox, [0, 0.6, 0]);
const lid = new THREE.Group(); lid.position.y = 1.2; giftBox.add(lid);
mesh(new RoundedBoxGeometry(1.66, 0.3, 1.66, 4, 0.08), M.crema, lid, [0, 0.15, 0]);
mesh(new THREE.BoxGeometry(0.27, 0.31, 1.68), M.amarillo, lid, [0, 0.15, 0]);
mesh(new THREE.BoxGeometry(1.68, 0.31, 0.27), M.amarillo, lid, [0, 0.15, 0]);
for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.2, 0.07, 12, 32), M.amarillo, lid, [s * 0.2, 0.42, 0], [1, 0.8, 1], [0, s * 0.5, s * 0.6]);
const lock = new THREE.Group(); lock.position.set(0, 0.62, 0.8); giftBox.add(lock);
mesh(new RoundedBoxGeometry(0.5, 0.42, 0.18, 4, 0.05), M.grafito, lock);
const shackle = mesh(new THREE.TorusGeometry(0.15, 0.045, 12, 32, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 1, roughness: 0.2 }), lock, [0, 0.21, 0]);
mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), M.amarillo, lock, [0, 0.03, 0.09], null, [Math.PI / 2, 0, 0]);
const quest = sprite(TEX.quest, 0.7); giftSet.add(quest);
const giftSparks = []; for (let i = 0; i < 36; i++) { const s = sprite(TEX.spark, 0.3); giftSet.add(s); giftSparks.push(s); }
const glowBurst = sprite(radialTex('rgba(255,252,240,1)', 'rgba(244,239,228,0)'), 1); glowBurst.position.set(0, 1.4, 0); giftSet.add(glowBurst);

// ================================================================ SET: PRIMER PLANO DE PIEL Y PELO
const closeSet = new THREE.Group(); scene.add(closeSet);
const SKW = 6, SKD = 4;
const skinGeo = new THREE.PlaneGeometry(SKW, SKD, 120, 80); skinGeo.rotateX(-Math.PI / 2);
const skinBase = skinGeo.attributes.position.array.slice();
const skinMat = new THREE.MeshStandardMaterial({ color: 0xF6C2B2, roughness: 0.55 });
mesh(skinGeo, skinMat, closeSet);
mesh(new THREE.BoxGeometry(SKW, 0.5, SKD), new THREE.MeshStandardMaterial({ color: 0xE39A8A, roughness: 0.7 }), closeSet, [0, -0.26, 0]);
mesh(new THREE.BoxGeometry(SKW, 1.2, SKD), new THREE.MeshStandardMaterial({ color: 0xF5DDA8, roughness: 0.8 }), closeSet, [0, -1.12, 0]);
for (let i = 0; i < 14; i++) mesh(new THREE.CapsuleGeometry(0.03, 0.3, 4, 8), new THREE.MeshStandardMaterial({ color: 0xB7603F }), closeSet, [-2.6 + i * 0.4, -0.2, 2.0]);
const KC = V3(0, 0, 0.25);
const STR = []; {
  const R = rng(42);
  for (let i = 0; i < 64; i++) {
    let x, z, conv;
    if (i < 22) { const a = R() * 6.28, r = 0.15 + R() * 0.6; x = KC.x + Math.cos(a) * r; z = KC.z + Math.sin(a) * r * 0.8; conv = 1; }
    else { do { x = (R() * 2 - 1) * 2.0; z = -1.3 + R() * 2.4; } while (Math.hypot(x - KC.x, z - KC.z) < 0.75); conv = 0; }
    const oa = R() * 6.28;
    STR.push({ x, z, conv, ph: R() * 6.28, L: 2.0 + R() * 0.8, sway: 0.12 + R() * 0.2, off: V3(Math.cos(oa) * 0.28, (R() - 0.5) * 0.25, Math.sin(oa) * 0.28), lean: (R() - 0.5) * 0.6 });
  }
}
const hairMat = new THREE.MeshStandardMaterial({ color: 0xDDA060, roughness: 0.55 });
const hairMeshes = STR.map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), hairMat); m.castShadow = true; closeSet.add(m); return m; });
const ckMat = new THREE.MeshStandardMaterial({ color: 0xA86A36, roughness: 0.8, emissive: HEX.coral, emissiveIntensity: 0 });
const closeKnot = new THREE.Group(); closeSet.add(closeKnot);
mesh(new THREE.TorusKnotGeometry(0.3, 0.085, 160, 16, 2, 3), ckMat, closeKnot);
mesh(new THREE.TorusKnotGeometry(0.24, 0.07, 160, 16, 3, 4), ckMat, closeKnot, [0.05, 0.04, 0], null, [1.1, 0.5, 0.2]);
const flatGlow = (tex) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(KC.x, 0.03, KC.z); closeSet.add(m); return m; };
const painGlow = flatGlow(TEX.painGlow), goodGlow = flatGlow(TEX.goodGlow);
const painRings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.57, 64), new THREE.MeshBasicMaterial({ color: HEX.coral, transparent: true, depthWrite: false, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(KC.x, 0.05, KC.z); closeSet.add(r); return r; });
const closeBang = sprite(TEX.bang, 0.55); closeSet.add(closeBang);
const closeCheck = sprite(TEX.check, 0.45); closeSet.add(closeCheck);
const inflam = [V3(0.75, 0, 0.75), V3(-0.7, 0, 0.55), V3(0.15, 0, 1.15), V3(-0.25, 0, -0.35)].map(p => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.inflam, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.copy(p); closeSet.add(m); return m; });
const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xA9D4F0, roughness: 0.05, transparent: true, opacity: 0.8, clearcoat: 1 });
const drops = []; { const R = rng(5); for (let i = 0; i < 12; i++) { const m = mesh(sph, dropMat, closeSet); const a = R() * 6.28, r = 0.3 + R() * 0.8; drops.push({ m, to: V3(KC.x + Math.cos(a) * r, 0.06, KC.z + Math.sin(a) * r * 0.7), d: R() * 0.8, s: 0.06 + R() * 0.05 }); } }
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1f, roughness: 1 });
const dirt = []; { const R = rng(9); for (let i = 0; i < 30; i++) { const m = mesh(new THREE.IcosahedronGeometry(1, 0), dirtMat, closeSet); const a = R() * 6.28, r = 0.2 + R() * 0.5; dirt.push({ m, off: V3(Math.cos(a) * r, (R() - 0.3) * 0.6, Math.sin(a) * r * 0.8), d: R() * 0.6, s: 0.03 + R() * 0.04, rot: R() * 6 }); } }
const skinTone = new THREE.MeshStandardMaterial({ color: 0xE8B98C, roughness: 0.6 });
const hand = new THREE.Group(); closeSet.add(hand);
mesh(sph, skinTone, hand, [1.25, 0.35, 0.3], [0.55, 0.32, 0.45]);
mesh(new THREE.CapsuleGeometry(0.1, 0.75, 8, 16), skinTone, hand, [0.55, 0.36, 0.62], null, [0, 0.15, Math.PI / 2]);
mesh(new THREE.CapsuleGeometry(0.11, 0.6, 8, 16), skinTone, hand, [0.6, 0.32, -0.1], null, [0, -0.2, Math.PI / 2]);
mesh(sph, new THREE.MeshStandardMaterial({ color: 0xFBE3D6, roughness: 0.3 }), hand, [0.2, 0.38, 0.66], [0.06, 0.08, 0.05]);
const comb = new THREE.Group(); closeSet.add(comb);
mesh(new RoundedBoxGeometry(1.7, 0.26, 0.12, 3, 0.05), M.azul, comb, [0, 0.13, 0]);
for (let i = 0; i < 17; i++) mesh(new RoundedBoxGeometry(0.05, 0.42, 0.06, 2, 0.02), M.azul, comb, [-0.78 + i * 0.0975, -0.2, 0]);
const closeSparks = []; for (let i = 0; i < 24; i++) { const s = sprite(TEX.spark, 0.25); closeSet.add(s); closeSparks.push(s); }

function skinDisp(x, z, bulge) { const dx = x - KC.x, dz = z - KC.z; return bulge * Math.exp(-(dx * dx + dz * dz) / 0.35); }
function updateSkin(bulge) {
  const p = skinGeo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) p[i + 1] = skinBase[i + 1] + skinDisp(skinBase[i], skinBase[i + 2], bulge);
  skinGeo.attributes.position.needsUpdate = true; skinGeo.computeVertexNormals();
}
function updateHair(t, st) {
  const K = V3(KC.x, st.knotY, KC.z);
  STR.forEach((s, i) => {
    const w = s.conv * st.T;
    const ry = skinDisp(s.x, s.z, st.bulge);
    const R0 = V3(s.x, ry, s.z);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const sw = Math.sin(t * 1.4 + s.ph + u * 2) * s.sway * u * u;
      const F = V3(s.x + sw + s.lean * u * u, ry + u * s.L, s.z + Math.cos(t * 1.2 + s.ph) * 0.06 * u);
      let Cp;
      if (u <= 0.5) { const e = easeInOut(u / 0.5); Cp = R0.clone().lerp(K.clone().add(s.off.clone().multiplyScalar(0.55)), e); Cp.y = lerp(ry, K.y + s.off.y * 0.5, Math.sin(e * Math.PI / 2)); }
      else { const e = (u - 0.5) / 0.5; Cp = K.clone().add(s.off.clone().multiplyScalar(0.55 + e * 1.4)); Cp.y += e * 0.95 + sw * 0.5; Cp.x += sw; }
      pts.push(F.lerp(Cp, w));
    }
    hairMeshes[i].geometry.dispose();
    hairMeshes[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.024, 5, false);
  });
  closeKnot.position.copy(K);
  closeKnot.scale.setScalar(Math.max(0.001, st.knotScale));
  closeKnot.rotation.set(t * 0.5, t * 0.7, 0.3);
  updateSkin(st.bulge);
}

// ================================================================ SET: CALENDARIO
const calSet = new THREE.Group(); scene.add(calSet);
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
mesh(new RoundedBoxGeometry(3.3, 2.9, 0.2, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.4 }), calSet, [0, 1.75, -0.2]);
mesh(new RoundedBoxGeometry(3.3, 0.6, 0.3, 4, 0.12), M.azul, calSet, [0, 3.0, -0.12]);
const calTitle = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.45), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(1024, 180, (g) => { g.fillStyle = '#fff'; g.font = TITLE(120, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Semana', 512, 96); }) }));
calTitle.position.set(0, 3.0, 0.04); calSet.add(calTitle);
for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 12), new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 1, roughness: 0.2 }), calSet, [s * 1.0, 3.35, -0.05]);
const dayCubes = DAYS.map((d, i) => {
  const g = new THREE.Group(); calSet.add(g);
  const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4, n = row ? 3 : 4;
  g.position.set((col - (n - 1) / 2) * 0.78, row ? 1.0 : 2.0, 0.05);
  const mat = new THREE.MeshPhysicalMaterial({ color: HEX.crema, roughness: 0.35, clearcoat: 0.6 });
  mesh(new RoundedBoxGeometry(0.66, 0.66, 0.3, 4, 0.1), mat, g);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(256, 256, (c) => { c.fillStyle = C.grafito; c.font = TITLE(160, 800); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d, 128, 140); }) }));
  lbl.position.z = 0.16; g.add(lbl);
  const chk = sprite(TEX.check, 0.36); chk.position.set(0.26, 0.26, 0.25); g.add(chk);
  return { g, mat, chk };
});
const calBrush = makeBrush(); calBrush.scale.setScalar(0.7); calSet.add(calBrush);

// ================================================================ SET: AVISO (no tijeras → nuestras manos)
const warnSet = new THREE.Group(); scene.add(warnSet);
const steel = new THREE.MeshPhysicalMaterial({ color: 0xE6EBF2, metalness: 1, roughness: 0.18 });
const bladeShape = new THREE.Shape(); bladeShape.moveTo(0, -0.07); bladeShape.lineTo(1.5, -0.01); bladeShape.quadraticCurveTo(1.6, 0.0, 1.5, 0.05); bladeShape.lineTo(0, 0.12); bladeShape.lineTo(-0.2, 0.05); bladeShape.closePath();
const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
const scissors = new THREE.Group(); warnSet.add(scissors);
const blades = [1, -1].map(s => { const g = new THREE.Group(); scissors.add(g); mesh(bladeGeo, steel, g, [0, 0, s * 0.03]); mesh(new THREE.BoxGeometry(0.5, 0.07, 0.05), steel, g, [-0.35, -s * 0.12, s * 0.03], null, [0, 0, s * 0.45]); mesh(new THREE.TorusGeometry(0.2, 0.06, 12, 32), M.grafito, g, [-0.75, -s * 0.3, s * 0.03], [1, 0.8, 1]); return g; });
mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 20), M.amarillo, scissors, [0, 0, 0], null, [Math.PI / 2, 0, 0]);
const noSign = new THREE.Group(); warnSet.add(noSign);
const noMat = new THREE.MeshPhysicalMaterial({ color: HEX.coral, roughness: 0.3, clearcoat: 1 });
mesh(new THREE.TorusGeometry(1.25, 0.13, 20, 80), noMat, noSign);
mesh(new RoundedBoxGeometry(2.45, 0.24, 0.2, 3, 0.08), noMat, noSign, [0, 0, 0], null, [0, 0, -Math.PI / 4]);
const careHeart = mesh(heartGeo, heartWhite, warnSet);
const careHands = [-1, 1].map(s => { const g = new THREE.Group(); warnSet.add(g); mesh(sph, M.crema, g, [0, 0, 0], [0.55, 0.26, 0.4]); mesh(new THREE.CapsuleGeometry(0.11, 0.45, 6, 12), M.crema, g, [s * -0.3, 0.2, 0.15], null, [0.3, 0, s * 0.9]); return g; });

// ================================================================ actualización por escena
const SETS = [dogSet, giftSet, closeSet, calSet, warnSet, baSet];
function show(...on) { SETS.forEach(s => s.visible = on.includes(s)); }
function cam(pos, look, fov = 38) { camera.position.copy(pos); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); }
function groundColor(hex, vis = true) { ground.visible = vis; M.ground.color.setHex(hex); }

function sceneHook(t, lt, dur) {
  // Gancho 0–2 s: el perrito y un problema que el dueño reconoce. Sin logo, movimiento suave.
  show(dogSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  dog.g.rotation.y = -0.55; brush.visible = false; hearts.forEach(h => h.visible = false); deadHair.visible = false; sparkPool.forEach(s => s.visible = false);
  dog.setKnots(t, 1.2, 1); dog.bow.visible = false;
  dog.pose(t, { mood: -0.9, pain: 0.6, tilt: 0.12, messy: 1 });
  bang.visible = lt < 1.9; bang.scale.setScalar(0.5 * pop(0.2, lt, 0.4) * (1 - ss(1.5, 1.9, lt)) + 0.001); bang.position.set(1.15, 3.2 + Math.sin(t * 3) * 0.04, 0.3);
  const kp = dog.knots[0].g.getWorldPosition(V3()); const hp = dog.head.getWorldPosition(V3()); const mid = kp.clone().lerp(hp, 0.4);
  const e = easeInOut(lt / dur);
  cam(V3(0.5, 2.1, 7.6).lerp(mid.clone().add(V3(0.6, 0.2, 6.0)), e), V3(0, 1.75, 0).lerp(mid.clone().add(V3(-0.1, -0.1, 0)), e), 38);
}

function sceneIntro(t, lt, dur) {
  show(giftSet); scene.background = BG.azul; groundColor(0x2A73A5);
  giftBox.position.y = 0; giftBox.rotation.set(0, Math.sin(t * 1.1) * 0.25 - 0.2, 0);
  lid.position.set(0, 1.2 + Math.max(0, Math.sin(t * 5)) * 0.04, 0); lid.rotation.set(0, 0, 0);
  giftBox.scale.setScalar(pop(0, lt, 0.6));
  lock.visible = true; lock.position.y = 0.62; shackle.position.y = 0.21; shackle.rotation.y = 0;
  quest.visible = true; quest.scale.setScalar(0.7 * pop(0.5, lt)); quest.position.set(0.0, 2.25 + Math.sin(t * 2.5) * 0.06, 0.3);
  giftSparks.forEach((s, i) => { const a = i / giftSparks.length * 6.28 + t * 0.35; const r = 1.6 + 0.2 * Math.sin(i * 3 + t * 2); s.visible = true; s.position.set(Math.cos(a) * r, 0.9 + Math.sin(i * 1.7 + t * 1.2) * 0.9, Math.sin(a) * r); s.scale.setScalar(0.16 * (0.5 + 0.5 * Math.sin(t * 4 + i))); });
  glowBurst.visible = false;
  const o = lt / dur;
  cam(V3(Math.sin(o * 0.6 - 0.3) * 6.6, 2.5 - o * 0.3, Math.cos(o * 0.6 - 0.3) * 6.6), V3(0, 1.05, 0), 40);
}

function closeDefaults() {
  inflam.forEach(m => m.visible = false); drops.forEach(d => d.m.visible = false); dirt.forEach(d => d.m.visible = false);
  hand.visible = false; comb.visible = false; closeSparks.forEach(s => s.visible = false);
  closeBang.visible = false; closeCheck.visible = false; goodGlow.visible = false; painGlow.visible = true; painRings.forEach(r => r.visible = true);
  skinMat.color.setHex(0xF6C2B2); ckMat.emissiveIntensity = 0;
}
function painFx(t, amount) {
  painGlow.material.opacity = amount * (0.55 + 0.35 * Math.sin(t * 5)); painGlow.scale.setScalar(1 + 0.1 * Math.sin(t * 5));
  painRings.forEach((r, i) => { const f = (t * 0.9 + i / 3) % 1; r.scale.setScalar(0.5 + f * 2.2); r.material.opacity = (1 - f) * amount * 0.9; });
  ckMat.emissiveIntensity = amount * (0.2 + 0.15 * Math.sin(t * 5));
}

function sceneProblema(t, lt, dur) {
  show(closeSet); scene.background = BG.grafito; groundColor(0, false); closeDefaults();
  const r0 = RANGES.problema[0];
  const form = ss(0.1, 1.3, lt);
  const tAp = wt('problema', 'aprietan') - r0, tPiel = wt('problema', 'piel') - r0, tJ = wt('problema', 'jalan') - r0;
  const tighten = ss(tAp - 0.2, tPiel + 0.2, lt);
  const pull = lt > tJ - 0.2 ? Math.pow(Math.max(0, Math.sin((lt - tJ + 0.2) * 4.2)), 2) : 0;
  updateHair(t, { T: form, knotY: lerp(1.55, 1.05, tighten) + pull * 0.3, bulge: (0.08 * tighten + pull * 0.28) * form, knotScale: easeOutBack(form) * lerp(1.15, 0.9, tighten) });
  painFx(t, Math.max(tighten * 0.35, pull) * form);
  closeBang.visible = pull > 0.25; closeBang.position.set(0.75, 2.2, 0.6); closeBang.scale.setScalar(0.5 * (0.8 + pull * 0.3));
  const o = lt / dur;
  cam(V3(lerp(-1.4, 1.2, easeInOut(o)), 1.9 - o * 0.2, 4.9 - o * 0.5), V3(0, 1.0, 0.2), 40);
}

function sceneDano(t, lt, dur) {
  show(closeSet); scene.background = BG.grafito; groundColor(0, false); closeDefaults();
  const r0 = RANGES.dano[0];
  const pull = Math.pow(Math.max(0, Math.sin(lt * 3.6)), 2);
  const st = { T: 1, knotY: 0.95 + pull * 0.22, bulge: 0.1 + pull * 0.18, knotScale: 0.9 };
  updateHair(t, st); painFx(t, 0.55 + 0.35 * pull);
  const tIrr = wt('dano', 'irritacion') - r0, tHum = wt('dano', 'humedad') - r0, tSuc = wt('dano', 'suciedad') - r0, tHer = wt('dano', 'heridas') - r0;
  skinMat.color.setHex(0xF6C2B2).lerp(new THREE.Color(0xEE9A8E), ss(tIrr - 0.3, tIrr + 0.6, lt));
  inflam.forEach((m, i) => { const a = ss(tIrr - 0.2 + i * 0.15, tIrr + 0.5 + i * 0.15, lt); m.visible = a > 0; m.position.y = skinDisp(m.position.x, m.position.z, st.bulge) + 0.012; m.scale.setScalar((0.55 + 0.35 * a) * (1 + 0.05 * Math.sin(t * 5 + i))); m.material.opacity = a * (lt > tHer ? 1 : 0.7); });
  drops.forEach(d => { const a = (lt - tHum - d.d) / 0.6; d.m.visible = a > 0; if (a <= 0) return; const e = clamp(a); d.m.position.set(d.to.x, lerp(2.6, skinDisp(d.to.x, d.to.z, st.bulge) + d.s * 0.7, e * e), d.to.z); d.m.scale.set(d.s, d.s * (a > 1 ? 0.7 : 1.3), d.s); });
  const K = V3(KC.x, st.knotY, KC.z);
  dirt.forEach(d => { const a = pop(tSuc + d.d, lt, 0.4); d.m.visible = lt > tSuc + d.d; d.m.position.copy(K).add(d.off); if (d.off.y < -0.25) d.m.position.y = skinDisp(d.m.position.x, d.m.position.z, st.bulge) + 0.03; d.m.scale.setScalar(d.s * a); d.m.rotation.set(d.rot, d.rot * 2, 0); });
  const o = lt / dur;
  cam(V3(lerp(1.1, -0.5, easeInOut(o)), lerp(2.3, 1.8, o), lerp(4.1, 3.4, o)), V3(0, 0.75, 0.4), 40);
}

function sceneTruco(t, lt, dur) {
  show(closeSet); scene.background = BG.crema; groundColor(0, false); closeDefaults();
  const r0 = RANGES.truco[0];
  const tSuj = wt('truco', 'sujeta') - r0, tDes = wt('truco', 'desenreda') - r0;
  const combStart = tDes - 0.1, strokes = 4, sd = Math.max(0.55, (dur - 0.6 - combStart) / strokes);
  const ci = clamp((lt - combStart) / (sd * strokes)) * strokes;
  const T = 1 - ss(0, strokes, ci);
  updateHair(t, { T: Math.max(T, 0.0001), knotY: 1.0 + (1 - T) * 0.3, bulge: 0.06 * T * (lt < tSuj ? 1 : 0), knotScale: 0.9 * ss(0.05, 0.5, T) * (1 - 0.15 * (1 - T)) });
  painFx(t, (1 - ss(tSuj - 0.2, tSuj + 0.4, lt)) * 0.4);
  const hIn = easeOutCubic((lt - tSuj + 0.2) / 0.7);
  hand.visible = lt > tSuj - 0.2; hand.position.set(lerp(2.4, 0, hIn), 0, 0);
  comb.visible = lt > combStart - 0.4;
  const k = Math.floor(ci), f = ci - k, top = 3.0, bottom = lerp(2.2, 0.6, clamp(k / (strokes - 1)));
  comb.position.set(0.0, lt < combStart ? lerp(3.8, top, ss(combStart - 0.4, combStart, lt)) : lerp(top, bottom, easeInOut(Math.min(1, f * 1.2))), 0.25);
  comb.rotation.set(0.1, 0, Math.sin(t * 2.5) * 0.04);
  const done = ss(0.15, 0, T);
  closeCheck.visible = done > 0; closeCheck.position.set(0.5, 1.7, 0.8); closeCheck.scale.setScalar(0.28 * easeOutBack(done));
  goodGlow.visible = done > 0; goodGlow.material.opacity = done * 0.6;
  closeSparks.forEach((s, i) => { const R = rng(i + 99); s.visible = done > 0; s.position.set((R() - 0.5) * 2.4, 0.4 + R() * 2.4, (R() - 0.2) * 1.2); s.scale.setScalar(0.22 * done * (0.5 + 0.5 * Math.sin(t * 5 + i))); });
  const o = lt / dur;
  cam(V3(lerp(0.8, -0.6, easeInOut(o)), 2.0, lerp(5.4, 4.9, o)), V3(0, 1.2, 0.2), 40);
}

function sceneFrecuencia(t, lt, dur) {
  show(calSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  const r0 = RANGES.frecuencia[0];
  const tDos = wt('frecuencia', 'dos') - r0;
  calSet.scale.setScalar(pop(0, lt, 0.5)); calSet.rotation.y = Math.sin(t * 1.0) * 0.12;
  const picks = [0, 2, 4];
  dayCubes.forEach((d, i) => {
    const pi = picks.indexOf(i);
    const aOn = pi >= 0 ? ss(tDos + pi * 0.3, tDos + pi * 0.3 + 0.25, lt) : 0;
    d.mat.color.setHex(HEX.crema).lerp(new THREE.Color(HEX.amarillo), aOn);
    const pj = pi >= 0 ? pop(tDos + pi * 0.3, lt, 0.35) : 0;
    d.g.position.z = 0.05 + 0.22 * Math.sin(clamp(pj) * Math.PI);
    d.chk.visible = aOn > 0.5; d.chk.scale.setScalar(0.36 * aOn);
  });
  const idx = picks[clamp(Math.floor((lt - tDos) / 0.3), 0, 2)];
  const tgt = dayCubes[lt < tDos ? 0 : idx].g.position;
  calBrush.position.set(tgt.x + 0.25, tgt.y - 0.42 - Math.abs(Math.sin(t * 6)) * 0.12, 0.75); calBrush.rotation.set(0.3, -0.4, 0.25);
  cam(V3(0.4, 2.2, 9.4 - lt * 0.12), V3(0, 1.95, 0), 40);
}

function sceneAviso(t, lt, dur) {
  show(warnSet); scene.background = BG.azul; groundColor(0, false);
  const r0 = RANGES.aviso[0];
  const tNo = wt('aviso', 'no') - r0, tDej = wt('aviso', 'dejalo') - r0;
  const swap = ss(tDej - 0.2, tDej + 0.4, lt);
  scissors.visible = swap < 1; scissors.position.set(0, 1.8, 0); scissors.scale.setScalar(pop(0, lt) * (1 - swap));
  const snip = Math.abs(Math.sin(t * 5)) * 0.32;
  blades[0].rotation.z = snip; blades[1].rotation.z = -snip;
  scissors.rotation.set(0.2, Math.sin(t * 1.2) * 0.35, -0.5);
  noSign.visible = swap < 1; noSign.position.set(0.1, 1.8, 0.35); noSign.scale.setScalar(easeOutBack((lt - tNo + 0.1) / 0.45) * (1 - swap)); noSign.rotation.y = Math.sin(t * 1.2) * 0.15;
  // "Déjalo en nuestras manos": manos que sostienen un corazón
  careHeart.visible = swap > 0; careHeart.position.set(0, 1.75 + Math.sin(t * 2) * 0.05, 0.1); careHeart.scale.setScalar(0.75 * easeOutBack(swap)); careHeart.rotation.y = Math.sin(t * 1.4) * 0.3;
  careHands.forEach((h, i) => { const s = i ? 1 : -1; h.visible = swap > 0; h.position.set(s * lerp(2.0, 0.5, easeOutCubic(swap)), 1.2, 0.2); h.scale.setScalar(0.75); h.rotation.set(0, 0, s * 0.35); });
  cam(V3(0, 2.0, 6.6 - lt * 0.1), V3(0, 1.85, 0), 40);
}

function brushPath(lt, strokeDur, k) {
  const f = (lt / strokeDur) % 1;
  const kn = dog.knots[k % 3];
  const d0 = kn.dir.clone().add(V3(-0.1, 0.45, 0.05)).normalize(), d1 = kn.dir.clone().add(V3(0.15, -0.45, -0.1)).normalize();
  const d = d0.clone().lerp(d1, easeInOut(f)).normalize();
  const T = dog.torso; const p = V3(d.x * T.s.x, d.y * T.s.y, d.z * T.s.z).multiplyScalar(1.12).add(T.c);
  return { p, d, f, lift: Math.sin(f * Math.PI) };
}

function sceneProceso(t, lt, dur) {
  // Proceso: cepillado con calma, perrito tranquilo.
  show(dogSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  bang.visible = false; hearts.forEach(h => h.visible = false); dog.bow.visible = false;
  dog.g.rotation.y = -0.5; brush.visible = true; deadHair.visible = true;
  const SD = 1.25; const k = Math.floor(lt / SD);
  const bp = brushPath(lt, SD, k);
  const wp = bp.p.clone(); dog.body.localToWorld(wp);
  const wd = bp.d.clone().applyQuaternion(dog.g.quaternion);
  brush.position.copy(wp).add(wd.clone().multiplyScalar(0.12 * (1 - bp.lift * 0.3) + 0.05));
  brush.quaternion.setFromUnitVectors(V3(0, -1, 0), wd.clone().negate()); brush.rotateY(1.2);
  brush.scale.setScalar(ss(0, 0.4, lt));
  dog.knots.forEach((kn, i) => { const tk = SD * (i + 0.5); const a = 1 - ss(tk - 0.4, tk + 0.1, lt); kn.g.visible = a > 0.01; kn.g.scale.setScalar(Math.max(0.001, a)); kn.ring.visible = kn.ring2.visible = false; });
  const calm = ss(SD * 0.5, SD * 3.2, lt);
  dog.pose(t, { mood: lerp(-0.4, 0.8, calm), wag: calm * 0.6, tilt: 0.08 * Math.sin(t * 1.5) * calm, messy: 1 - calm });
  sparkPool.forEach((s, j) => { const i = j % 3; const tk = SD * (i + 0.5); const age = lt - tk + 0.1; const R = rng(j + 1); s.visible = age > 0 && age < 0.9 && j < 30; if (!s.visible) return; const p = dog.knots[i].pos.clone(); dog.body.localToWorld(p); const d = V3(R() - 0.5, R() - 0.3, R() - 0.5).normalize(); s.position.copy(p).add(d.multiplyScalar(easeOutCubic(age / 0.9) * 0.7)); s.scale.setScalar(0.25 * (1 - age / 0.9)); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let j = 0; j < 40; j++) {
    const R = rng(j + 500); const ts = j * 0.2 + 0.3; const age = lt - ts;
    let p = V3(0, -10, 0);
    if (age > 0) { const b = brushPath(ts, SD, Math.floor(ts / SD)); const w = b.p.clone(); dog.body.localToWorld(w); const wdd = b.d.clone().applyQuaternion(dog.g.quaternion); w.add(wdd.multiplyScalar(0.2)); const vx = (R() - 0.5) * 0.6 + wdd.x * 0.4; p = V3(w.x + vx * age, Math.max(0.05, w.y + 0.4 * age - 2.6 * age * age), w.z + (R() + 0.3) * 0.5 * age); }
    q.setFromEuler(new THREE.Euler(j, j * 2, age * 2)); const r = 0.05 + R() * 0.04; m4.compose(p, q, V3(r, r * 0.6, r)); deadHair.setMatrixAt(j, m4);
  }
  deadHair.instanceMatrix.needsUpdate = true;
  const o = lt / dur;
  cam(V3(lerp(1.8, 1.0, easeInOut(o)), lerp(2.4, 2.6, o), lerp(8.0, 8.8, easeInOut(o))), V3(0.15, 2.0, 0), 40);
}

function sceneResultadoOpen(t, lt) {
  show(giftSet); scene.background = BG.azul; groundColor(0x2A73A5);
  giftBox.scale.setScalar(1); giftBox.rotation.set(0, -0.1, 0);
  const u = ss(0.05, 0.4, lt), v = ss(0.35, 0.9, lt);
  shackle.position.y = 0.21 + u * 0.12; shackle.rotation.y = u * 1.6;
  lock.visible = lt < 0.7; lock.position.y = 0.62 - ss(0.45, 0.7, lt) * 1.2;
  lid.position.set(v * 0.8, 1.2 + v * 2.4, 0); lid.rotation.set(-v * 0.6, 0, -v * 0.9);
  quest.visible = false;
  glowBurst.visible = true; glowBurst.scale.setScalar(0.5 + v * 5); glowBurst.material.opacity = v;
  giftSparks.forEach((s, i) => { const R = rng(i + 3); const d = V3(R() - 0.5, 0.6 + R(), R() - 0.5).normalize(); const e = easeOutCubic((lt - 0.4) / 0.9); s.visible = lt > 0.4; s.position.set(0, 1.4, 0).add(d.multiplyScalar(e * (2 + R() * 1.5))); s.scale.setScalar(0.32 * (1 - e * 0.7)); });
  const c = ss(0.5, OPEN, lt);
  cam(V3(0, 2.3 + c * 0.5, 6.0 - c * 4.2), V3(0, 1.2 + c * 0.4, 0), 40);
}

const BA = { before: V3(-0.98, 0, 0), after: V3(0.98, 0, 0) };
function sceneResultado(t, lt, dur) {
  if (lt < OPEN) return sceneResultadoOpen(t, lt);
  show(baSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  const l2 = lt - OPEN;
  dogBefore.g.position.copy(BA.before); dogBefore.g.scale.setScalar(0.78); dogBefore.g.rotation.y = 0.25;
  dogBefore.setKnots(t, 1.1, 0.6); dogBefore.pose(t, { mood: -0.8, pain: 0.4, tilt: 0.12, messy: 1 });
  dogAfter.g.position.copy(BA.after); dogAfter.g.scale.setScalar(0.78 * easeOutBack(l2 / 0.5)); dogAfter.g.rotation.y = -0.25;
  dogAfter.setKnots(t, 0, 0); dogAfter.pose(t, { mood: 1, wag: 1, bounce: 0.12, tilt: -0.12 + 0.06 * Math.sin(t * 2) });
  baSparks.forEach((s, i) => { const R = rng(i + 61); s.visible = true; s.position.set(BA.after.x + (R() - 0.5) * 1.8, 0.4 + R() * 2.4, (R() - 0.2) * 1.0); s.scale.setScalar(0.2 * (0.4 + 0.6 * Math.sin(t * 4 + i * 2)) * ss(0.2, 0.7, l2)); });
  cam(V3(0, 2.0, 9.6 - l2 * 0.15), V3(0, 1.45, 0), 40);
}

function sceneCta(t, lt, dur) {
  show(dogSet); scene.background = BG.azul; groundColor(0x2A73A5);
  bang.visible = false; brush.visible = false; deadHair.visible = false; sparkPool.forEach(s => s.visible = false);
  dog.setKnots(t, 0, 0); dog.bow.visible = true;
  dog.g.rotation.y = Math.sin(t * 1.0) * 0.2;
  dog.pose(t, { mood: 1, wag: 1, bounce: 0.2, tilt: 0.12 * Math.sin(t * 2) });
  hearts.forEach((h, i) => { const R = rng(i + 31); const per = 2.4, age = ((lt - R() * per) % per + per) % per; h.visible = true; h.position.set((R() - 0.5) * 3.2, 1.2 + age * 1.5, -0.6 + R() * 1.0); h.rotation.set(0, Math.sin(t * 2 + i) * 0.6, Math.sin(t * 1.5 + i) * 0.2); h.scale.setScalar(0.28 * Math.sin(clamp(age / per) * Math.PI) + 0.001); });
  cam(V3(Math.sin(lt * 0.3) * 1.0, 2.4, 8.4), V3(0, 1.5, 0), 40);
}

function sceneCierre() { show(); scene.background = BG.azul; groundColor(0, false); cam(V3(0, 2, 6), V3(0, 2, 0)); }

const SCENES = { hook: sceneHook, intro: sceneIntro, problema: sceneProblema, dano: sceneDano, truco: sceneTruco, frecuencia: sceneFrecuencia, aviso: sceneAviso, proceso: sceneProceso, resultado: sceneResultado, cta: sceneCta, cierre: sceneCierre };
function sceneAt(t) { for (const id of ORDER) if (t >= RANGES[id][0] && t < RANGES[id][1]) return id; return ORDER[ORDER.length - 1]; }

// ================================================================ OVERLAY 2D (Manual CANIS)
const out = document.getElementById('out'); const ctx = out.getContext('2d');
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// palabras clave marcadas entre *asteriscos* (pueden abarcar varias palabras)
function markKeys(words) {
  let on = false;
  return words.map(w => { if (/^[¿¡]?\*/.test(w)) on = true; const r = { w: w.replace(/\*/g, ''), key: on }; if (/\*[.,:;?!]*$/.test(w)) on = false; return r; });
}
function wrapWords(words, font, maxW) {
  ctx.font = font; const lines = []; let cur = [];
  for (const w of words) { const test = [...cur, w].map(x => x.w).join(' '); if (ctx.measureText(test).width > maxW && cur.length) { lines.push(cur); cur = [w]; } else cur.push(w); }
  if (cur.length) lines.push(cur); return lines;
}
function lt0(id, t) { return t - RANGES[id][0] - (id === 'resultado' ? OPEN : 0); }

function drawWatermark(t, id) {
  // Ícono ~90 px, arriba a la derecha, debajo de los 220 px, opacidad 85 %. No en el gancho ni en el cierre.
  if (t < 2 || id === 'cierre') return;
  const dark = DARK[id] || (id === 'resultado' && lt0(id, t) < 0);
  const img = dark ? LOGO.iconoBlanco : LOGO.iconoAzul; const w = 90, h = w * img.height / img.width;
  ctx.save(); ctx.globalAlpha = 0.85 * ss(2, 2.4, t); ctx.drawImage(img, W - MARGIN - w, SAFE_TOP + 16, w, h); ctx.restore();
}

function drawHeadline(t, id) {
  // Título de escena: Fraunces, máximo 2 líneas, en placa crema/blanca con texto grafito.
  const s = SEG[id]; if (!s.caption) return;
  const lt = lt0(id, t); if (lt < 0) return;
  const k = easeOutBack(lt / 0.45);
  const words = markKeys(s.caption.split(' '));
  const fs = 64, lh = 76; const lines = wrapWords(words, TITLE(fs), W - 2 * MARGIN - 200);
  ctx.font = TITLE(fs);
  const boxW = Math.max(...lines.map(l => ctx.measureText(l.map(x => x.w).join(' ')).width)) + 72, boxH = lines.length * lh + 36;
  ctx.save(); ctx.translate(W / 2, 400 + boxH / 2); ctx.scale(k, k);
  ctx.shadowColor = 'rgba(62,66,71,0.18)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
  ctx.fillStyle = DARK[id] ? C.crema : C.blanco; rrect(-boxW / 2, -boxH / 2, boxW, boxH, 30); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.textBaseline = 'middle';
  lines.forEach((l, li) => {
    let x = -ctx.measureText(l.map(w => w.w).join(' ')).width / 2; const y = -boxH / 2 + 18 + lh * li + lh / 2 + 2;
    l.forEach(w => { ctx.fillStyle = w.key ? C.azul : C.grafito; ctx.fillText(w.w, x, y); x += ctx.measureText(w.w + ' ').width; });
  });
  ctx.restore();
}

function drawSubs(t) {
  // Subtítulo siempre: píldora grafito + texto blanco (Nunito 800, 48 px), palabra clave en amarillo, ≤ 6 palabras.
  for (const s of TL.segments) {
    if (!s.sub || t < s.start - 0.05 || t > s.end + 0.35) continue;
    const ws = SUBW[s.id]; const marked = markKeys(ws.map(w => w.w)); const chunks = []; let cur = [];
    ws.forEach((w, i) => { cur.push({ s: w.s, ...marked[i] }); const brk = /[,.?!:]\**$/.test(w.w) || cur.length >= 7; if (brk || i === ws.length - 1) { chunks.push(cur); cur = []; } });
    if (t < chunks[0][0].s - 0.05) return;
    let ci = chunks.length - 1; for (let i = 0; i < chunks.length - 1; i++) if (t < chunks[i + 1][0].s - 0.05) { ci = i; break; }
    const ch = chunks[ci];
    const fs = 48; const lines = wrapWords(ch, TEXT(fs), W - 2 * MARGIN - 80); ctx.font = TEXT(fs);
    const lh = 62, padY = 22; const boxW = Math.max(...lines.map(l => ctx.measureText(l.map(x => x.w).join(' ')).width)) + 64, boxH = lines.length * lh + padY * 2;
    const a = ss(ch[0].s - 0.08, ch[0].s + 0.06, t);
    ctx.save(); ctx.globalAlpha = Math.max(a, ci > 0 ? 1 : 0); ctx.translate(W / 2, SAFE_BOTTOM - 70 - boxH / 2);
    ctx.fillStyle = C.grafito; rrect(-boxW / 2, -boxH / 2, boxW, boxH, Math.min(44, boxH / 2)); ctx.fill();
    ctx.textBaseline = 'middle';
    lines.forEach((l, li) => {
      let x = -ctx.measureText(l.map(w => w.w).join(' ')).width / 2; const y = -boxH / 2 + padY + lh * li + lh / 2 + 2;
      l.forEach(w => { ctx.fillStyle = w.key ? C.amarillo : C.blanco; ctx.fillText(w.w, x, y); x += ctx.measureText(w.w + ' ').width; });
    });
    ctx.restore(); return;
  }
}

function drawLock(x, y, s, open, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = 7; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); if (open) ctx.arc(10, -14, 13, Math.PI, 0); else ctx.arc(0, -14, 13, Math.PI, 0); ctx.lineTo(open ? 23 : 13, -2); ctx.moveTo(open ? -3 : -13, -14); ctx.lineTo(open ? -3 : -13, -2); ctx.stroke();
  rrect(-20, -6, 40, 32, 7); ctx.fill(); ctx.restore();
}

function drawRetention(t) {
  // Promesa "quédate hasta el final": barra de progreso hasta la recompensa (antes y después).
  const tShow = wt('intro', 'final') + 0.2, tReward = RANGES.resultado[0] + 0.5, tHide = SEG.resultado.end + 1.0;
  if (t < tShow || t > tHide) return;
  const k = easeOutBack((t - tShow) / 0.5); const unlocked = t >= tReward;
  const fade = 1 - ss(tHide - 0.4, tHide, t);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(W / 2 - 40, SAFE_TOP + 66); ctx.scale(k, k);
  const label = unlocked ? '¡Así quedó Canela!' : 'Antes y después, al final';
  ctx.font = TEXT(40); const tw = ctx.measureText(label).width; const w = tw + 120, h = 78;
  ctx.fillStyle = unlocked ? C.azul : C.grafito; rrect(-w / 2, -h / 2, w, h, 39); ctx.fill();
  drawLock(-w / 2 + 48, 2, 0.95, unlocked, unlocked ? C.blanco : C.amarillo);
  ctx.fillStyle = C.blanco; ctx.textBaseline = 'middle'; ctx.fillText(label, -w / 2 + 86, 3);
  if (!unlocked) {
    const p = clamp((t - tShow) / (tReward - tShow));
    ctx.fillStyle = 'rgba(62,66,71,0.25)'; rrect(-w / 2 + 30, h / 2 + 12, w - 60, 10, 5); ctx.fill();
    ctx.fillStyle = C.amarillo; rrect(-w / 2 + 30, h / 2 + 12, Math.max(10, (w - 60) * p), 10, 5); ctx.fill();
  }
  ctx.restore();
}

function chip(x, y, text, k, mark) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.font = TEXT(44, 700);
  const w = ctx.measureText(text).width + 116, h = 76;
  ctx.shadowColor = 'rgba(62,66,71,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.fillStyle = C.blanco; rrect(0, -h / 2, w, h, 38); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.azul; ctx.beginPath(); ctx.arc(40, 0, 25, 0, 7); ctx.fill();
  ctx.strokeStyle = C.blanco; ctx.fillStyle = C.blanco; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mark === '✓') { ctx.beginPath(); ctx.moveTo(29, 1); ctx.lineTo(37, 9); ctx.lineTo(52, -8); ctx.stroke(); }
  else { ctx.font = TEXT(36); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark, 40, 2); ctx.textAlign = 'left'; ctx.font = TEXT(44, 700); }
  ctx.fillStyle = C.grafito; ctx.textBaseline = 'middle'; ctx.fillText(text, 80, 3);
  ctx.restore();
}

function project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; }
function namePlate(x, y, name, k) {
  // Nombre del perrito: placa crema + detalle coral (Fraunces).
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.font = TITLE(54);
  const w = ctx.measureText(name).width + 110, h = 84;
  ctx.shadowColor = 'rgba(62,66,71,0.2)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
  ctx.fillStyle = C.crema; rrect(-w / 2, -h / 2, w, h, 16); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.grafito; ctx.textBaseline = 'middle'; ctx.fillText(name, -w / 2 + 28, 4);
  ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(w / 2 - 34, 0, 13, 0, 7); ctx.fill();
  ctx.restore();
}
function pill(x, y, text, bg, fg, font, k = 1, padX = 34, h = 70) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.font = font; const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg; rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 3); ctx.restore();
}

function drawExtras(t, id) {
  if (id === 'truco') [['Sujeta cerca de la piel', 'sujeta'], ['De la punta a la raíz', 'desenreda']].forEach(([txt, w], i) => chip(MARGIN, 640 + i * 94, txt, easeOutBack((t - wt('truco', w)) / 0.4), String(i + 1)));
  if (id === 'proceso') [['Sin jalar', 'jalar'], ['Sin prisas', 'prisas'], ['Sin estrés', 'estres']].forEach(([txt, w], i) => chip(MARGIN, 640 + i * 94, txt, easeOutBack((t - wt('proceso', w)) / 0.4), '✓'));
  if (id === 'resultado' && lt0(id, t) >= 0) {
    const l2 = lt0(id, t);
    const pb = project(V3(BA.before.x, 3.05, 0)), pa = project(V3(BA.after.x, 3.05, 0));
    pill(pb.x, pb.y, 'Antes', C.grafito, C.blanco, TEXT(42), easeOutBack(l2 / 0.4));
    pill(pa.x, pa.y, 'Después', C.azul, C.blanco, TEXT(42), easeOutBack((l2 - 0.25) / 0.4));
    namePlate(pa.x, pa.y + 96, 'Canela', easeOutBack((t - wt('resultado', 'canela')) / 0.45));
  }
  if (id === 'cta') {
    // Promo: un sticker amarillo con texto grafito
    const k = easeOutBack((t - wt('cta', 'agenda') + 0.1) / 0.45);
    if (k > 0) {
      ctx.save(); ctx.translate(W / 2, 470); ctx.rotate(-0.04); ctx.scale(k, k);
      ctx.font = TITLE(84, 800); const tw = ctx.measureText('Agenda su cita').width; const w = tw + 100, h = 150;
      ctx.shadowColor = 'rgba(30,40,50,0.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.fillStyle = C.amarillo; rrect(-w / 2, -h / 2, w, h, 36); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = C.grafito; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Agenda su cita', 0, 6); ctx.restore();
    }
    const k2 = easeOutBack((t - wt('cta', 'escribenos')) / 0.45) * (1 + 0.025 * Math.sin(t * 4));
    pill(W / 2, 1090, '@canis.spacanino', C.grafito, C.amarillo, TEXT(50), k2, 44, 92);
    if (k2 > 0) { ctx.save(); ctx.globalAlpha = clamp(k2); ctx.font = TEXT(34, 700); ctx.fillStyle = C.blanco; ctx.textAlign = 'center'; ctx.fillText('Spa canino · Xalapa, Veracruz', W / 2, 1172); ctx.restore(); }
  }
}

function drawCierre(t) {
  // Cierre (2–3 s): fondo azul, logo blanco original (sin alterar) + slogan + usuario.
  const a = ss(RANGES.cierre[0], RANGES.cierre[0] + 0.35, t); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.azul; ctx.fillRect(0, 0, W, H);
  const lw = 640 * (0.94 + 0.06 * easeOutCubic((t - RANGES.cierre[0]) / 0.6)), lh = lw * LOGO.blanco.height / LOGO.blanco.width;
  ctx.drawImage(LOGO.blanco, W / 2 - lw / 2, 760 - lh / 2, lw, lh);
  ctx.fillStyle = C.blanco; ctx.font = TEXT(46, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Porque cuando una mascota se siente bien,', W / 2, 1040); ctx.fillText('su familia también.', W / 2, 1102);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = a; pill(W / 2, 1230, '@canis.spacanino', C.grafito, C.amarillo, TEXT(46), 1, 44, 88); ctx.restore();
}

// ================================================================ API de render
window.renderAt = function (t) {
  const id = sceneAt(t); const [a, b] = RANGES[id];
  SCENES[id](t, t - a, b - a);
  renderer.render(scene, camera);
  ctx.clearRect(0, 0, W, H); ctx.drawImage(glCanvas, 0, 0);
  if (id !== 'cierre') { drawHeadline(t, id); drawExtras(t, id); drawRetention(t); drawSubs(t); drawWatermark(t, id); }
  drawCierre(t);
  return id;
};
window.frameJpeg = function (t, q = 0.92) { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = TL.duration;
window.READY = true;
