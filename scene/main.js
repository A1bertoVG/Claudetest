// Video 3D: "Peina a tu perrito" – escena three.js renderizada cuadro a cuadro.
// Todo el estado visual es función pura del tiempo t (segundos), para poder
// renderizar en paralelo y de forma determinista.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920;
const TL = await (await fetch('timeline.json')).json();
const SEG = Object.fromEntries(TL.segments.map(s => [s.id, s]));
const ORDER = TL.segments.map(s => s.id);
await document.fonts.load('700 80px Fredoka'); await document.fonts.load('600 46px Fredoka');

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
const WORDS = {};
for (const s of TL.segments) {
  const words = s.text.split(/\s+/);
  const w = words.map(x => x.length + 1 + (/[,.;:]$/.test(x) ? 6 : 0) + (/[?!]$/.test(x) ? 4 : 0));
  const tot = w.reduce((a, b) => a + b, 0); const d = s.end - s.start; let acc = 0;
  WORDS[s.id] = words.map((x, i) => { const st = s.start + acc / tot * d; acc += w[i]; return { w: x, s: st, e: s.start + (acc - (w[i] - x.length - 1)) / tot * d }; });
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
function wt(id, prefix, nth = 0) {
  const list = WORDS[id]; let n = 0;
  for (const w of list) if (norm(w.w).startsWith(norm(prefix))) { if (n++ === nth) return w.s; }
  console.warn('palabra no encontrada', id, prefix); return SEG[id].start;
}

// rangos de escena
const RANGES = {};
ORDER.forEach((id, i) => {
  const a = i ? SEG[id].start - 0.25 : 0;
  const b = i < ORDER.length - 1 ? SEG[ORDER[i + 1]].start - 0.25 : TL.duration + 0.01;
  RANGES[id] = [a, b];
});
const TRUCO_OPEN = 1.5; // segundos de "regalo que se abre" al inicio del truco

// ---------------------------------------------------------------- renderer
const glCanvas = document.createElement('canvas'); glCanvas.id = 'gl';
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 100);

const hemi = new THREE.HemisphereLight(0xfff4e6, 0x6b4a3a, 1.1); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 7, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 });
key.shadow.bias = -0.0005; key.shadow.radius = 4; scene.add(key);
const rim = new THREE.DirectionalLight(0xffd9a8, 1.6); rim.position.set(-4, 4, -5); scene.add(rim);
const fill = new THREE.PointLight(0xffffff, 0, 12); fill.position.set(0, 2, 4); scene.add(fill);

function gradTex(top, bottom) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BG = {
  hook: gradTex('#4a0f2e', '#12060f'), intro: gradTex('#5b34e6', '#f06ab0'), problema: gradTex('#103447', '#04101a'),
  dano: gradTex('#4a0e1c', '#0b0408'), solucion: gradTex('#7fd9ff', '#e9fbff'), frecuencia: gradTex('#ffc94d', '#fff1cc'),
  truco: gradTex('#17695a', '#06221d'), aviso: gradTex('#ff7a4d', '#ffd3bd'), cta: gradTex('#ff6fb0', '#6c4cff'),
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function sprite(tex, sx, sy = sx) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(sx, sy, 1); return s; }
const radialTex = (inner, outer) => canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });

const TEX = {
  bang: canvasTex(256, 256, (g) => { g.fillStyle = '#ff2d55'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#fff'; g.font = '700 190px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 128, 140); }),
  quest: canvasTex(256, 256, (g) => { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#5b34e6'; g.font = '700 190px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 142); }),
  cross: canvasTex(256, 256, (g) => { g.fillStyle = '#ff2d55'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke(); g.lineCap = 'round'; g.lineWidth = 30; g.beginPath(); g.moveTo(78, 78); g.lineTo(178, 178); g.moveTo(178, 78); g.lineTo(78, 178); g.stroke(); }),
  check: canvasTex(256, 256, (g) => { g.fillStyle = '#22c55e'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 30; g.beginPath(); g.moveTo(70, 132); g.lineTo(112, 174); g.lineTo(188, 90); g.stroke(); }),
  spark: canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,170,0.9)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 0); g.lineTo(70, 58); g.lineTo(128, 64); g.lineTo(70, 70); g.lineTo(64, 128); g.lineTo(58, 70); g.lineTo(0, 64); g.lineTo(58, 58); g.closePath(); g.fill(); }),
  redGlow: radialTex('rgba(255,30,60,0.95)', 'rgba(255,30,60,0)'),
  greenGlow: radialTex('rgba(60,255,140,0.9)', 'rgba(60,255,140,0)'),
  inflam: radialTex('rgba(200,20,40,0.95)', 'rgba(240,80,90,0)'),
  shadow: radialTex('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'),
};

// ---------------------------------------------------------------- materiales
const M = {
  fur: new THREE.MeshStandardMaterial({ color: 0xE3A766, roughness: 0.9 }),
  furLight: new THREE.MeshStandardMaterial({ color: 0xF8E6CB, roughness: 0.95 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0xA9622C, roughness: 0.9 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x141012, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  pink: new THREE.MeshStandardMaterial({ color: 0xFF7A9A, roughness: 0.5 }),
  blush: new THREE.MeshBasicMaterial({ color: 0xFF8FA8, transparent: true, opacity: 0.55 }),
  matted: new THREE.MeshStandardMaterial({ color: 0x8A5428, roughness: 1, emissive: 0xff0022, emissiveIntensity: 0 }),
  ground: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
};

const sph = new THREE.SphereGeometry(1, 48, 32);
function mesh(geo, mat, parent, pos = [0, 0, 0], scl = null, rot = null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (scl) m.scale.set(...scl); if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

// ---------------------------------------------------------------- perrito
function makeDog(seed = 1) {
  const R = rng(seed);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const TORSO = { c: V3(0, 1.05, 0), s: V3(0.95, 1.05, 0.85) };
  mesh(sph, M.fur, body, TORSO.c.toArray(), TORSO.s.toArray());
  mesh(sph, M.furLight, body, [0, 1.18, 0.42], [0.62, 0.78, 0.5]);
  for (const s of [-1, 1]) {
    mesh(sph, M.fur, body, [s * 0.64, 0.52, -0.05], [0.46, 0.46, 0.62]);
    mesh(sph, M.furLight, body, [s * 0.72, 0.12, 0.42], [0.26, 0.15, 0.36]);
    mesh(new THREE.CapsuleGeometry(0.18, 0.72, 8, 20), M.fur, body, [s * 0.33, 0.5, 0.56]);
    mesh(sph, M.furLight, body, [s * 0.33, 0.1, 0.7], [0.23, 0.14, 0.28]);
  }
  // cola
  const tail = new THREE.Group(); tail.position.set(0, 0.55, -0.72); body.add(tail);
  const tc = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, 0.25, -0.3), V3(0, 0.65, -0.42), V3(0, 0.95, -0.25)]);
  mesh(new THREE.TubeGeometry(tc, 32, 0.11, 12), M.fur, tail);
  mesh(sph, M.furLight, tail, [0, 0.98, -0.22], [0.16, 0.16, 0.16]);
  // cabeza
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
    const b = mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), M.furDark, head, [s * 0.3, 0.32, 0.6], null, [0, 0, Math.PI / 2]);
    brows.push(b);
    mesh(sph, M.blush, head, [s * 0.46, -0.18, 0.5], [0.11, 0.07, 0.05]);
    const ep = new THREE.Group(); ep.position.set(s * 0.6, 0.38, -0.02); head.add(ep);
    mesh(sph, M.furDark, ep, [s * 0.12, -0.42, 0], [0.22, 0.55, 0.36], [0, 0, s * 0.25]);
    ears.push(ep);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 24, Math.PI), M.black, head, [0, -0.34, 0.74]);
  const tongue = mesh(sph, M.pink, head, [0, -0.47, 0.7], [0.08, 0.12, 0.04]);
  // pelo esponjoso (mechones instanciados)
  const tuftGeo = new THREE.IcosahedronGeometry(1, 1);
  function fluff(parent, c, s, n, skip, rad = [0.07, 0.115]) {
    const im = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), n);
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
  // nudos enmarañados sobre el cuerpo
  const knotGeo = new THREE.TorusKnotGeometry(0.15, 0.065, 96, 12, 2, 3);
  const knots = [];
  for (const d of [V3(0.82, 0.32, 0.48), V3(0.95, -0.25, 0.2), V3(0.45, 0.7, 0.55)]) {
    d.normalize(); const p = V3(d.x * TORSO.s.x, d.y * TORSO.s.y, d.z * TORSO.s.z).add(TORSO.c);
    const kg = new THREE.Group(); kg.position.copy(p); kg.lookAt(p.clone().add(d)); body.add(kg);
    const k1 = mesh(knotGeo, M.matted, kg, [0, 0, 0.02]); const k2 = mesh(knotGeo, M.matted, kg, [0.05, 0.03, 0.0], [0.8, 0.8, 0.8], [1.2, 0.4, 0.8]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 48), new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.z = 0.12; kg.add(ring);
    const ring2 = ring.clone(); ring2.material = ring.material.clone(); kg.add(ring2);
    knots.push({ g: kg, ring, ring2, k1, k2, dir: d, pos: p });
  }
  const bang = sprite(TEX.bang, 0.55); bang.position.set(0.95, 3.25, 0.3); g.add(bang);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; g.add(shadow);

  function pose(t, { mood = 0, wag = 0, pain = 0, bounce = 0, tilt = 0 }) {
    const sad = clamp(-mood), happy = clamp(mood);
    brows[0].rotation.z = Math.PI / 2 + 0.45 * sad - 0.15 * happy; brows[1].rotation.z = Math.PI / 2 - 0.45 * sad + 0.15 * happy;
    brows[0].position.y = brows[1].position.y = 0.32 + 0.04 * sad + 0.03 * happy;
    const sq = 1 - 0.55 * pain * (0.5 + 0.5 * Math.sin(t * 22)) - 0.35 * happy;
    eyes.forEach(e => e.scale.set(1, sq, 1));
    mouth.scale.set(1, mood >= 0 ? -(0.35 + 0.75 * happy) : (0.35 + 0.65 * sad), 1);
    mouth.position.y = -0.34 - 0.03 * happy;
    tongue.visible = happy > 0.35; tongue.scale.set(0.08, 0.12 * ss(0.35, 0.9, happy) + 0.001, 0.04);
    ears.forEach((e, i) => { const s = i ? 1 : -1; e.rotation.z = s * (0.05 - 0.12 * sad + 0.18 * happy * (0.5 + 0.5 * Math.sin(t * 9 + i))); e.rotation.x = -0.15 * sad; });
    tail.rotation.z = Math.sin(t * 16) * 0.55 * wag; tail.rotation.x = -0.35 * sad;
    const b = Math.abs(Math.sin(t * 7)) * bounce;
    body.position.y = b * 0.5; head.position.y = 2.25 + b * 0.55 - 0.08 * sad; head.rotation.z = tilt + Math.sin(t * 40) * 0.03 * pain;
    head.rotation.x = 0.12 * sad; shadow.scale.setScalar(1 - b * 0.35);
    g.position.x = Math.sin(t * 47) * 0.02 * pain;
  }
  return { g, body, head, tail, knots, bang, pose, torso: TORSO };
}

// ---------------------------------------------------------------- cepillo
function makeBrush() {
  const g = new THREE.Group();
  const purple = new THREE.MeshPhysicalMaterial({ color: 0x7B5CFF, roughness: 0.3, clearcoat: 0.8 });
  const lilac = new THREE.MeshPhysicalMaterial({ color: 0xB7A6FF, roughness: 0.35, clearcoat: 0.6 });
  mesh(new RoundedBoxGeometry(0.8, 0.14, 0.38, 4, 0.06), purple, g, [0, 0.07, 0]);
  mesh(new THREE.CapsuleGeometry(0.075, 0.9, 6, 16), lilac, g, [0.85, 0.14, 0], null, [0, 0, Math.PI / 2 + 0.12]);
  const bristle = new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6);
  const im = new THREE.InstancedMesh(bristle, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 60);
  const m4 = new THREE.Matrix4(); let i = 0;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 5; z++) { m4.makeTranslation(-0.33 + x * 0.06, -0.08, -0.13 + z * 0.065); im.setMatrixAt(i++, m4); }
  g.add(im);
  return g;
}

// ---------------------------------------------------------------- piso
const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), M.ground); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ================================================================ SET: PERRO
const dogSet = new THREE.Group(); scene.add(dogSet);
const dog = makeDog(7); dogSet.add(dog.g);
const brush = makeBrush(); dogSet.add(brush);
const sparkPool = []; for (let i = 0; i < 60; i++) { const s = sprite(TEX.spark, 0.25); dogSet.add(s); sparkPool.push(s); }
const deadHair = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xC9884A, roughness: 1 }), 40); deadHair.castShadow = true; dogSet.add(deadHair);
const heartShape = new THREE.Shape(); { const x = 0, y = 0; heartShape.moveTo(x, y + 0.25); heartShape.bezierCurveTo(x, y + 0.25, x - 0.05, y, x - 0.25, y); heartShape.bezierCurveTo(x - 0.55, y, x - 0.55, y + 0.35, x - 0.55, y + 0.35); heartShape.bezierCurveTo(x - 0.55, y + 0.55, x - 0.35, y + 0.77, x, y + 0.95); heartShape.bezierCurveTo(x + 0.35, y + 0.77, x + 0.55, y + 0.55, x + 0.55, y + 0.35); heartShape.bezierCurveTo(x + 0.55, y + 0.35, x + 0.55, y, x + 0.25, y); heartShape.bezierCurveTo(x + 0.1, y, x, y + 0.25, x, y + 0.25); }
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 24 }); heartGeo.center(); heartGeo.rotateZ(Math.PI);
const hearts = []; for (let i = 0; i < 9; i++) { const h = mesh(heartGeo, new THREE.MeshPhysicalMaterial({ color: i % 3 ? 0xff3d7f : 0xff8fb8, roughness: 0.25, clearcoat: 1 }), dogSet); h.scale.setScalar(0.35); hearts.push(h); }

// ================================================================ SET: REGALO (intro y apertura del truco)
const giftSet = new THREE.Group(); scene.add(giftSet);
const giftMat = new THREE.MeshPhysicalMaterial({ color: 0xFF4D7E, roughness: 0.35, clearcoat: 0.7 });
const ribbonMat = new THREE.MeshPhysicalMaterial({ color: 0xFFD23F, roughness: 0.25, clearcoat: 1, metalness: 0.2 });
const giftBox = new THREE.Group(); giftSet.add(giftBox);
mesh(new RoundedBoxGeometry(1.5, 1.2, 1.5, 4, 0.08), giftMat, giftBox, [0, 0.6, 0]);
mesh(new THREE.BoxGeometry(0.26, 1.21, 1.52), ribbonMat, giftBox, [0, 0.6, 0]);
mesh(new THREE.BoxGeometry(1.52, 1.21, 0.26), ribbonMat, giftBox, [0, 0.6, 0]);
const lid = new THREE.Group(); lid.position.y = 1.2; giftBox.add(lid);
mesh(new RoundedBoxGeometry(1.66, 0.3, 1.66, 4, 0.08), giftMat, lid, [0, 0.15, 0]);
mesh(new THREE.BoxGeometry(0.27, 0.31, 1.68), ribbonMat, lid, [0, 0.15, 0]);
mesh(new THREE.BoxGeometry(1.68, 0.31, 0.27), ribbonMat, lid, [0, 0.15, 0]);
for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.2, 0.07, 12, 32), ribbonMat, lid, [s * 0.2, 0.42, 0], [1, 0.8, 1], [0, s * 0.5, s * 0.6]);
const lock = new THREE.Group(); lock.position.set(0, 0.62, 0.8); giftBox.add(lock);
const gold = new THREE.MeshPhysicalMaterial({ color: 0xF5B324, metalness: 0.9, roughness: 0.25 });
mesh(new RoundedBoxGeometry(0.5, 0.42, 0.18, 4, 0.05), gold, lock);
const shackle = mesh(new THREE.TorusGeometry(0.15, 0.045, 12, 32, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 1, roughness: 0.2 }), lock, [0, 0.21, 0]);
mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), M.black, lock, [0, 0.03, 0.09], null, [Math.PI / 2, 0, 0]);
mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), M.black, lock, [0, -0.04, 0.09]);
const quest = sprite(TEX.quest, 0.7); quest.position.set(0, 2.2, 0.3); giftSet.add(quest);
const giftDog = makeDog(11); giftDog.g.scale.setScalar(0.62); giftDog.g.position.set(-0.95, 0, -0.9); giftDog.knots.forEach(k => k.g.visible = false); giftDog.bang.visible = false; giftSet.add(giftDog.g);
const giftSparks = []; for (let i = 0; i < 40; i++) { const s = sprite(TEX.spark, 0.3); giftSet.add(s); giftSparks.push(s); }
const glowBurst = sprite(radialTex('rgba(255,250,210,1)', 'rgba(255,220,120,0)'), 1); glowBurst.position.set(0, 1.4, 0); giftSet.add(glowBurst);

// ================================================================ SET: PRIMER PLANO DE PIEL Y PELO
const closeSet = new THREE.Group(); scene.add(closeSet);
const SKW = 6, SKD = 4;
const skinGeo = new THREE.PlaneGeometry(SKW, SKD, 120, 80); skinGeo.rotateX(-Math.PI / 2);
const skinBase = skinGeo.attributes.position.array.slice();
const skinMat = new THREE.MeshStandardMaterial({ color: 0xF6B8A8, roughness: 0.55 });
const skin = mesh(skinGeo, skinMat, closeSet);
mesh(new THREE.BoxGeometry(SKW, 0.5, SKD), new THREE.MeshStandardMaterial({ color: 0xE07F7A, roughness: 0.7 }), closeSet, [0, -0.26, 0]);
mesh(new THREE.BoxGeometry(SKW, 1.2, SKD), new THREE.MeshStandardMaterial({ color: 0xF5D597, roughness: 0.8 }), closeSet, [0, -1.12, 0]);
// folículos visibles en el corte
for (let i = 0; i < 14; i++) mesh(new THREE.CapsuleGeometry(0.03, 0.3, 4, 8), new THREE.MeshStandardMaterial({ color: 0xB7603F }), closeSet, [-2.6 + i * 0.4, -0.2, 2.0]);
const KC = V3(0, 0, 0.25); // centro del nudo sobre la piel
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
const ckMat = new THREE.MeshStandardMaterial({ color: 0xA86A36, roughness: 0.8, emissive: 0xff0022, emissiveIntensity: 0 });
const closeKnot = new THREE.Group(); closeSet.add(closeKnot);
mesh(new THREE.TorusKnotGeometry(0.3, 0.085, 160, 16, 2, 3), ckMat, closeKnot);
mesh(new THREE.TorusKnotGeometry(0.24, 0.07, 160, 16, 3, 4), ckMat, closeKnot, [0.05, 0.04, 0], null, [1.1, 0.5, 0.2]);
const painGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: TEX.redGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
painGlow.rotation.x = -Math.PI / 2; painGlow.position.set(KC.x, 0.03, KC.z); closeSet.add(painGlow);
const goodGlow = painGlow.clone(); goodGlow.material = new THREE.MeshBasicMaterial({ map: TEX.greenGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); closeSet.add(goodGlow);
const painRings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 64), new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, depthWrite: false, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(KC.x, 0.05, KC.z); closeSet.add(r); return r; });
const closeBang = sprite(TEX.bang, 0.6); closeSet.add(closeBang);
const closeCross = sprite(TEX.cross, 0.9); closeSet.add(closeCross);
const closeCheck = sprite(TEX.check, 0.8); closeSet.add(closeCheck);
// daño: inflamación, gotas, suciedad, bacterias
const inflam = [V3(0.75, 0, 0.75), V3(-0.7, 0, 0.55), V3(0.15, 0, 1.15), V3(-0.25, 0, -0.35)].map(p => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.inflam, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.copy(p); closeSet.add(m); return m; });
const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x8fd3ff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.8, clearcoat: 1 });
const drops = []; { const R = rng(5); for (let i = 0; i < 12; i++) { const m = mesh(sph, dropMat, closeSet); const a = R() * 6.28, r = 0.3 + R() * 0.8; drops.push({ m, to: V3(KC.x + Math.cos(a) * r, 0.06, KC.z + Math.sin(a) * r * 0.7), d: R() * 0.8, s: 0.06 + R() * 0.05 }); } }
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1f, roughness: 1 });
const dirt = []; { const R = rng(9); for (let i = 0; i < 30; i++) { const m = mesh(new THREE.IcosahedronGeometry(1, 0), dirtMat, closeSet); const a = R() * 6.28, r = 0.2 + R() * 0.5; dirt.push({ m, off: V3(Math.cos(a) * r, (R() - 0.3) * 0.6, Math.sin(a) * r * 0.8), d: R() * 0.6, s: 0.03 + R() * 0.04, rot: R() * 6 }); } }
const bactGeo = new THREE.IcosahedronGeometry(1, 3); { const p = bactGeo.attributes.position; for (let i = 0; i < p.count; i++) { const v = V3(p.getX(i), p.getY(i), p.getZ(i)); const n = 1 + 0.18 * Math.sin(v.x * 7) * Math.sin(v.y * 7) * Math.sin(v.z * 7); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); } bactGeo.computeVertexNormals(); }
const bacts = [V3(0.9, 0.25, 0.9), V3(-0.85, 0.3, 0.75), V3(0.4, 0.2, 1.35), V3(-0.35, 0.35, 1.2)].map((p, i) => { const g = new THREE.Group(); g.position.copy(p); closeSet.add(g); mesh(bactGeo, new THREE.MeshPhysicalMaterial({ color: i % 2 ? 0x7DDB3A : 0x45C46B, roughness: 0.4, clearcoat: 0.6 }), g, [0, 0, 0], [0.16, 0.16, 0.16]); for (const s of [-1, 1]) { mesh(sph, M.white, g, [s * 0.05, 0.05, 0.13], [0.045, 0.045, 0.03]); mesh(sph, M.black, g, [s * 0.05, 0.05, 0.155], [0.022, 0.022, 0.015]); } return g; });
// truco: mano, fécula, peine
const skinTone = new THREE.MeshStandardMaterial({ color: 0xF1C08E, roughness: 0.6 });
const hand = new THREE.Group(); closeSet.add(hand);
mesh(sph, skinTone, hand, [1.25, 0.35, 0.3], [0.55, 0.32, 0.45]);
mesh(new THREE.CapsuleGeometry(0.1, 0.75, 8, 16), skinTone, hand, [0.55, 0.36, 0.62], null, [0, 0.15, Math.PI / 2]);
mesh(new THREE.CapsuleGeometry(0.11, 0.6, 8, 16), skinTone, hand, [0.6, 0.32, -0.1], null, [0, -0.2, Math.PI / 2]);
mesh(sph, new THREE.MeshStandardMaterial({ color: 0xFFE3D3, roughness: 0.3 }), hand, [0.2, 0.38, 0.66], [0.06, 0.08, 0.05]);
const shaker = new THREE.Group(); closeSet.add(shaker);
mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.5 }), shaker);
mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.34, 32), new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (g) => { g.fillStyle = '#FFB020'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = '700 64px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FÉCULA', 128, 66); g.fillText('FÉCULA', 384, 66); }) }), shaker);
mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.14, 32), new THREE.MeshPhysicalMaterial({ color: 0xd8dde5, metalness: 1, roughness: 0.25 }), shaker, [0, 0.44, 0]);
const powder = []; { const R = rng(77); for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.3 })); closeSet.add(m); powder.push({ m, b: R(), v: V3((R() - 0.5) * 0.5, -0.2 - R() * 0.4, (R() - 0.5) * 0.4), s: 0.02 + R() * 0.025 }); } }
const comb = new THREE.Group(); closeSet.add(comb);
const combMat = new THREE.MeshPhysicalMaterial({ color: 0x18C4B8, roughness: 0.25, clearcoat: 1 });
mesh(new RoundedBoxGeometry(1.7, 0.26, 0.12, 3, 0.05), combMat, comb, [0, 0.13, 0]);
for (let i = 0; i < 17; i++) mesh(new RoundedBoxGeometry(0.05, 0.42, 0.06, 2, 0.02), combMat, comb, [-0.78 + i * 0.0975, -0.2, 0]);
const closeSparks = []; for (let i = 0; i < 30; i++) { const s = sprite(TEX.spark, 0.25); closeSet.add(s); closeSparks.push(s); }

function skinDisp(x, z, bulge) { const dx = x - KC.x, dz = z - KC.z; return bulge * Math.exp(-(dx * dx + dz * dz) / 0.35); }
function updateSkin(bulge) {
  const p = skinGeo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) p[i + 1] = skinBase[i + 1] + skinDisp(skinBase[i], skinBase[i + 2], bulge);
  skinGeo.attributes.position.needsUpdate = true; skinGeo.computeVertexNormals();
}
// estado del primer plano: T=tensión (convergencia), knotY, bulge, knotScale
function updateHair(t, st) {
  const K = V3(KC.x, st.knotY, KC.z);
  STR.forEach((s, i) => {
    const w = s.conv * st.T;
    const ry = skinDisp(s.x, s.z, st.bulge);
    const R0 = V3(s.x, ry, s.z);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const sw = Math.sin(t * 1.6 + s.ph + u * 2) * s.sway * u * u;
      const F = V3(s.x + sw + s.lean * u * u, ry + u * s.L, s.z + Math.cos(t * 1.3 + s.ph) * 0.06 * u);
      let C;
      if (u <= 0.5) { const e = easeInOut(u / 0.5); C = R0.clone().lerp(K.clone().add(s.off.clone().multiplyScalar(0.55)), e); C.y = lerp(ry, K.y + s.off.y * 0.5, Math.sin(e * Math.PI / 2)); }
      else { const e = (u - 0.5) / 0.5; C = K.clone().add(s.off.clone().multiplyScalar(0.55 + e * 1.4)); C.y += e * 0.95 + sw * 0.5; C.x += sw; }
      pts.push(F.lerp(C, w));
    }
    hairMeshes[i].geometry.dispose();
    hairMeshes[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.024, 5, false);
  });
  closeKnot.position.copy(K);
  closeKnot.scale.setScalar(Math.max(0.001, st.knotScale));
  closeKnot.rotation.set(t * 0.6, t * 0.9, 0.3);
  updateSkin(st.bulge);
}

// ================================================================ SET: CALENDARIO
const calSet = new THREE.Group(); scene.add(calSet);
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
mesh(new RoundedBoxGeometry(3.3, 2.9, 0.2, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, clearcoat: 0.4 }), calSet, [0, 1.75, -0.2]);
mesh(new RoundedBoxGeometry(3.3, 0.6, 0.3, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xFF5A5F, roughness: 0.35, clearcoat: 0.5 }), calSet, [0, 3.0, -0.12]);
const calTitle = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.45), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(1024, 180, (g) => { g.fillStyle = '#fff'; g.font = '700 130px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SEMANA', 512, 98); }) }));
calTitle.position.set(0, 3.0, 0.04); calSet.add(calTitle);
for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 12), new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 1, roughness: 0.2 }), calSet, [s * 1.0, 3.35, -0.05]);
const dayCubes = DAYS.map((d, i) => {
  const g = new THREE.Group(); calSet.add(g);
  const row = i < 4 ? 0 : 1, col = i < 4 ? i : i - 4, n = row ? 3 : 4;
  g.position.set((col - (n - 1) / 2) * 0.78, row ? 1.0 : 2.0, 0.05);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xF1F3F8, roughness: 0.35, clearcoat: 0.6, emissive: 0x000000 });
  mesh(new RoundedBoxGeometry(0.66, 0.66, 0.3, 4, 0.1), mat, g);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(256, 256, (c) => { c.fillStyle = '#2b2b45'; c.font = '700 170px Fredoka'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d, 128, 140); }) }));
  lbl.position.z = 0.16; g.add(lbl);
  const chk = sprite(TEX.check, 0.36); chk.position.set(0.26, 0.26, 0.25); g.add(chk);
  return { g, mat, chk };
});
const calBrush = makeBrush(); calBrush.scale.setScalar(0.7); calSet.add(calBrush);

// ================================================================ SET: AVISO (tijeras / profesional)
const warnSet = new THREE.Group(); scene.add(warnSet);
const steel = new THREE.MeshPhysicalMaterial({ color: 0xE6EBF2, metalness: 1, roughness: 0.18 });
const handleMat = new THREE.MeshPhysicalMaterial({ color: 0xFF4D6D, roughness: 0.3, clearcoat: 1 });
const bladeShape = new THREE.Shape(); bladeShape.moveTo(0, -0.07); bladeShape.lineTo(1.5, -0.01); bladeShape.quadraticCurveTo(1.6, 0.0, 1.5, 0.05); bladeShape.lineTo(0, 0.12); bladeShape.lineTo(-0.2, 0.05); bladeShape.closePath();
const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
const scissors = new THREE.Group(); warnSet.add(scissors);
const blades = [1, -1].map(s => { const g = new THREE.Group(); scissors.add(g); mesh(bladeGeo, steel, g, [0, 0, s * 0.03]); const arm = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.05), steel, g, [-0.35, -s * 0.12, s * 0.03], null, [0, 0, s * 0.45]); arm; mesh(new THREE.TorusGeometry(0.2, 0.06, 12, 32), handleMat, g, [-0.75, -s * 0.3, s * 0.03], [1, 0.8, 1]); return g; });
mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 20), new THREE.MeshPhysicalMaterial({ color: 0xF5B324, metalness: 1, roughness: 0.2 }), scissors, [0, 0, 0], null, [Math.PI / 2, 0, 0]);
const noSign = new THREE.Group(); warnSet.add(noSign);
const redMat = new THREE.MeshPhysicalMaterial({ color: 0xFF1F3D, roughness: 0.3, clearcoat: 1, emissive: 0x550010 });
mesh(new THREE.TorusGeometry(1.25, 0.13, 20, 80), redMat, noSign);
mesh(new RoundedBoxGeometry(2.45, 0.24, 0.2, 3, 0.08), redMat, noSign, [0, 0, 0], null, [0, 0, -Math.PI / 4]);
const medal = new THREE.Group(); warnSet.add(medal);
mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.18, 64), new THREE.MeshPhysicalMaterial({ color: 0xF5B324, metalness: 0.95, roughness: 0.22 }), medal, [0, 0, 0], null, [Math.PI / 2, 0, 0]);
mesh(new THREE.TorusGeometry(0.95, 0.07, 16, 64), new THREE.MeshPhysicalMaterial({ color: 0xFFD96A, metalness: 1, roughness: 0.15 }), medal);
const pawMat = new THREE.MeshPhysicalMaterial({ color: 0x7A3E14, roughness: 0.4, clearcoat: 0.5 });
mesh(sph, pawMat, medal, [0, -0.15, 0.1], [0.32, 0.26, 0.1]);
[[-0.38, 0.18], [-0.13, 0.4], [0.13, 0.4], [0.38, 0.18]].forEach(([x, y]) => mesh(sph, pawMat, medal, [x, y, 0.1], [0.12, 0.15, 0.08]));
for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.45, 1.3, 0.05), new THREE.MeshStandardMaterial({ color: s > 0 ? 0x3B82F6 : 0x60A5FA, roughness: 0.6 }), medal, [s * 0.35, -1.1, -0.15], null, [0, 0, s * 0.3]);
const warnSparks = []; for (let i = 0; i < 24; i++) { const s = sprite(TEX.spark, 0.3); warnSet.add(s); warnSparks.push(s); }

// ================================================================ actualización por escena
const SETS = [dogSet, giftSet, closeSet, calSet, warnSet];
function show(...on) { SETS.forEach(s => s.visible = on.includes(s)); }
function cam(pos, look, fov = 38) { camera.position.copy(pos); camera.lookAt(look); camera.fov = fov; camera.updateProjectionMatrix(); }
function shake(t, amt) { camera.position.x += Math.sin(t * 61) * amt; camera.position.y += Math.cos(t * 53) * amt; }
function groundColor(hex, vis = true) { ground.visible = vis; M.ground.color.setHex(hex); }

function knotPain(t, k, i, amount) {
  const f = (t * 1.4 + i * 0.33) % 1, f2 = (t * 1.4 + i * 0.33 + 0.5) % 1;
  k.ring.scale.setScalar(0.6 + f * 1.6); k.ring.material.opacity = (1 - f) * amount;
  k.ring2.scale.setScalar(0.6 + f2 * 1.6); k.ring2.material.opacity = (1 - f2) * amount;
  k.ring.visible = k.ring2.visible = amount > 0.01;
}

function sceneHook(t, lt) {
  show(dogSet); scene.background = BG.hook; groundColor(0x5a2540);
  const dur = RANGES.hook[1];
  M.matted.emissiveIntensity = 0.35 + 0.35 * Math.sin(t * 9);
  dog.g.rotation.y = -0.55; dog.g.position.z = 0; brush.visible = false; hearts.forEach(h => h.visible = false); deadHair.visible = false; sparkPool.forEach(s => s.visible = false);
  dog.knots.forEach((k, i) => { k.g.visible = true; k.g.scale.setScalar(1.25); knotPain(t, k, i, 1); });
  dog.pose(t, { mood: -1, pain: 1, tilt: 0.12 });
  dog.bang.visible = true; const bp = pop(0.15, lt, 0.4); dog.bang.scale.setScalar(0.6 * bp * (1 + 0.08 * Math.sin(t * 12))); dog.bang.position.set(1.1, 3.35, 0.3);
  // gancho: arranca en el nudo (súper cerca), se aleja de golpe y vuelve a empujar
  const kp = dog.knots[0].g.getWorldPosition(V3());
  const a = easeOutCubic(lt / 0.9), b = ss(1.2, dur, lt);
  const hp = dog.head.getWorldPosition(V3()); const mid = kp.clone().lerp(hp, 0.45);
  const far = V3(0.4, 2.0, 8.2), near = mid.clone().add(V3(0.5, 0.1, 2.6));
  const p = near.clone().lerp(far, a).lerp(mid.clone().add(V3(0.8, 0.15, 4.6)), b * 0.85);
  const look = mid.clone().lerp(V3(0, 1.7, 0), a).lerp(mid.clone().add(V3(-0.1, -0.15, 0)), b * 0.85);
  cam(p, look, 38 - 4 * b); shake(t, 0.05 * (1 - ss(0, 0.6, lt)) + 0.012);
  fill.intensity = 0;
}

function sceneIntro(t, lt, dur) {
  show(giftSet); scene.background = BG.intro; groundColor(0xf3a0d0);
  giftBox.position.y = 0; giftBox.rotation.set(0, Math.sin(t * 1.2) * 0.25 - 0.2, 0);
  const sh = Math.max(0, Math.sin(t * 9)) * 0.05 * (Math.sin(t * 2.3) > 0.4 ? 1 : 0);
  giftBox.rotation.z = sh; lid.position.y = 1.2 + sh * 2; lid.rotation.set(0, 0, 0); lid.position.x = 0;
  const gp = pop(0, lt, 0.6); giftBox.scale.setScalar(gp);
  lock.visible = true; shackle.position.y = 0.21; shackle.rotation.y = 0;
  quest.visible = true; quest.scale.setScalar(0.75 * pop(0.6, lt) * (1 + 0.06 * Math.sin(t * 6))); quest.position.set(0.0, 2.25 + Math.sin(t * 3) * 0.08, 0.3);
  giftDog.g.visible = true; giftDog.g.position.set(-1.0, 0, -0.6); giftDog.g.rotation.y = 0.5;
  giftDog.pose(t, { mood: 0.3, wag: 0.6, tilt: 0.25 * Math.sin(t * 1.5) });
  giftSparks.forEach((s, i) => { const a = i / giftSparks.length * 6.28 + t * 0.4; const r = 1.6 + 0.2 * Math.sin(i * 3 + t * 2); s.visible = true; s.position.set(Math.cos(a) * r, 0.9 + Math.sin(i * 1.7 + t * 1.5) * 0.9, Math.sin(a) * r); s.scale.setScalar(0.18 * (0.5 + 0.5 * Math.sin(t * 5 + i))); });
  glowBurst.visible = false;
  const o = lt / dur;
  cam(V3(Math.sin(o * 0.8 - 0.4) * 6.4, 2.4 - o * 0.5, Math.cos(o * 0.8 - 0.4) * 6.4), V3(-0.15, 1.15, 0), 40);
}

function sceneTrucoOpen(t, lt) {
  show(giftSet); scene.background = BG.intro; groundColor(0xf3a0d0);
  giftBox.scale.setScalar(1); giftBox.rotation.set(0, -0.1, 0); giftBox.position.y = 0;
  const u = ss(0.1, 0.5, lt), v = ss(0.45, 1.0, lt);
  shackle.position.y = 0.21 + u * 0.12; shackle.rotation.y = u * 1.6;
  lock.visible = lt < 0.75; lock.position.y = 0.62 - ss(0.5, 0.75, lt) * 1.2;
  lid.position.y = 1.2 + v * 2.4; lid.position.x = v * 0.8; lid.rotation.set(-v * 0.6, 0, -v * 0.9);
  quest.visible = false; giftDog.g.visible = true; giftDog.g.position.set(-1.0, 0, -0.6); giftDog.g.rotation.y = 0.5; giftDog.pose(t, { mood: 1, wag: 1, bounce: 0.3 });
  glowBurst.visible = true; glowBurst.scale.setScalar(0.5 + v * 4.5); glowBurst.material.opacity = v * (1 - ss(1.1, 1.5, lt) * 0.5);
  giftSparks.forEach((s, i) => { const R = rng(i + 3); const d = V3(R() - 0.5, 0.6 + R(), R() - 0.5).normalize(); const e = easeOutCubic((lt - 0.5) / 0.9); s.visible = lt > 0.5; s.position.set(0, 1.4, 0).add(d.multiplyScalar(e * (2 + R() * 1.5))); s.scale.setScalar(0.35 * (1 - e * 0.7)); });
  const c = ss(0.6, TRUCO_OPEN, lt);
  cam(V3(0, 2.3 + c * 0.6, 6.0 - c * 4.8), V3(0, 1.2 + c * 0.4, 0), 40);
}

function closeDefaults() {
  inflam.forEach(m => m.visible = false); drops.forEach(d => d.m.visible = false); dirt.forEach(d => d.m.visible = false); bacts.forEach(b => b.visible = false);
  hand.visible = false; shaker.visible = false; powder.forEach(p => p.m.visible = false); comb.visible = false; closeSparks.forEach(s => s.visible = false);
  closeBang.visible = false; closeCross.visible = false; closeCheck.visible = false; goodGlow.visible = false; painGlow.visible = true; painRings.forEach(r => r.visible = true);
  hairMat.color.setHex(0xDDA060); ckMat.color.setHex(0xA86A36); skinMat.color.setHex(0xF6B8A8); skinMat.emissive.setHex(0x000000);
}
function painFx(t, amount) {
  painGlow.material.opacity = amount * (0.55 + 0.45 * Math.sin(t * 8)); painGlow.scale.setScalar(1 + 0.15 * Math.sin(t * 8));
  painRings.forEach((r, i) => { const f = (t * 1.2 + i / 3) % 1; r.scale.setScalar(0.5 + f * 2.2); r.material.opacity = (1 - f) * amount; });
  ckMat.emissiveIntensity = amount * (0.25 + 0.25 * Math.sin(t * 8));
}

function sceneProblema(t, lt, dur) {
  show(closeSet); scene.background = BG.problema; groundColor(0, false); closeDefaults();
  const s = SEG.problema;
  const form = ss(0.3, wt('problema', 'forma') - RANGES.problema[0] + 0.6, lt);
  const tJala = wt('problema', 'jala') - RANGES.problema[0];
  const pull = lt > tJala - 0.3 ? Math.pow(Math.max(0, Math.sin((lt - tJala + 0.3) * 5.2)), 2) : 0;
  const tighten = ss(wt('problema', 'aprietan') - RANGES.problema[0] - 0.3, wt('problema', 'piel') - RANGES.problema[0], lt);
  const T = form;
  const st = { T, knotY: lerp(1.55, 1.05, tighten) + pull * 0.35, bulge: (0.08 * tighten + pull * 0.32) * T, knotScale: easeOutBack(form) * lerp(1.15, 0.9, tighten) };
  updateHair(t, st);
  painFx(t, Math.max(tighten * 0.35, pull) * T);
  closeBang.visible = pull > 0.2; closeBang.position.set(0.75, 2.2, 0.6); closeBang.scale.setScalar(0.55 * (0.7 + pull * 0.5));
  const o = lt / dur;
  cam(V3(lerp(-1.6, 1.4, easeInOut(o)), 1.9 - o * 0.3, 4.8 - o * 0.8), V3(0, 1.0, 0.2), 40);
  shake(t, pull * 0.03);
}

function sceneDano(t, lt, dur) {
  show(closeSet); scene.background = BG.dano; groundColor(0, false); closeDefaults();
  const r0 = RANGES.dano[0];
  const pull = Math.pow(Math.max(0, Math.sin(lt * 4.5)), 2);
  const st = { T: 1, knotY: 0.95 + pull * 0.25, bulge: 0.1 + pull * 0.22, knotScale: 0.9 };
  updateHair(t, st); painFx(t, 0.6 + 0.4 * pull);
  const tIrr = wt('dano', 'irritacion') - r0, tHum = wt('dano', 'humedad') - r0, tSuc = wt('dano', 'suciedad') - r0, tHer = wt('dano', 'heridas') - r0, tInf = wt('dano', 'infecciones') - r0;
  skinMat.color.setHex(0xF6B8A8).lerp(new THREE.Color(0xF08A86), ss(tIrr - 0.3, tIrr + 0.6, lt));
  inflam.forEach((m, i) => { const a = ss(tIrr - 0.2 + i * 0.15, tIrr + 0.5 + i * 0.15, lt); m.visible = a > 0; const y = skinDisp(m.position.x, m.position.z, st.bulge); m.position.y = y + 0.012; m.scale.setScalar((0.55 + 0.35 * a) * (1 + 0.06 * Math.sin(t * 6 + i))); m.material.opacity = a * (lt > tHer ? 1 : 0.75); });
  drops.forEach(d => { const a = (lt - tHum - d.d) / 0.6; d.m.visible = a > 0; if (a <= 0) return; const e = clamp(a); d.m.position.set(d.to.x, lerp(2.6, skinDisp(d.to.x, d.to.z, st.bulge) + d.s * 0.7, e * e), d.to.z); const sq = a > 1 ? 1 : 1; d.m.scale.set(d.s, d.s * (a > 1 ? 0.7 : 1.3) * sq, d.s); });
  const K = V3(KC.x, st.knotY, KC.z);
  dirt.forEach(d => { const a = pop(tSuc + d.d, lt, 0.4); d.m.visible = lt > tSuc + d.d; d.m.position.copy(K).add(d.off); if (d.off.y < -0.25) d.m.position.y = skinDisp(d.m.position.x, d.m.position.z, st.bulge) + 0.03; d.m.scale.setScalar(d.s * a); d.m.rotation.set(d.rot, d.rot * 2, 0); });
  bacts.forEach((b, i) => { const a = pop(tInf + i * 0.18, lt, 0.5); b.visible = lt > tInf + i * 0.18; b.scale.setScalar(a * (1 + 0.08 * Math.sin(t * 7 + i))); b.rotation.set(Math.sin(t * 2 + i) * 0.3, t * 0.8 + i, 0); b.position.y = 0.25 + 0.06 * Math.sin(t * 3 + i); });
  const o = lt / dur;
  cam(V3(lerp(1.2, -0.6, easeInOut(o)), lerp(2.3, 1.7, o), lerp(4.0, 3.2, o)), V3(0, 0.75, 0.4), 40);
  shake(t, pull * 0.02);
}

function sceneTruco(t, lt, dur) {
  if (lt < TRUCO_OPEN) return sceneTrucoOpen(t, lt);
  show(closeSet); scene.background = BG.truco; groundColor(0, false); closeDefaults();
  const r0 = RANGES.truco[0];
  const tNunca = wt('truco', 'nunca') - r0, tSuj = wt('truco', 'sujeta') - r0, tApl = wt('truco', 'aplica') - r0, tDes = wt('truco', 'desenreda') - r0, tEnd = dur;
  // 1) forma incorrecta: jalar el nudo
  const wrong = lt > tNunca - 0.2 && lt < tSuj - 0.1;
  const yank = wrong ? Math.pow(Math.max(0, Math.sin((lt - tNunca) * 6)), 2) : 0;
  // 2) peine: pasadas de la punta a la raíz
  const combStart = tDes - 0.2, strokes = 4, sd = Math.max(0.6, (tEnd - 1.0 - combStart) / strokes);
  const ci = clamp((lt - combStart) / (sd * strokes)) * strokes;
  const T = 1 - ss(0, strokes, ci) * 1.0;
  const powderAmt = ss(tApl, tApl + 1.5, lt);
  const st = { T: Math.max(T, 0.0001), knotY: 1.0 + yank * 0.45 + (1 - T) * 0.3, bulge: (0.06 + yank * 0.38) * T * (lt < tSuj ? 1 : 0), knotScale: 0.9 * ss(0.05, 0.5, T) * (1 - 0.15 * (1 - T)) };
  updateHair(t, st);
  painFx(t, wrong ? yank : 0);
  painGlow.visible = wrong; painRings.forEach(r => r.visible = wrong);
  closeCross.visible = wrong; closeCross.position.set(0.0, 2.55, 0.6); closeCross.scale.setScalar(0.85 * pop(tNunca, lt));
  ckMat.color.setHex(0xA86A36).lerp(new THREE.Color(0xF4E8DA), powderAmt * 0.6);
  // mano sujetando cerca de la raíz
  const hIn = easeOutCubic((lt - tSuj + 0.2) / 0.6);
  hand.visible = lt > tSuj - 0.2; hand.position.set(lerp(2.4, 0, hIn), 0, 0); hand.scale.setScalar(1);
  // salero de fécula
  const shIn = ss(tApl - 0.3, tApl + 0.2, lt), shOut = ss(tDes - 0.4, tDes, lt);
  shaker.visible = shIn > 0 && shOut < 1; shaker.position.set(lerp(2.0, 0.75, shIn) + shOut * 1.5, 2.2 + shOut * 0.8, 0.4); shaker.rotation.set(0, 0, 2.2 + Math.sin(t * 14) * 0.15 * shIn);
  const cap = V3(shaker.position.x - 0.42, shaker.position.y - 0.25, 0.4);
  powder.forEach(p => { const life = 0.9, period = 0.9; const age = ((lt - tApl - p.b * period) % period + period) % period; const on = lt > tApl + p.b * period && lt < tDes; p.m.visible = on; if (!on) return; const e = age / life; p.m.position.set(cap.x + p.v.x * e - 0.25 * e, cap.y + p.v.y * e - 1.1 * e * e, cap.z + p.v.z * e); p.m.scale.setScalar(p.s * (1 - e * 0.3)); });
  // peine
  comb.visible = lt > combStart - 0.3 && lt < tEnd - 0.2;
  const k = Math.floor(ci), f = ci - k;
  const top = 3.0, bottom = lerp(2.2, 0.55, clamp(k / (strokes - 1)));
  comb.position.set(0.0, lt < combStart ? top + 0.3 : lerp(top, bottom, easeInOut(Math.min(1, f * 1.25))), 0.25);
  comb.rotation.set(0.1, 0, Math.sin(t * 3) * 0.05);
  // final: sin nudo
  const done = ss(0.15, 0, T);
  closeCheck.visible = done > 0; closeCheck.position.set(0.5, 1.7, 0.8); closeCheck.scale.setScalar(0.45 * easeOutBack(done));
  goodGlow.visible = done > 0; goodGlow.material.opacity = done * (0.6 + 0.3 * Math.sin(t * 5));
  closeSparks.forEach((s, i) => { const R = rng(i + 99); s.visible = done > 0; s.position.set((R() - 0.5) * 2.4, 0.4 + R() * 2.4, (R() - 0.2) * 1.2); s.scale.setScalar(0.25 * done * (0.5 + 0.5 * Math.sin(t * 6 + i))); });
  const o = (lt - TRUCO_OPEN) / (dur - TRUCO_OPEN);
  cam(V3(lerp(0.9, -0.7, easeInOut(o)), 2.0, lerp(5.4, 4.8, o)), V3(0, 1.2, 0.2), 40);
  shake(t, yank * 0.025);
}

function brushPath(lt, strokeDur, k) {
  // recorrido del cepillo sobre el costado del perro (coordenadas locales del cuerpo)
  const f = (lt / strokeDur) % 1;
  const kn = dog.knots[k % 3];
  const d0 = kn.dir.clone().add(V3(-0.1, 0.45, 0.05)).normalize(), d1 = kn.dir.clone().add(V3(0.15, -0.45, -0.1)).normalize();
  const e = easeInOut(f);
  const d = d0.clone().lerp(d1, e).normalize();
  const T = dog.torso; const p = V3(d.x * T.s.x, d.y * T.s.y, d.z * T.s.z).multiplyScalar(1.12).add(T.c);
  return { p, d, f, lift: Math.sin(f * Math.PI) };
}

function sceneSolucion(t, lt, dur) {
  show(dogSet); scene.background = BG.solucion; groundColor(0xcdeffd);
  dog.bang.visible = false; hearts.forEach(h => h.visible = false); M.matted.emissiveIntensity = 0;
  dog.g.rotation.y = -0.5; brush.visible = true; deadHair.visible = true;
  const SD = 1.3; const k = Math.floor(lt / SD);
  const bp = brushPath(lt, SD, k);
  // cepillo en coordenadas del perro -> mundo
  const wp = bp.p.clone(); dog.body.localToWorld(wp);
  const wd = bp.d.clone().applyQuaternion(dog.g.quaternion);
  brush.position.copy(wp).add(wd.clone().multiplyScalar(0.12 * (1 - bp.lift * 0.3) + 0.05));
  brush.quaternion.setFromUnitVectors(V3(0, -1, 0), wd.clone().negate());
  brush.rotateY(1.2);
  brush.scale.setScalar(ss(0, 0.4, lt));
  // los nudos desaparecen uno por uno
  dog.knots.forEach((kn, i) => { const tk = SD * (i + 0.5); const a = 1 - ss(tk - 0.4, tk + 0.1, lt); kn.g.visible = a > 0.01; kn.g.scale.setScalar(Math.max(0.001, a)); knotPain(t, kn, i, 0); });
  const happy = ss(SD * 2.6, SD * 3.4, lt);
  dog.pose(t, { mood: lerp(-0.6, 1, ss(SD * 0.5, SD * 3.4, lt)), wag: happy, bounce: happy * 0.12, tilt: 0.1 * Math.sin(t * 2) * happy });
  // chispas al quitar cada nudo
  sparkPool.forEach((s, j) => { const i = j % 3; const tk = SD * (i + 0.5); const age = lt - tk + 0.1; const R = rng(j + 1); s.visible = age > 0 && age < 0.9 && j < 30; if (!s.visible) return; const p = dog.knots[i].pos.clone(); dog.body.localToWorld(p); const d = V3(R() - 0.5, R() - 0.3, R() - 0.5).normalize(); s.position.copy(p).add(d.multiplyScalar(easeOutCubic(age / 0.9) * 0.8)); s.scale.setScalar(0.3 * (1 - age / 0.9)); });
  // pelo muerto cayendo
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let j = 0; j < 40; j++) {
    const R = rng(j + 500); const ts = j * 0.2 + 0.3; const age = lt - ts;
    let p = V3(0, -10, 0);
    if (age > 0) { const b = brushPath(ts, SD, Math.floor(ts / SD)); const w = b.p.clone(); dog.body.localToWorld(w); const wdd = b.d.clone().applyQuaternion(dog.g.quaternion); w.add(wdd.multiplyScalar(0.2)); const vx = (R() - 0.5) * 0.6 + wdd.x * 0.4; p = V3(w.x + vx * age, Math.max(0.05, w.y + 0.4 * age - 2.6 * age * age), w.z + (R() + 0.3) * 0.5 * age); }
    q.setFromEuler(new THREE.Euler(j, j * 2, age * 2)); const r = 0.05 + R() * 0.04; m4.compose(p, q, V3(r, r * 0.6, r)); deadHair.setMatrixAt(j, m4);
  }
  deadHair.instanceMatrix.needsUpdate = true;
  const o = lt / dur;
  cam(V3(lerp(2.2, 1.0, easeInOut(o)), lerp(2.3, 2.6, o), lerp(5.6, 7.6, easeInOut(o))), V3(0.3, 1.45, 0), 40);
}

function sceneFrecuencia(t, lt, dur) {
  show(calSet); scene.background = BG.frecuencia; groundColor(0xffe39a);
  const r0 = RANGES.frecuencia[0];
  const tDos = wt('frecuencia', 'dos') - r0, tDiario = wt('frecuencia', 'diario') - r0;
  calSet.scale.setScalar(pop(0, lt, 0.5)); calSet.rotation.y = Math.sin(t * 1.1) * 0.15;
  const picks = [0, 2, 4];
  dayCubes.forEach((d, i) => {
    const pi = picks.indexOf(i);
    const aOn = pi >= 0 ? ss(tDos + pi * 0.35, tDos + pi * 0.35 + 0.25, lt) : 0;
    const aAll = ss(tDiario - 0.1 + i * 0.09, tDiario + 0.15 + i * 0.09, lt);
    const col = new THREE.Color(0xF1F3F8).lerp(new THREE.Color(0x4ADE80), aOn).lerp(new THREE.Color(0xFF9F1C), aAll);
    d.mat.color.copy(col); d.mat.emissive.copy(col).multiplyScalar(0.25 * Math.max(aOn, aAll));
    const pj = pi >= 0 ? pop(tDos + pi * 0.35, lt, 0.35) : 0, pa = pop(tDiario - 0.1 + i * 0.09, lt, 0.35);
    d.g.position.z = 0.05 + 0.25 * Math.max(Math.sin(clamp(pj) * Math.PI), Math.sin(clamp(pa) * Math.PI));
    d.chk.visible = aOn > 0.5 || aAll > 0.5; d.chk.scale.setScalar(0.36 * Math.max(aOn, aAll));
  });
  // cepillo que "salta" de día en día
  const idx = lt < tDiario ? picks[clamp(Math.floor((lt - tDos) / 0.35), 0, 2)] : Math.min(6, Math.floor((lt - tDiario + 0.1) / 0.09));
  const tgt = dayCubes[lt < tDos ? 0 : idx].g.position;
  calBrush.position.set(tgt.x + 0.2, tgt.y + 0.55 + Math.abs(Math.sin(t * 7)) * 0.2, 0.7); calBrush.rotation.set(0.3, -0.4, 0.25);
  cam(V3(0.4, 2.2, 9.4 - lt * 0.15), V3(0, 1.95, 0), 40);
}

function sceneAviso(t, lt, dur) {
  show(warnSet); scene.background = BG.aviso; groundColor(0xffc2a6, false);
  const r0 = RANGES.aviso[0];
  const tNo = wt('aviso', 'no') - r0, tPro = wt('aviso', 'llevalo') - r0;
  const swap = ss(tPro - 0.2, tPro + 0.35, lt);
  scissors.visible = swap < 1; scissors.position.set(0, 1.8 - swap * 0.4, 0); scissors.scale.setScalar(pop(0, lt) * (1 - swap));
  const snip = Math.abs(Math.sin(t * 7)) * 0.35;
  blades[0].rotation.z = snip; blades[1].rotation.z = -snip;
  scissors.rotation.set(0.2, Math.sin(t * 1.3) * 0.4, -0.5 + Math.sin(t * 40) * 0.03 * ss(tNo, tNo + 0.2, lt));
  noSign.visible = swap < 1; noSign.position.set(0.1, 1.8, 0.35); noSign.scale.setScalar(easeOutBack((lt - tNo + 0.1) / 0.45) * (1 - swap)); noSign.rotation.y = Math.sin(t * 1.3) * 0.2;
  medal.visible = swap > 0; medal.position.set(0, 2.05 + Math.sin(t * 2) * 0.06, 0); medal.scale.setScalar(easeOutBack(swap)); medal.rotation.y = (1 - swap) * 3 + Math.sin(t * 1.5) * 0.3;
  warnSparks.forEach((s, i) => { const a = i / warnSparks.length * 6.28 + t * 0.6; s.visible = swap > 0.5; s.position.set(Math.cos(a) * 1.5, 2.0 + Math.sin(a) * 1.5, 0.2); s.scale.setScalar(0.3 * (0.4 + 0.6 * Math.sin(t * 6 + i * 2)) * swap); });
  cam(V3(0, 2.0, 6.6 - lt * 0.12), V3(0, 1.9, 0), 40);
  fill.intensity = 0;
}

function sceneCta(t, lt, dur) {
  show(dogSet); scene.background = BG.cta; groundColor(0xd8b4fe);
  dog.bang.visible = false; brush.visible = false; deadHair.visible = false; sparkPool.forEach(s => s.visible = false);
  dog.knots.forEach(k => k.g.visible = false);
  dog.g.rotation.y = Math.sin(t * 1.2) * 0.25;
  dog.pose(t, { mood: 1, wag: 1, bounce: 0.35, tilt: 0.15 * Math.sin(t * 2.5) });
  hearts.forEach((h, i) => { const R = rng(i + 31); const per = 2.2, age = ((lt - R() * per) % per + per) % per; h.visible = lt > R() * 0.8; const a = (R() - 0.5) * 3.2; h.position.set(a, 1.2 + age * 1.6, -0.4 + R() * 1.2); h.rotation.set(0, Math.sin(t * 2 + i) * 0.6, Math.sin(t * 1.5 + i) * 0.2); h.scale.setScalar(0.3 * Math.sin(clamp(age / per) * Math.PI) + 0.001); });
  cam(V3(Math.sin(lt * 0.3) * 1.2, 2.2, 7.2), V3(0, 1.75, 0), 40);
}

const SCENES = { hook: sceneHook, intro: sceneIntro, problema: sceneProblema, dano: sceneDano, solucion: sceneSolucion, frecuencia: sceneFrecuencia, truco: sceneTruco, aviso: sceneAviso, cta: sceneCta };
function sceneAt(t) { for (const id of ORDER) if (t >= RANGES[id][0] && t < RANGES[id][1]) return id; return ORDER[ORDER.length - 1]; }

// ================================================================ OVERLAY 2D (textos)
const out = document.getElementById('out'); const ctx = out.getContext('2d');
const FONT = (sz, w = 700) => `${w} ${sz}px Fredoka`;
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const isKey = w => { const l = w.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, ''); return l.length > 1 && l === l.toUpperCase(); };

function wrapWords(words, font, maxW) {
  ctx.font = font; const lines = []; let cur = [];
  for (const w of words) { const test = [...cur, w].join(' '); if (ctx.measureText(test).width > maxW && cur.length) { lines.push(cur); cur = [w]; } else cur.push(w); }
  if (cur.length) lines.push(cur); return lines;
}

function drawHeadline(t, id) {
  const s = SEG[id]; const [a] = RANGES[id];
  let lt = t - a; if (id === 'truco') lt -= TRUCO_OPEN * 0.6;
  if (lt < 0) return;
  const k = easeOutBack(lt / 0.45);
  const words = s.caption.split(' ');
  const fs = 66, lh = 80; const lines = wrapWords(words, FONT(fs), 900);
  const boxW = Math.max(...lines.map(l => { ctx.font = FONT(fs); return ctx.measureText(l.join(' ')).width; })) + 70, boxH = lines.length * lh + 40;
  ctx.save(); ctx.translate(W / 2, 300 + boxH / 2); ctx.scale(k, k); ctx.rotate(-0.02);
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff'; rrect(-boxW / 2, -boxH / 2, boxW, boxH, 34); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.textBaseline = 'middle'; ctx.font = FONT(fs);
  lines.forEach((l, li) => {
    const full = l.join(' '); let x = -ctx.measureText(full).width / 2; const y = -boxH / 2 + 20 + lh * li + lh / 2 + 4;
    l.forEach(w => { ctx.fillStyle = isKey(w) ? '#FF3D71' : '#26203d'; ctx.fillText(w, x, y); x += ctx.measureText(w + ' ').width; });
  });
  ctx.restore();
}

function drawSubs(t) {
  // subtítulos tipo karaoke de lo que se dice (bloques de ~4 palabras)
  for (const s of TL.segments) {
    if (t < s.start - 0.05 || t > s.end + 0.35) continue;
    const ws = WORDS[s.id]; const chunks = []; let cur = [];
    ws.forEach((w, i) => { cur.push(w); const brk = /[,.?!:]$/.test(w.w) || cur.length >= 4; if (brk || i === ws.length - 1) { chunks.push(cur); cur = []; } });
    let ch = chunks.find(c => t >= c[0].s - 0.05 && t < (chunks[chunks.indexOf(c) + 1]?.[0].s ?? s.end + 0.35) - 0.05) || chunks[chunks.length - 1];
    if (t < chunks[0][0].s - 0.05) return;
    const cs = ch[0].s; const k = easeOutBack((t - cs + 0.05) / 0.25);
    let fs = 84; ctx.font = FONT(fs); const text = ch.map(w => w.w.toUpperCase()).join(' ');
    while (ctx.measureText(text).width * 1.1 > 980 && fs > 50) { fs -= 4; ctx.font = FONT(fs); }
    ctx.save(); ctx.translate(W / 2, 1560); ctx.scale(k, k);
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const gap = fs * 0.42; const widths = ch.map(w => ctx.measureText(w.w.toUpperCase()).width);
    let x = -(widths.reduce((a, b) => a + b, 0) + gap * (ch.length - 1)) / 2;
    const all = WORDS[s.id];
    ch.forEach((w, wi) => {
      const word = w.w.toUpperCase(); const nx = all[all.indexOf(w) + 1]; const active = t >= w.s && t < (nx ? nx.s : w.e + 0.2);
      ctx.lineWidth = 16; ctx.strokeStyle = '#120a1c'; ctx.strokeText(word, x, 0);
      ctx.fillStyle = active ? '#FFE14D' : '#ffffff';
      if (active) { ctx.save(); const ww = ctx.measureText(word).width; ctx.translate(x + ww / 2, 0); ctx.scale(1.08, 1.08); ctx.strokeText(word, -ww / 2, 0); ctx.fillText(word, -ww / 2, 0); ctx.restore(); }
      else ctx.fillText(word, x, 0);
      x += widths[wi] + gap;
    });
    ctx.restore(); return;
  }
}

function drawLock(x, y, s, open, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = 7; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); if (open) { ctx.arc(10, -14, 13, Math.PI, 0); } else ctx.arc(0, -14, 13, Math.PI, 0); ctx.lineTo(open ? 23 : 13, -2); ctx.moveTo(open ? -3 : -13, -14); ctx.lineTo(open ? -3 : -13, -2); ctx.stroke();
  rrect(-20, -6, 40, 32, 7); ctx.fill(); ctx.restore();
}

function drawRetention(t) {
  // "píldora" fija: promesa de recompensa al final + barra de progreso
  const tShow = wt('intro', 'final') + 0.2, tTruco = SEG.truco.start;
  if (t < tShow || t > SEG.truco.end - 1) return;
  const k = easeOutBack((t - tShow) / 0.5); const unlocked = t >= RANGES.truco[0] + 0.5;
  const fade = 1 - ss(SEG.truco.end - 1.6, SEG.truco.end - 1, t);
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(W / 2, 150); ctx.scale(k, k);
  const label = unlocked ? '¡TRUCO DESBLOQUEADO!' : 'EL TRUCO, AL FINAL';
  ctx.font = FONT(44); const tw = ctx.measureText(label).width; const w = tw + 130, h = 84;
  ctx.fillStyle = unlocked ? '#22c55e' : 'rgba(18,10,28,0.78)'; rrect(-w / 2, -h / 2, w, h, 42); ctx.fill();
  drawLock(-w / 2 + 52, 2, 1, unlocked, unlocked ? '#fff' : '#FFD23F');
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, -w / 2 + 92, 4);
  if (!unlocked) {
    const p = clamp((t - tShow) / (tTruco - tShow));
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; rrect(-w / 2 + 30, h / 2 + 14, w - 60, 12, 6); ctx.fill();
    ctx.fillStyle = '#FFD23F'; rrect(-w / 2 + 30, h / 2 + 14, Math.max(12, (w - 60) * p), 12, 6); ctx.fill();
  }
  ctx.restore();
}

function chip(x, y, text, k, badge, badgeColor) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.font = FONT(46, 600);
  const w = ctx.measureText(text).width + 120, h = 78;
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; rrect(0, -h / 2, w, h, 39); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = badgeColor; ctx.beginPath(); ctx.arc(42, 0, 26, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (badge === '✓') { ctx.beginPath(); ctx.moveTo(30, 1); ctx.lineTo(39, 10); ctx.lineTo(55, -9); ctx.stroke(); }
  else { ctx.font = FONT(38); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(badge, 42, 3); ctx.textAlign = 'left'; ctx.font = FONT(46, 600); }
  ctx.fillStyle = '#26203d'; ctx.textBaseline = 'middle'; ctx.fillText(text, 84, 3);
  ctx.restore();
}

function drawChips(t) {
  if (t > RANGES.solucion[0] && t < RANGES.solucion[1]) {
    [['Quita el pelo muerto', 'quita'], ['Reparte aceites naturales', 'reparte'], ['Detecta pulgas y bultos', 'detectar']].forEach(([txt, w], i) => chip(60, 590 + i * 96, txt, easeOutBack((t - wt('solucion', w)) / 0.4), '✓', '#22c55e'));
  }
  if (t > RANGES.truco[0] + TRUCO_OPEN && t < RANGES.truco[1]) {
    [['Sujeta cerca de la piel', 'sujeta'], ['Un poco de fécula de maíz', 'aplica'], ['De la punta a la raíz', 'desenreda']].forEach(([txt, w], i) => chip(60, 560 + i * 96, txt, easeOutBack((t - wt('truco', w)) / 0.4), String(i + 1), '#7B5CFF'));
  }
  if (t > RANGES.cta[0]) {
    const lt = t - wt('cta', 'guarda');
    const b = (x, label, color, d) => { const k = easeOutBack((lt - d) / 0.4) * (1 + 0.05 * Math.sin(t * 6 + d * 9)); if (k <= 0) return; ctx.save(); ctx.translate(x, 1330); ctx.scale(k, k); ctx.fillStyle = color; ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; rrect(-200, -52, 400, 104, 52); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.font = FONT(50); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 4); ctx.restore(); };
    b(W / 2 - 220, 'GUARDAR', '#FFB020', 0); b(W / 2 + 220, 'COMPARTIR', '#22c55e', wt('cta', 'compartelo') - wt('cta', 'guarda'));
  }
}

function drawFlash(t) {
  let a = 0; for (const id of ORDER.slice(1)) a = Math.max(a, 1 - Math.abs(t - RANGES[id][0]) / 0.12);
  a = Math.max(a, 1 - Math.abs(t - (RANGES.truco[0] + TRUCO_OPEN)) / 0.12);
  if (a > 0) { ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`; ctx.fillRect(0, 0, W, H); }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ================================================================ API de render
window.renderAt = function (t) {
  const id = sceneAt(t); const [a, b] = RANGES[id];
  SCENES[id](t, t - a, b - a);
  renderer.render(scene, camera);
  ctx.clearRect(0, 0, W, H); ctx.drawImage(glCanvas, 0, 0);
  drawVignette();
  drawHeadline(t, id); drawChips(t); drawRetention(t); drawSubs(t); drawFlash(t);
  return id;
};
window.frameJpeg = function (t, q = 0.92) { window.renderAt(t); return out.toDataURL('image/jpeg', q); };
window.DURATION = TL.duration;
window.READY = true;
