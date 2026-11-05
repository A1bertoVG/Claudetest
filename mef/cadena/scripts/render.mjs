// Renderiza cada estilo como clip vertical de 5 s y un cuadro final, con Chromium headless + ffmpeg.
// Uso (desde la raíz del repo): node mef/cadena/scripts/render.mjs
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const OUT = path.join(ROOT, 'mef/cadena/output'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${server.address().port}/mef/cadena/scene/index.html`);
await page.waitForFunction('window.READY === true');
const { DUR, N, STYLES } = await page.evaluate(() => ({ DUR: window.DURATION, N: window.NSTYLES, STYLES: window.STYLES }));
const FPS = 30;
for (let s = 0; s < N; s++) {
  await page.evaluate(n => window.setStyle(n), s);
  const name = `estilo_${STYLES[s][0]}`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${name}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < DUR * FPS; f++) { const url = await page.evaluate(t => window.frameJpeg(t, 0.93), f / FPS); if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  const url = await page.evaluate(t => window.frameJpeg(t, 0.92), DUR - 0.5); fs.writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('listo', name, STYLES[s][1]);
}
await browser.close(); server.close();
