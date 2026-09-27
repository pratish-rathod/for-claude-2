// Render the sound design to WAV (48 kHz / 24-bit).
//
//   node tools/sound.mjs                         # out/audio/{sound-design,sfx,ambience}.wav
//   node tools/sound.mjs --out-dir renders/audio
//   node tools/sound.mjs --mux renders/llamaparse-sponsor-1080p60.mp4 --out out/with-sound.mp4
//   node tools/sound.mjs --calibrate             # print each patch's raw peak level
//
// The sound is synthesized in headless Chromium with the Web Audio API
// (src/sound.js) from the same timeline as the animation.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

export async function renderSound(browser, url, stems, outDir) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const files = {};
  for (const [stem, name] of stems) {
    const info = await page.evaluate((s) => window.SOUND.exportWav(s), stem);
    const size = 4 * 1024 * 1024;
    const chunks = [];
    for (let i = 0; i * size < info.bytes; i++) chunks.push(Buffer.from(await page.evaluate(([k, n]) => window.SOUND.wavChunk(k, n), [i, size]), 'base64'));
    const file = path.join(outDir, name);
    fs.writeFileSync(file, Buffer.concat(chunks));
    files[stem] = file;
    const lim = info.limitedSeconds ? `, limiter active ${info.limitedSeconds.toFixed(2)} s` : '';
    console.log(`  ${path.relative(process.cwd(), file)} (${(info.bytes / 1048576).toFixed(1)} MB${lim})`);
  }
  await page.close();
  return files;
}

export function loudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr || '';
  const I = s.match(/I:\s+(-?[\d.]+) LUFS/g);
  const P = s.match(/Peak:\s+(-?[\d.]+) dBFS/g);
  return { lufs: I ? parseFloat(I[I.length - 1].split(/\s+/)[1]) : null, truePeak: P ? parseFloat(P[P.length - 1].split(/\s+/)[1]) : null };
}

if (process.argv[1] && process.argv[1].endsWith('sound.mjs')) {
  const server = await startServer(0);
  const url = `http://127.0.0.1:${server.address().port}/index.html?render`;
  const browser = await chromium.launch();
  try {
    if (has('calibrate')) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => console.error('[page error]', e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__ready === true);
      const skip = ['sting', 'levelUp', 'crown', 'flip', 'hum', 'vinyl'];
      const types = (await page.evaluate(() => window.SOUND.types())).filter((t) => !skip.includes(t));
      const res = {};
      for (const t of types) res[t] = await page.evaluate((ty) => window.SOUND.measure(ty), t);
      res.hum = await page.evaluate(() => window.SOUND.measure('hum', { t1: 3.5 }));
      res.vinyl = await page.evaluate(() => window.SOUND.measure('vinyl', { t1: 3.5 }));
      for (const [t, v] of Object.entries(res)) console.log(t.padEnd(10), 'peak', v.peakDb.toFixed(1).padStart(6), 'dB   rms', v.rmsDb.toFixed(1).padStart(6), 'dB');
      console.log('NORM = ' + JSON.stringify(Object.fromEntries(Object.entries(res).map(([t, v]) => [t, +(-v.peakDb).toFixed(1)]))));
    } else {
      const outDir = path.resolve(opt('out-dir', 'out/audio'));
      fs.mkdirSync(outDir, { recursive: true });
      console.log('Rendering sound design...');
      const files = await renderSound(browser, url, [['mix', 'sound-design.wav'], ['sfx', 'sfx.wav'], ['ambience', 'ambience.wav']], outDir);
      const L = loudness(files.mix);
      if (L.lufs !== null) console.log(`  mix loudness ${L.lufs} LUFS, peak ${L.truePeak} dBFS`);
      const mux = opt('mux', null);
      if (mux) {
        const out = path.resolve(opt('out', mux.replace(/\.mp4$/, '-sound.mp4')));
        const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', mux, '-i', files.mix, '-map', '0:v', '-map', '1:a',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
        if (r.status !== 0) process.exit(r.status || 1);
        console.log(`  muxed -> ${path.relative(process.cwd(), out)}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}
