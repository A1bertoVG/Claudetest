// Video 3D para CANIS Spa Canino: "El pelo dice lo que come" (alimentación → asesoría y venta en CANIS).
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
const CINDY = await loadImg('/caspa/assets/cindy.jpg'), AGRO = await loadImg('/caspa/assets/agrocentro-logo.png');
const BRANDS = await Promise.all([['Pro Plan', 'proplan', 'pro'], ['Virbac', 'virbac', 'virbac'], ['Royal Canin', 'royalcanin', 'royal'], ['Nupec', 'nupec', 'nupec'], ['Excellent', 'excellent', 'excellent']].map(async ([n, f, w]) => ({ n, w, img: await loadImg(`/alimentacion/assets/${f}.png`) })));

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
const OPEN = 1.3; // regalo que se abre al inicio del resultado
const DARK = { dato: 1, promesa: 1, cta: 1, cierre: 1 };

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

// ================================================================ CASPA: escamas, lupa, rascado
const flakeGeo = new THREE.CircleGeometry(1, 6);
const flakeMat = new THREE.MeshStandardMaterial({ color: 0xF8F5EE, roughness: 0.75, side: THREE.DoubleSide });
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const dogFlakes = new THREE.InstancedMesh(flakeGeo, flakeMat, 110);
{
  const R = rng(303), T = dog.torso; let i = 0;
  while (i < 110) {
    const u = V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (u.length() > 1 || u.length() < 0.1) continue; u.normalize(); if (u.y < 0.0 || u.z > 0.55) continue;
    const p = V3(u.x * T.s.x, u.y * T.s.y, u.z * T.s.z).multiplyScalar(1.1).add(T.c);
    const n = V3(u.x / T.s.x, u.y / T.s.y, u.z / T.s.z).normalize(); _q.setFromUnitVectors(V3(0, 0, 1), n); const r = 0.028 + R() * 0.03;
    _m4.compose(p, _q, V3(r, r * 0.8, r)); dogFlakes.setMatrixAt(i++, _m4);
  }
}
dog.body.add(dogFlakes);
const FALL = []; { const R = rng(404), T = dog.torso; for (let j = 0; j < 36; j++) { const u = V3(0.5 + R() * 0.5, R() * 0.9, R() * 0.6).normalize(); FALL.push({ p: V3(u.x * T.s.x, u.y * T.s.y, u.z * T.s.z).multiplyScalar(1.1).add(T.c), ph: R() * 2.2, dx: (R() - 0.3) * 0.4, s: 0.03 + R() * 0.025 }); } }
const fallFlakes = new THREE.InstancedMesh(flakeGeo, flakeMat, FALL.length); dogSet.add(fallFlakes);
function updateFall(t, on) {
  fallFlakes.visible = on; if (!on) return;
  FALL.forEach((f, j) => {
    const age = ((t - f.ph) % 2.2 + 2.2) % 2.2; const w = f.p.clone(); dog.body.localToWorld(w);
    const p = V3(w.x + f.dx * age + Math.sin(age * 5 + j) * 0.05, Math.max(0.02, w.y - 0.75 * age - 0.2 * age * age), w.z + 0.15 * age);
    _q.setFromEuler(new THREE.Euler(age * 3 + j, age * 2, j)); const s = f.s * (age < 0.1 ? age / 0.1 : 1);
    _m4.compose(p, _q, V3(s, s * 0.8, s)); fallFlakes.setMatrixAt(j, _m4);
  });
  fallFlakes.instanceMatrix.needsUpdate = true;
}
// pata trasera que rasca
const scratch = new THREE.Group(); scratch.position.set(0.72, 0.55, 0.05); dog.body.add(scratch);
mesh(new THREE.CapsuleGeometry(0.15, 0.55, 8, 16), M.fur, scratch, [0, 0.38, 0]);
mesh(sph, M.furLight, scratch, [0, 0.76, 0], [0.18, 0.14, 0.2]);
function scratchPose(t, amt) { scratch.visible = amt > 0.01; scratch.rotation.set(0.55 + Math.sin(t * 28) * 0.22 * amt, 0, -0.3); }
// lupa
const magn = new THREE.Group(); dogSet.add(magn);
mesh(new THREE.TorusGeometry(0.42, 0.055, 16, 48), M.grafito, magn);
magn.add(new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshPhysicalMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.22, roughness: 0, clearcoat: 1 })));
mesh(new THREE.CapsuleGeometry(0.06, 0.6, 6, 12), M.azul, magn, [0.42, -0.5, 0], null, [0, 0, 0.7]);
// dedos que separan el pelo
const fingers = new THREE.Group(); dogSet.add(fingers);
const skinTone2 = new THREE.MeshStandardMaterial({ color: 0xE8B98C, roughness: 0.6 });
for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.075, 0.5, 6, 12), skinTone2, fingers, [s * 0.12, 0, 0], null, [Math.PI / 2 - 0.3, 0, s * 0.25]);

// escamas sobre la piel (primer plano)
const SKF = []; { const R = rng(505); for (let i = 0; i < 70; i++) SKF.push({ x: (R() - 0.5) * 2.6, z: -0.4 + R() * 1.9, d: R() * 1.6, s: 0.08 + R() * 0.08, rot: R() * 6, dx: (R() - 0.5) * 0.5, early: i < 10 }); }
const skinFlakes = new THREE.InstancedMesh(flakeGeo, flakeMat, SKF.length); closeSet.add(skinFlakes);

// ================================================================ SET: CAUSAS (tarjetas)
const causeSet = new THREE.Group(); scene.add(causeSet);
function causeTex(label, icon) {
  return canvasTex(1024, 260, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 260);
    g.save(); g.translate(130, 130); icon(g); g.restore();
    g.fillStyle = C.grafito; g.font = TITLE(92, 700); g.textBaseline = 'middle'; g.fillText(label, 250, 138);
  });
}
const ICON = {
  seca: g => { g.fillStyle = C.azul; g.beginPath(); g.moveTo(0, -95); g.bezierCurveTo(50, -30, 75, 10, 75, 35); g.arc(0, 35, 75, 0, Math.PI); g.bezierCurveTo(-75, 10, -50, -30, 0, -95); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-10, -30); g.lineTo(12, 5); g.lineTo(-12, 30); g.lineTo(10, 70); g.stroke(); },
  poco: g => { g.fillStyle = C.azul; g.beginPath(); g.roundRect(-95, -15, 190, 80, 30); g.fill(); g.fillRect(-105, -25, 210, 22); g.fillRect(-70, 60, 18, 30); g.fillRect(52, 60, 18, 30); g.strokeStyle = C.azul; g.lineWidth = 12; g.beginPath(); g.moveTo(-80, -25); g.lineTo(-80, -85); g.lineTo(-40, -85); g.stroke(); },
  jabon: g => { g.strokeStyle = C.azul; g.fillStyle = 'rgba(47,128,183,0.18)'; g.lineWidth = 10; [[-30, 20, 55], [45, -30, 38], [40, 55, 26], [-55, -60, 22]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); }); },
};
const causeCards = [['Piel seca', ICON.seca], ['Poco baño', ICON.poco], ['Restos de jabón', ICON.jabon]].map(([l, ic], i) => {
  const g = new THREE.Group(); causeSet.add(g); g.position.set(0, 2.3 - i * 0.8, 0);
  mesh(new RoundedBoxGeometry(2.6, 0.66, 0.16, 4, 0.08), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.4 }), g);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 2.44 * 260 / 1024), new THREE.MeshBasicMaterial({ map: causeTex(l, ic) }));
  f.position.z = 0.085; g.add(f);
  return g;
});

// ================================================================ SET: ERROR (shampoo y pH)
const errSet = new THREE.Group(); scene.add(errSet);
function makeBottle(bodyMat, capMat, labelTex) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.42, 0.45, 1.25, 40), bodyMat, g, [0, 0.62, 0]);
  mesh(sph, bodyMat, g, [0, 1.25, 0], [0.42, 0.2, 0.42]);
  mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.22, 24), bodyMat, g, [0, 1.48, 0]);
  mesh(new RoundedBoxGeometry(0.34, 0.22, 0.34, 3, 0.06), capMat, g, [0, 1.68, 0]);
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.46, 0.7, 40, 1, true, -Math.PI * 0.45, Math.PI * 0.9), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.5 }));
  lab.position.y = 0.62; g.add(lab); return g;
}
const humanLabel = canvasTex(512, 256, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 256); g.fillStyle = C.grafito; g.font = TITLE(72, 800); g.textAlign = 'center'; g.fillText('Shampoo', 256, 110); g.font = TEXT(40, 700); g.fillText('para personas', 256, 175); });
const dogLabel = canvasTex(512, 256, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 256); const ih = 150, iw = ih * LOGO.iconoAzul.width / LOGO.iconoAzul.height; g.drawImage(LOGO.iconoAzul, 40, 53, iw, ih); g.fillStyle = C.grafito; g.font = TITLE(60, 800); g.fillText('Shampoo', 160, 120); g.font = TEXT(36, 700); g.fillText('para perro', 160, 175); });
const humanBottle = makeBottle(M.crema, M.grafito, humanLabel); errSet.add(humanBottle);
const errNo = new THREE.Group(); errSet.add(errNo);
{ const noMat = new THREE.MeshPhysicalMaterial({ color: HEX.coral, roughness: 0.3, clearcoat: 1 }); mesh(new THREE.TorusGeometry(1.05, 0.11, 20, 80), noMat, errNo); mesh(new RoundedBoxGeometry(2.05, 0.2, 0.18, 3, 0.07), noMat, errNo, [0, 0, 0], null, [0, 0, -Math.PI / 4]); }
const phBar = new THREE.Group(); errSet.add(phBar);
const phCols = (i) => { const c1 = new THREE.Color(HEX.coral), c2 = new THREE.Color(HEX.crema), c3 = new THREE.Color(HEX.azul); return i < 7 ? c1.lerp(c2, i / 7) : c2.lerp(c3, (i - 7) / 7); };
const phSegs = []; for (let i = 0; i < 14; i++) { const m = mesh(new RoundedBoxGeometry(0.19, 0.34, 0.16, 2, 0.05), new THREE.MeshPhysicalMaterial({ color: phCols(i), roughness: 0.35, clearcoat: 0.6 }), phBar, [-1.3 + i * 0.2, 0, 0]); phSegs.push(m); }
const phX = v => -1.3 + (v - 1) * 0.2; // posición del valor de pH (1–14) en la barra

// ================================================================ SET: BAÑO EN CANIS (tina, espuma, regadera, secadora)
const tubSet = new THREE.Group(); scene.add(tubSet);
const tubWhite = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 });
mesh(new RoundedBoxGeometry(2.8, 1.0, 1.8, 6, 0.3), tubWhite, tubSet, [0, 0.62, 0]);
const water = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 1.45), new THREE.MeshPhysicalMaterial({ color: 0xBFDDF0, roughness: 0.05, transparent: true, opacity: 0.92, clearcoat: 1 }));
water.rotation.x = -Math.PI / 2; water.position.y = 1.125; tubSet.add(water);
for (const [x, z] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) mesh(sph, M.azul, tubSet, [x, 0.1, z], [0.14, 0.12, 0.14]);
const tubDog = makeDog(7); tubDog.setKnots(0, 0, 0); tubDog.bow.visible = false; tubDog.g.position.set(0, -0.35, -0.1); tubDog.g.scale.setScalar(0.9); tubSet.add(tubDog.g);
function foamOn(parent, c, s, n, seed, cond) {
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.6 }), n);
  const R = rng(seed), list = []; let i = 0;
  while (i < n) { const u = V3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (u.length() > 1 || u.length() < 0.1) continue; u.normalize(); if (!cond(u)) continue; list.push({ p: V3(u.x * s.x, u.y * s.y, u.z * s.z).multiplyScalar(1.08).add(c), r: 0.07 + R() * 0.09, d: R() }); i++; }
  parent.add(im); return { im, list };
}
const foamBody = foamOn(tubDog.body, tubDog.torso.c, tubDog.torso.s, 150, 61, u => u.y > -0.15);
const foamHead = foamOn(tubDog.head, V3(0, 0, 0), V3(0.8, 0.72, 0.72), 60, 62, u => u.y > 0.35 && u.z < 0.5);
function setFoam(t, a) {
  for (const F of [foamBody, foamHead]) {
    F.im.visible = a > 0.01;
    F.list.forEach((f, i) => { const s = f.r * clamp(a * 1.6 - f.d * 0.6) * (1 + 0.05 * Math.sin(t * 3 + i)); _m4.compose(f.p, _q.identity(), V3(s, s, s)); F.im.setMatrixAt(i, _m4); });
    F.im.instanceMatrix.needsUpdate = true;
  }
}
const bubbles = []; { const R = rng(71); for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(sph, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transparent: true, opacity: 0.45, clearcoat: 1 })); tubSet.add(m); bubbles.push({ m, x: (R() - 0.5) * 2.6, z: (R() - 0.3) * 1.2, ph: R() * 3, s: 0.06 + R() * 0.08 }); } }
const dogBottle = makeBottle(M.azul, M.amarillo, dogLabel); dogBottle.scale.setScalar(0.65); tubSet.add(dogBottle);
const shower = new THREE.Group(); tubSet.add(shower);
const metal = new THREE.MeshPhysicalMaterial({ color: 0xd8dde5, metalness: 1, roughness: 0.22 });
mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.14, 32), metal, shower);
mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 12), metal, shower, [0.55, 0.45, 0], null, [0, 0, -1.0]);
const DROPS = []; { const R = rng(81); for (let i = 0; i < 70; i++) DROPS.push({ x: (R() - 0.5) * 0.6, z: (R() - 0.5) * 0.6, ph: R(), sp: 0.8 + R() * 0.4 }); }
const drops2 = new THREE.InstancedMesh(sph, new THREE.MeshPhysicalMaterial({ color: 0x9ccbea, roughness: 0, transparent: true, opacity: 0.85 }), DROPS.length); tubSet.add(drops2);
const dryer = new THREE.Group(); tubSet.add(dryer);
mesh(new THREE.CapsuleGeometry(0.26, 0.55, 8, 20), M.azul, dryer, [0, 0, 0], null, [0, 0, Math.PI / 2]);
mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.35, 24), M.grafito, dryer, [-0.6, 0, 0], null, [0, 0, Math.PI / 2]);
mesh(new THREE.CapsuleGeometry(0.1, 0.55, 6, 12), M.crema, dryer, [0.15, -0.42, 0], null, [0, 0, -0.2]);
const airLines = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.35, 4, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); m.rotation.z = Math.PI / 2; tubSet.add(m); airLines.push(m); }

// ================================================================ SET: FOTO (Cindy) y fondo neutro
const photoSet = new THREE.Group(); scene.add(photoSet);
const photoSparks = []; for (let i = 0; i < 26; i++) { const s = sprite(TEX.spark, 0.3); photoSet.add(s); photoSparks.push(s); }

// ================================================================ ALIMENTACIÓN: platos, croquetas, brillo del pelo
const KIB_OLD = new THREE.Color(0xC98545), KIB_NEW = new THREE.Color(0x6B3F1D);
const kibGeo = new THREE.IcosahedronGeometry(1, 0);
const kibMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
function makeBowl(fracNew = 0, seed = 1, n = 90) {
  const g = new THREE.Group();
  const prof = [[0, 0.02], [0.5, 0.0], [0.62, 0.05], [0.72, 0.36], [0.68, 0.39], [0.6, 0.11], [0.0, 0.11]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 56), M.azul, g);
  const im = new THREE.InstancedMesh(kibGeo, kibMat, n); im.castShadow = true; g.add(im);
  const R = rng(seed); const nNew = Math.round(n * fracNew); const col = new THREE.Color();
  const order = [...Array(n).keys()].sort(() => R() - 0.5);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * 0.52; const y = 0.14 + 0.2 * (1 - (r / 0.55) ** 2) * R();
    _q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)); const s = 0.06 + R() * 0.02;
    _m4.compose(V3(Math.cos(a) * r, y, Math.sin(a) * r), _q, V3(s, s * 0.7, s)); im.setMatrixAt(i, _m4);
    col.copy(order[i] < nNew ? KIB_NEW : KIB_OLD).offsetHSL(0, 0, (R() - 0.5) * 0.06); im.setColorAt(i, col);
  }
  g.userData.kib = im; return g;
}
const dogBowl = makeBowl(0, 5); dogSet.add(dogBowl);
// brillo del pelaje
const furMats = new Set(); dog.g.traverse(o => { if (o.isInstancedMesh && o.material !== flakeMat) furMats.add(o.material); });
function setShine(sh) { furMats.forEach(m => { m.roughness = lerp(0.95, 0.38, sh); }); M.fur.roughness = lerp(0.9, 0.42, sh); M.furLight.roughness = lerp(0.95, 0.5, sh); }
function dogSparkles(t, amt) { sparkPool.forEach((s, i) => { const R = rng(i + 900); s.visible = amt > 0.02 && i < 22; if (!s.visible) return; const p = V3((R() - 0.5) * 2.0, 0.5 + R() * 2.6, (R() - 0.2) * 1.2); dog.g.localToWorld(p); s.position.copy(p); s.scale.setScalar(0.24 * amt * (0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 1.3)))); }); }
// pelo que se cae
const HAIRFALL = []; { const R = rng(808), T = dog.torso; for (let j = 0; j < 30; j++) { const u = V3(0.3 + R() * 0.7, R() * 0.9 - 0.1, R() * 0.7).normalize(); HAIRFALL.push({ p: V3(u.x * T.s.x, u.y * T.s.y, u.z * T.s.z).multiplyScalar(1.1).add(T.c), ph: R() * 2.6, dx: (R() - 0.3) * 0.5, s: 0.04 + R() * 0.03 }); } }
function updateHairFall(t, on) {
  deadHair.visible = on; if (!on) return;
  HAIRFALL.forEach((f, j) => { const age = ((t - f.ph) % 2.6 + 2.6) % 2.6; const w = f.p.clone(); dog.body.localToWorld(w); const p = V3(w.x + f.dx * age, Math.max(0.03, w.y - 0.6 * age - 0.25 * age * age), w.z + 0.2 * age); _q.setFromEuler(new THREE.Euler(j, age * 2, j * 0.5)); _m4.compose(p, _q, V3(f.s, f.s * 0.5, f.s * 1.6)); deadHair.setMatrixAt(j, _m4); });
  for (let j = HAIRFALL.length; j < 40; j++) { _m4.makeTranslation(0, -10, 0); deadHair.setMatrixAt(j, _m4); }
  deadHair.instanceMatrix.needsUpdate = true;
}
// croquetas que viajan a la piel (primer plano)
const KTRIP = []; { const R = rng(909); for (let i = 0; i < 26; i++) KTRIP.push({ to: V3((R() - 0.5) * 2.2, 0.03, -0.3 + R() * 1.6), from: V3(-2.4 + R() * 0.6, 2.6 + R() * 0.8, 0.4 + R() * 0.6), d: R() * 1.4, s: 0.07 + R() * 0.04 }); }
const kibTrip = new THREE.InstancedMesh(kibGeo, new THREE.MeshStandardMaterial({ color: 0xC98545, roughness: 0.7, emissive: 0x3a2000, emissiveIntensity: 0.2 }), KTRIP.length); closeSet.add(kibTrip);

// ================================================================ SET: NUTRIENTES
const nutSet = new THREE.Group(); scene.add(nutSet);
const nutBowl = makeBowl(0, 11, 120); nutBowl.scale.setScalar(1.35); nutBowl.position.set(0, 0, 0.3); nutSet.add(nutBowl);
function pillTex(label, icon) {
  return canvasTex(640, 256, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 256);
    g.save(); g.translate(110, 128); icon(g); g.restore();
    g.fillStyle = C.grafito; g.font = TITLE(64, 700); g.textBaseline = 'middle'; g.fillText(label, 200, 136);
  });
}
const NICON = {
  prot: g => { g.fillStyle = C.azul; g.beginPath(); g.ellipse(0, 0, 70, 52, -0.4, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-12, -8, 18, 14, -0.4, 0, 7); g.fill(); },
  omega: g => { g.fillStyle = C.amarillo; g.beginPath(); g.moveTo(0, -78); g.bezierCurveTo(48, -20, 62, 12, 62, 32); g.arc(0, 32, 62, 0, Math.PI); g.bezierCurveTo(-62, 12, -48, -20, 0, -78); g.fill(); g.fillStyle = C.grafito; g.font = TITLE(60, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Ω', 0, 32); },
  zinc: g => { g.fillStyle = C.grafito; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); } g.closePath(); g.fill(); g.fillStyle = '#fff'; g.font = TEXT(44, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Zn', 0, 4); },
  vit: g => { g.fillStyle = C.azul; g.beginPath(); g.roundRect(-80, -34, 160, 68, 34); g.fill(); g.fillStyle = C.amarillo; g.beginPath(); g.roundRect(0, -34, 80, 68, [0, 34, 34, 0]); g.fill(); },
};
const nutPills = [['Proteína', NICON.prot, 'proteina'], ['Omega 3 y 6', NICON.omega, 'omega'], ['Zinc', NICON.zinc, 'zinc'], ['Vitaminas', NICON.vit, 'vitaminas']].map(([l, ic, w], i) => {
  const g = new THREE.Group(); nutSet.add(g);
  mesh(new RoundedBoxGeometry(1.32, 0.53, 0.14, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.4 }), g);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.22 * 256 / 640), new THREE.MeshBasicMaterial({ map: pillTex(l, ic) })); f.position.z = 0.075; g.add(f);
  return { g, w, home: V3(i % 2 ? 0.66 : -0.66, i < 2 ? 2.05 : 1.38, 0.2) };
});
const nutSparks = []; for (let i = 0; i < 24; i++) { const s = sprite(TEX.spark, 0.3); nutSet.add(s); nutSparks.push(s); }

// ================================================================ SET: CRITERIO (edad, tamaño, piel)
const critSet = new THREE.Group(); scene.add(critSet);
const CICON = {
  edad: g => { g.fillStyle = C.azul; g.beginPath(); g.roundRect(-75, -60, 150, 135, 18); g.fill(); g.fillStyle = '#fff'; g.fillRect(-60, -20, 120, 82); g.fillStyle = C.azul; for (let k = 0; k < 6; k++) g.fillRect(-48 + (k % 3) * 38, -8 + Math.floor(k / 3) * 34, 22, 22); g.fillStyle = C.grafito; g.fillRect(-48, -78, 12, 32); g.fillRect(36, -78, 12, 32); },
  tam: g => { g.fillStyle = C.azul; [[-62, 26, 22], [-8, 8, 34], [56, -14, 48]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); g.fillRect(-90, 55, 180, 10); },
  piel: ICON.seca,
};
const critCards = [['Edad', CICON.edad, 'edad'], ['Tamaño', CICON.tam, 'tamano'], ['Tipo de piel', CICON.piel, 'tipo']].map(([l, ic, w], i) => {
  const g = new THREE.Group(); critSet.add(g); g.position.set(0, 2.4 - i * 0.78, 0);
  mesh(new RoundedBoxGeometry(2.6, 0.66, 0.16, 4, 0.08), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.4 }), g);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 2.44 * 260 / 1024), new THREE.MeshBasicMaterial({ map: causeTex(l, ic) })); f.position.z = 0.085; g.add(f);
  return { g, w };
});

// ================================================================ SET: TRUCO (transición en 7 días)
const trucoSet = new THREE.Group(); scene.add(trucoSet);
const STEPS = [[0.25, 'Día 1-2', '25 %'], [0.5, 'Día 3-4', '50 %'], [0.75, 'Día 5-6', '75 %'], [1, 'Día 7', '100 %']];
const stepBowls = STEPS.map(([f], i) => { const b = makeBowl(f, 40 + i); b.position.set(i % 2 ? 0.8 : -0.8, 0, i < 2 ? -0.85 : 0.85); trucoSet.add(b); return b; });

// ================================================================ actualización por escena
const SETS = [dogSet, giftSet, closeSet, baSet, causeSet, errSet, tubSet, photoSet, nutSet, critSet, trucoSet];
function show(...on) { SETS.forEach(s => s.visible = on.includes(s)); }
function cam(pos, look, fov = 38) { camera.position.copy(pos); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); }
function groundColor(hex, vis = true) { ground.visible = vis; M.ground.color.setHex(hex); }
function dogBase() {
  bang.visible = false; brush.visible = false; deadHair.visible = false; sparkPool.forEach(s => s.visible = false); hearts.forEach(h => h.visible = false);
  dog.setKnots(0, 0, 0); dog.bow.visible = false; magn.visible = false; fingers.visible = false; dogFlakes.visible = false; scratchPose(0, 0); updateFall(0, false);
  dogBowl.visible = true; dogBowl.position.set(0.95, 0, 1.15); dogBowl.scale.setScalar(0.85); setShine(0);
}

function sceneHook(t, lt, dur) {
  // Gancho: el pelo dice lo que come. De opaco a brillante. Sin logo.
  show(dogSet); scene.background = BG.crema; groundColor(0xE9E1D0); dogBase();
  dog.g.rotation.y = -0.35;
  const sh = ss(dur * 0.45, dur * 0.95, lt);
  setShine(sh); dog.pose(t, { mood: lerp(-0.2, 0.7, sh), wag: sh * 0.7, tilt: 0.12 * Math.sin(t * 1.5), messy: 1 - sh });
  dogSparkles(t, sh);
  const e = easeInOut(lt / dur);
  cam(V3(0.7, 2.0, 7.6).lerp(V3(0.5, 2.0, 6.6), e), V3(0.25, 1.45, 0.3), 38);
}

function sceneDato(t, lt, dur) {
  // Dato curioso: el pelo es casi todo proteína; lo que come va a su piel y pelaje.
  show(closeSet); scene.background = BG.grafito; groundColor(0, false);
  hand.visible = false; comb.visible = false; closeSparks.forEach(s => s.visible = false); closeBang.visible = false; closeCheck.visible = false;
  goodGlow.visible = false; painGlow.visible = false; painRings.forEach(r => r.visible = false); inflam.forEach(m => m.visible = false); drops.forEach(d => d.m.visible = false); dirt.forEach(d => d.m.visible = false);
  ckMat.emissiveIntensity = 0; skinFlakes.visible = false;
  updateHair(t, { T: 0.0001, knotY: 1, bulge: 0, knotScale: 0 });
  const r0 = RANGES.dato[0];
  const tProt = wt('dato', 'proteina') - r0, tVa = wt('dato', 'piel') - r0;
  const grow = 0.55 + 0.45 * ss(tProt - 0.2, tProt + 2.5, lt);
  const shine = ss(tVa - 0.5, tVa + 1.2, lt);
  hairMeshes.forEach((m, i) => { m.visible = i % 2 === 0; m.scale.y = grow; });
  hairMat.roughness = lerp(0.6, 0.25, shine); hairMat.color.setHex(0xC99257).lerp(new THREE.Color(0xE8A95E), shine);
  skinMat.color.setHex(0xEFD2C4).lerp(new THREE.Color(0xF6C2B2), shine);
  kibTrip.visible = true;
  KTRIP.forEach((k, i) => { const a = clamp((lt - tProt - k.d) / 1.0); const p = k.from.clone().lerp(k.to, easeInOut(a)); p.y += Math.sin(a * Math.PI) * 0.6; const s = k.s * (a <= 0 ? 0 : a >= 1 ? 0 : 1); _q.setFromEuler(new THREE.Euler(a * 6 + i, a * 4, i)); _m4.compose(p, _q, V3(s, s * 0.7, s)); kibTrip.setMatrixAt(i, _m4); });
  kibTrip.instanceMatrix.needsUpdate = true;
  closeSparks.forEach((s, i) => { const R = rng(i + 99); s.visible = shine > 0; s.position.set((R() - 0.5) * 2.4, 0.5 + R() * 2.0, (R() - 0.2) * 1.2); s.scale.setScalar(0.2 * shine * (0.4 + 0.6 * Math.sin(t * 4 + i))); });
  const o = lt / dur;
  cam(V3(lerp(-1.0, 0.8, easeInOut(o)), lerp(2.0, 1.7, o), lerp(4.8, 4.2, o)), V3(0, 0.95, 0.3), 40);
}

function sceneIntroGift(t, lt, dur) {
  show(giftSet); scene.background = BG.azul; groundColor(0x2A73A5);
  giftBox.position.y = 0; giftBox.rotation.set(0, Math.sin(t * 1.1) * 0.25 - 0.2, 0);
  lid.position.set(0, 1.2 + Math.max(0, Math.sin(t * 5)) * 0.04, 0); lid.rotation.set(0, 0, 0);
  giftBox.scale.setScalar(pop(0, lt, 0.6));
  lock.visible = true; lock.position.y = 0.62; shackle.position.y = 0.21; shackle.rotation.y = 0;
  quest.visible = true; quest.scale.setScalar(0.7 * pop(0.5, lt)); quest.position.set(0.0, 1.95 + Math.sin(t * 2.5) * 0.06, 0.6);
  giftSparks.forEach((s, i) => { const a = i / giftSparks.length * 6.28 + t * 0.35; const r = 1.6 + 0.2 * Math.sin(i * 3 + t * 2); s.visible = true; s.position.set(Math.cos(a) * r, 0.9 + Math.sin(i * 1.7 + t * 1.2) * 0.9, Math.sin(a) * r); s.scale.setScalar(0.16 * (0.5 + 0.5 * Math.sin(t * 4 + i))); });
  glowBurst.visible = false;
  const o = lt / dur;
  cam(V3(Math.sin(o * 0.6 - 0.3) * 6.6, 2.5 - o * 0.3, Math.cos(o * 0.6 - 0.3) * 6.6), V3(0, 1.05, 0), 40);
}

function sceneSenales(t, lt, dur) {
  // Señales: pelo opaco, se le cae, piel reseca… y la cámara llega al plato.
  show(dogSet); scene.background = BG.crema; groundColor(0xE9E1D0); dogBase();
  dog.g.rotation.y = -0.45; updateHairFall(t, true);
  dog.pose(t, { mood: -0.35, tilt: 0.1, messy: 1 });
  const r0 = RANGES.senales[0]; const tPl = wt('senales', 'plato') - r0;
  const z = ss(tPl - 0.8, tPl + 0.6, lt);
  const bw = dogBowl.getWorldPosition(V3());
  cam(V3(0.9, 2.2, 7.4).lerp(bw.clone().add(V3(0.15, 1.6, 2.4)), z), V3(0.2, 1.45, 0).lerp(bw.clone().add(V3(0, 0.15, 0)), z), 40);
}

function sceneNutrientes(t, lt, dur) {
  show(nutSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  const r0 = RANGES.nutrientes[0]; const tMant = wt('nutrientes', 'mantienen') - r0, tBri = wt('nutrientes', 'brillante') - r0;
  nutPills.forEach((p, i) => {
    const tw = wt('nutrientes', p.w) - r0; const k = pop(tw - 0.1, lt, 0.45);
    const drop = ss(tMant + i * 0.12, tMant + 0.7 + i * 0.12, lt);
    p.g.position.copy(p.home).lerp(V3(nutBowl.position.x, 0.55, nutBowl.position.z), drop);
    p.g.position.y += Math.sin(t * 1.6 + i) * 0.04 * (1 - drop);
    p.g.scale.setScalar(Math.max(0.001, k * (1 - drop * 0.95))); p.g.rotation.set(0, Math.sin(t * 0.9 + i) * 0.2, drop * 1.5 * (i % 2 ? 1 : -1));
  });
  const b = ss(tBri - 0.4, tBri + 0.3, lt);
  nutSparks.forEach((s, i) => { const R = rng(i + 77); const a = R() * 6.28; s.visible = b > 0; s.position.set(Math.cos(a) * (0.4 + b * 1.2), 0.6 + R() * 1.6 * b, 0.3 + Math.sin(a) * 0.6); s.scale.setScalar(0.3 * b * (0.4 + 0.6 * Math.sin(t * 4 + i))); });
  cam(V3(0.15 * Math.sin(lt * 0.4), 1.9, 7.6), V3(0, 1.25, 0), 38);
}

function scenePhoto(t, lt) {
  show(photoSet); scene.background = BG.crema; groundColor(0, false);
  photoSparks.forEach((s, i) => { const a = i / photoSparks.length * 6.28 + t * 0.25; const r = 1.55 + 0.15 * Math.sin(i * 2.3 + t); s.position.set(Math.cos(a) * r * 0.85, 2.0 + Math.sin(a) * r * 1.25, -0.5); s.scale.setScalar(0.22 * (0.4 + 0.6 * Math.sin(t * 3 + i * 1.7)) * ss(0, 0.5, lt)); });
  cam(V3(0, 2, 6), V3(0, 2, 0), 40);
}
function sceneCanis(t, lt, dur) { scenePhoto(t, lt); }

function sceneCriterio(t, lt, dur) {
  show(critSet); scene.background = BG.crema; groundColor(0, false);
  const r0 = RANGES.criterio[0];
  critCards.forEach((c, i) => { const tw = wt('criterio', c.w) - r0; const k = pop(tw - 0.15, lt, 0.45); c.g.scale.setScalar(Math.max(0.001, k)); c.g.rotation.set(0.05 * Math.sin(t * 1.3 + i), 0.18 * Math.sin(t * 0.9 + i * 1.7), 0); c.g.position.z = 0.15 * Math.sin(clamp((lt - tw) / 0.5) * Math.PI); });
  cam(V3(0.25 * Math.sin(lt * 0.4), 1.6, 8.6), V3(0, 1.5, 0), 38);
}

const STEP_T = () => { const r0 = RANGES.truco[0], a = wt('truco', 'cambia') - r0, b = SEG.truco.end - r0 - 0.3; return STEPS.map((_, i) => a + (b - a) * i / 3.4); };
function sceneTruco(t, lt, dur) {
  show(trucoSet); scene.background = BG.crema; groundColor(0xE9E1D0);
  const st = STEP_T();
  stepBowls.forEach((b, i) => { const k = pop(st[i], lt, 0.45); b.scale.setScalar(Math.max(0.001, k)); b.rotation.y = Math.sin(t * 0.8 + i) * 0.3; });
  cam(V3(0.15 * Math.sin(lt * 0.4), 8.6, 7.0), V3(0, -0.35, 0.2), 40);
}

function sceneCta(t, lt, dur) {
  show(dogSet); scene.background = BG.azul; groundColor(0x2A73A5); dogBase();
  dog.bow.visible = true; setShine(1); dogSparkles(t, 0.7);
  dog.g.rotation.y = Math.sin(t * 1.0) * 0.2;
  dog.pose(t, { mood: 1, wag: 1, bounce: 0.2, tilt: 0.12 * Math.sin(t * 2) });
  hearts.forEach((h, i) => { const R = rng(i + 31); const per = 2.4, age = ((lt - R() * per) % per + per) % per; h.visible = true; h.position.set((R() - 0.5) * 3.2, 1.2 + age * 1.5, -0.6 + R() * 1.0); h.rotation.set(0, Math.sin(t * 2 + i) * 0.6, Math.sin(t * 1.5 + i) * 0.2); h.scale.setScalar(0.28 * Math.sin(clamp(age / per) * Math.PI) + 0.001); });
  cam(V3(Math.sin(lt * 0.3) * 1.0, 2.4, 8.4), V3(0, 1.5, 0), 40);
}

function sceneCierre() { show(); scene.background = BG.azul; groundColor(0, false); cam(V3(0, 2, 6), V3(0, 2, 0)); }

const SCENES = { hook: sceneHook, dato: sceneDato, promesa: sceneIntroGift, senales: sceneSenales, nutrientes: sceneNutrientes, canis: sceneCanis, vet: (t, lt) => scenePhoto(t, lt), truco: sceneTruco, cta: sceneCta, cierre: sceneCierre };
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
  // Promesa "quédate hasta el final": barra de progreso hasta la recompensa (el truco del cambio de alimento).
  const tShow = wt('promesa', 'final') + 0.2, tReward = RANGES.truco[0] + 0.3, tHide = SEG.truco.end + 0.4;
  if (t < tShow || t > tHide) return;
  const k = easeOutBack((t - tShow) / 0.5); const unlocked = t >= tReward;
  const fade = 1 - ss(tHide - 0.4, tHide, t);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(W / 2 - 40, SAFE_TOP + 66); ctx.scale(k, k);
  const label = unlocked ? '¡Aquí está el truco!' : 'El truco, al final';
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

function drawPhotoCard(t, t0) {
  // Foto real de Cindy (clienta CANIS), sin filtros: marco crema + placa con nombre.
  const k = easeOutBack((t - t0) / 0.55); if (k <= 0) return;
  const pw = 600, ph = 800, cx = W / 2, cy = 860, z = 1 + 0.03 * clamp((t - t0) / 4);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.rotate(-0.025);
  ctx.shadowColor = 'rgba(62,66,71,0.28)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = C.blanco; rrect(-pw / 2 - 22, -ph / 2 - 22, pw + 44, ph + 44, 34); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.save(); rrect(-pw / 2, -ph / 2, pw, ph, 22); ctx.clip();
  const iw = pw * z, ih = iw * CINDY.height / CINDY.width; ctx.drawImage(CINDY, -iw / 2, -ph / 2 - (ih - ph) * 0.35, iw, ih);
  ctx.restore(); ctx.restore();
  namePlate(cx - 150, cy + ph / 2 + 4, 'Cindy', easeOutBack((t - t0 - 0.35) / 0.45));
}
function drawAgro(t, t0) {
  // Recomendación: Veterinaria Agrocentro (logo original sobre tarjeta blanca, más chico que el logo CANIS).
  const k = easeOutBack((t - t0) / 0.5); if (k <= 0) return;
  const cw = 900, ch = 600, cx = W / 2, cy = 880;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
  ctx.shadowColor = 'rgba(62,66,71,0.22)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = C.blanco; rrect(-cw / 2, -ch / 2, cw, ch, 36); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = C.grafito; ctx.font = TITLE(50); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Te orientan en', 0, -ch / 2 + 70);
  const lw = 600, lh = lw * AGRO.height / AGRO.width; ctx.drawImage(AGRO, -lw / 2, -ch / 2 + 115, lw, lh);
  ctx.restore();
  const row = (y, label, value, d) => { const kk = easeOutBack((t - t0 - d) / 0.45); if (kk <= 0) return; ctx.save(); ctx.translate(cx, y); ctx.scale(kk, kk);
    ctx.font = TEXT(44); const l = ctx.measureText(label + '  ').width, v = ctx.measureText(value).width, w = l + v + 70, h = 84;
    ctx.fillStyle = C.grafito; rrect(-w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.textBaseline = 'middle';
    ctx.fillStyle = C.amarillo; ctx.fillText(label, -w / 2 + 35, 3); ctx.fillStyle = C.blanco; ctx.fillText(value, -w / 2 + 35 + l, 3); ctx.restore(); };
  row(cy + 95, 'Instagram', '@vet_agrocentro', 0.25);
  row(cy + 200, 'WhatsApp', '228 214 4436', 0.4);
}

function drawBrands(t) {
  // Marcas que maneja CANIS: logos originales en tarjetas blancas, sin alterar, más chicos que el logo CANIS.
  const cw = 440, chh = 200, pos = [[300, 650], [780, 650], [300, 880], [780, 880], [540, 1110]];
  BRANDS.forEach((b, i) => {
    const k = easeOutBack((t - wt('canis', b.w) + 0.1) / 0.45); if (k <= 0) return;
    const [x, y] = pos[i]; ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.shadowColor = 'rgba(62,66,71,0.2)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    ctx.fillStyle = C.blanco; rrect(-cw / 2, -chh / 2, cw, chh, 28); ctx.fill(); ctx.shadowColor = 'transparent';
    const maxW = cw - 70, maxH = chh - 50; const s = Math.min(maxW / b.img.width, maxH / b.img.height, b.img.width < 400 ? 1.25 : 9);
    const w = b.img.width * s, h = b.img.height * s; ctx.drawImage(b.img, -w / 2, -h / 2, w, h); ctx.restore();
  });
}

function drawExtras(t, id) {
  if (id === 'senales') [['Pelo opaco', 'opaco'], ['Se le cae de más', 'cae'], ['Piel reseca', 'reseca']].forEach(([txt, w], i) => chip(MARGIN, 600 + i * 94, txt, easeOutBack((t - wt('senales', w)) / 0.4), '✓'));
  if (id === 'canis') drawBrands(t);
  if (id === 'vet') drawAgro(t, RANGES.vet[0] + 0.25);
  if (id === 'truco') {
    const st = STEP_T(), r0 = RANGES.truco[0];
    // leyenda
    const kl = easeOutBack((t - r0 - 0.2) / 0.4);
    if (kl > 0) { ctx.save(); ctx.translate(W / 2, 568); ctx.scale(kl, kl); ctx.font = TEXT(38, 700); ctx.textBaseline = 'middle';
      const items = [['Anterior', '#C98545'], ['Nuevo', '#6B3F1D']]; let x = -250;
      items.forEach(([l, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, 0, 18, 0, 7); ctx.fill(); ctx.fillStyle = C.grafito; ctx.fillText(l, x + 32, 3); x += 300; }); ctx.restore(); }
    STEPS.forEach(([f, d, p], i) => { const pp = project(stepBowls[i].position.clone().add(V3(0, 0, 0.72))); const k = easeOutBack((t - r0 - st[i] - 0.15) / 0.4);
      pill(pp.x, pp.y + 34, `${d} · ${p}`, i === 3 ? C.azul : C.grafito, C.blanco, TEXT(36), k, 26, 60); });
  }
  if (id === 'cta') {
    const k = easeOutBack((t - wt('cta', 'preguntanos') + 0.1) / 0.45);
    if (k > 0) {
      ctx.save(); ctx.translate(W / 2, 470); ctx.rotate(-0.04); ctx.scale(k, k);
      ctx.font = TITLE(84, 800); const tw = ctx.measureText('Pregúntanos').width; const w = tw + 100, h = 150;
      ctx.shadowColor = 'rgba(30,40,50,0.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.fillStyle = C.amarillo; rrect(-w / 2, -h / 2, w, h, 36); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = C.grafito; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Pregúntanos', 0, 6); ctx.restore();
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
