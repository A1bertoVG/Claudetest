// Renderiza la escena three.js cuadro a cuadro con Chromium headless y la codifica con ffmpeg.
// Uso: node scripts/render.mjs [--fps 30] [--workers 3] [--preview t1,t2,...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const FPS = +(args.fps || 30), WORKERS = +(args.workers || 3);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const PORT = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/scene/index.html`);
  await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
  return page;
}

if (args.preview) {
  const page = await openPage(); fs.mkdirSync(path.join(ROOT, 'output/preview'), { recursive: true });
  for (const t of args.preview.split(',').map(Number)) {
    const t0 = Date.now(); const url = await page.evaluate(t => window.frameJpeg(t, 0.9), t);
    fs.writeFileSync(path.join(ROOT, `output/preview/t${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('frame', t, Date.now() - t0, 'ms');
  }
  await browser.close(); server.close(); process.exit(0);
}

const tmp = path.join(ROOT, 'output/parts'); fs.mkdirSync(tmp, { recursive: true });
const probe = await openPage(); const DUR = await probe.evaluate('window.DURATION'); await probe.close();
const N = Math.round(DUR * FPS);
console.log(`duración ${DUR}s -> ${N} cuadros, ${WORKERS} workers`);
const per = Math.ceil(N / WORKERS); let done = 0; const T0 = Date.now();
await Promise.all([...Array(WORKERS).keys()].map(async w => {
  const a = w * per, b = Math.min(N, a + per); const page = await openPage();
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(tmp, `part${w}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = a; f < b; f++) {
    const url = await page.evaluate(t => window.frameJpeg(t, 0.93), f / FPS);
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 60 === 0) { const el = (Date.now() - T0) / 1000; console.log(`${done}/${N} cuadros, ${el.toFixed(0)}s, ETA ${(el / done * (N - done)).toFixed(0)}s`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await page.close();
}));
fs.writeFileSync(path.join(tmp, 'list.txt'), [...Array(WORKERS).keys()].map(w => `file 'part${w}.mp4'`).join('\n'));
await browser.close(); server.close();
console.log('listo en', ((Date.now() - T0) / 1000).toFixed(0), 's');
