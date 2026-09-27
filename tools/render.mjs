// Render the animation to MP4.
//
//   node tools/render.mjs                                  # 1920x1080 @ 60 fps -> out/llamaparse-sponsor-1080p60.mp4
//   node tools/render.mjs --fps 30 --out out/sponsor-30.mp4
//   node tools/render.mjs --fps 30 --scale 0.5 --out out/draft.mp4   # quick draft
//   node tools/render.mjs --audio vo.wav                   # mux your voiceover in
//
// Frames are captured from headless Chromium (one page per worker), piped to
// ffmpeg per chunk, then the chunks are joined without re-encoding.
// ffmpeg is taken from $FFMPEG, then PATH.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
};
const FPS = Number(opt('fps', 60));
const SCALE = Number(opt('scale', 1));
const CRF = Number(opt('crf', 16));
const PRESET = opt('preset', 'slow');
const WORKERS = Number(opt('workers', Math.max(1, Math.min(4, os.cpus().length - 1))));
const AUDIO = opt('audio', null);
const OUT = path.resolve(opt('out', `out/llamaparse-sponsor-${Math.round(1080 * SCALE)}p${FPS}.mp4`));
const FROM = opt('from', null);
const TO = opt('to', null);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

if (spawnSync(FFMPEG, ['-version']).status !== 0) {
  console.error(`ffmpeg not found (tried "${FFMPEG}"). Install it or set FFMPEG=/path/to/ffmpeg.`);
  process.exit(1);
}

const W = Math.round((1920 * SCALE) / 2) * 2;
const H = Math.round((1080 * SCALE) / 2) * 2;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-render-'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render`;
const browser = await chromium.launch({ args: ['--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

const probe = await openPage();
const duration = await probe.page.evaluate(() => window.__duration);
await probe.page.close();

const t0 = FROM !== null ? Number(FROM) : 0;
const t1 = TO !== null ? Number(TO) : duration;
const first = Math.round(t0 * FPS);
const last = Math.ceil(t1 * FPS) - 1;
const total = last - first + 1;
console.log(`Rendering ${total} frames (${(total / FPS).toFixed(2)}s) at ${W}x${H} ${FPS}fps with ${WORKERS} workers`);

const vf = [
  SCALE !== 1 ? `scale=${W}:${H}:flags=lanczos` : null,
  'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int',
  'format=yuv420p',
].filter(Boolean).join(',');

function encoder(file) {
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-vf', vf,
    '-c:v', 'libx264', '-preset', PRESET, '-crf', String(CRF), '-tune', 'film',
    '-g', String(FPS * 2), '-bf', '2',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    file,
  ];
  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { p, done };
}

let rendered = 0;
const started = Date.now();
function progress() {
  const el = (Date.now() - started) / 1000;
  const fps = rendered / el;
  const eta = (total - rendered) / Math.max(fps, 0.01);
  process.stdout.write(`\r  ${rendered}/${total} frames  ${fps.toFixed(1)} fps  ETA ${eta.toFixed(0)}s   `);
}

const per = Math.ceil(total / WORKERS);
const chunks = [];
for (let k = 0; k < WORKERS; k++) {
  const a = first + k * per;
  const b = Math.min(last, a + per - 1);
  if (a <= b) chunks.push({ a, b, file: path.join(tmp, `chunk${k}.mp4`) });
}

await Promise.all(chunks.map(async (c) => {
  const { page, cdp } = await openPage();
  const enc = encoder(c.file);
  for (let f = c.a; f <= c.b; f++) {
    await page.evaluate((t) => window.__seek(t), f / FPS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    const buf = Buffer.from(data, 'base64');
    if (!enc.p.stdin.write(buf)) await new Promise((r) => enc.p.stdin.once('drain', r));
    rendered++;
    if (rendered % 20 === 0) progress();
  }
  enc.p.stdin.end();
  await enc.done;
  await page.close();
}));
progress();
console.log('');

await browser.close();
server.close();

// Join chunks (and optionally mux audio)
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, chunks.map((c) => `file '${c.file}'`).join('\n'));
const joinArgs = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (AUDIO) joinArgs.push('-i', path.resolve(AUDIO), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest');
joinArgs.push('-c:v', 'copy', '-movflags', '+faststart', OUT);
const j = spawnSync(FFMPEG, joinArgs, { stdio: 'inherit' });
if (j.status !== 0) process.exit(j.status || 1);
fs.rmSync(tmp, { recursive: true, force: true });

const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${path.relative(process.cwd(), OUT)} (${mb} MB)`);
