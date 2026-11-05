// Pizarra MEF: cuadros de prueba (--preview t1,t2,...) o clip completo. Uso desde la raíz: node mef/pizarra/scripts/render.mjs --preview 1,5,9
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..'); const OUT = path.join(ROOT, 'mef/pizarra/output'); fs.mkdirSync(OUT, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${server.address().port}/mef/pizarra/scene/index.html`); await page.waitForFunction('window.READY === true');
if (args.preview) {
  for (const t of args.preview.split(',').map(Number)) { const url = await page.evaluate(t => window.frameJpeg(t, 0.92), t); fs.writeFileSync(path.join(OUT, `prueba_t${t.toFixed(1)}.jpg`), Buffer.from(url.split(',')[1], 'base64')); }
} else {
  const DUR = await page.evaluate('window.DURATION'), FPS = 30;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'pizarra.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < DUR * FPS; f++) { const url = await page.evaluate(t => window.frameJpeg(t, 0.93), f / FPS); if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close(); server.close();
