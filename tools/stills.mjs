// Save still frames for review.
//   node tools/stills.mjs 3.2 9.9 41.5          -> out/stills/t003.20.png ...
//   node tools/stills.mjs --every 2              -> a frame every 2 seconds
//   node tools/stills.mjs --cues                 -> one frame at the end of every voiceover line
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
const outDir = path.resolve('out/stills');
fs.mkdirSync(outDir, { recursive: true });

const server = await startServer(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const duration = await page.evaluate(() => window.__duration);

let times = [];
if (args[0] === '--every') {
  const step = +args[1] || 2;
  for (let t = 0; t <= duration; t += step) times.push(+t.toFixed(2));
} else if (args[0] === '--cues') {
  times = await page.evaluate(() => window.CUES.map((c) => +(c.end - 0.05).toFixed(2)));
} else {
  times = args.map(Number).filter((t) => Number.isFinite(t));
}
if (!times.length) {
  console.error('Usage: node tools/stills.mjs <seconds...> | --every <step> | --cues');
  process.exit(1);
}

for (const t of times) {
  await page.evaluate((tt) => window.__seek(tt), t);
  const file = path.join(outDir, `t${t.toFixed(2).padStart(6, '0')}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.close();
