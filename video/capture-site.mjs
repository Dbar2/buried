// Records the live site as JPEG frames with timestamps (Chrome screencast), driving it like a visitor.
// Usage: node capture-site.mjs <act> <outDir>     acts: act1 (landing to postcard), act2 (honesty), act3 (closing)
// Each act writes frames/<n>.jpg, frames.json (timestamps) and marks.json (named moments, seconds).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [act, outDir] = process.argv.slice(2);
const BASE = 'https://buried.pages.dev';
const VIEW = { width: 1440, height: 810 };
const SCALE = 1920 / 1440;
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--force-device-scale-factor=' + SCALE, '--hide-scrollbars'] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, reducedMotion: 'no-preference' });
// A visible pointer, since a headless browser draws none.
await context.addInitScript(() => {
  const make = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);' +
      'background:no-repeat url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M4 2 L4 21 L9 16.5 L12.5 24 L15.5 22.6 L12 15.2 L19 15 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>') + '")';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    addEventListener('mousedown', () => { c.style.filter = 'drop-shadow(0 0 6px #DCA34B)'; }, true);
    addEventListener('mouseup', () => { c.style.filter = ''; }, true);
  };
  if (document.documentElement) make();
  document.addEventListener('DOMContentLoaded', make);
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const frames = []; const marks = {}; let n = 0; let t0 = null; let recording = false;
cdp.on('Page.screencastFrame', async (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  if (!recording) return;
  if (t0 === null) t0 = f.metadata.timestamp;
  const name = String(n++).padStart(6, '0') + '.jpg';
  fs.writeFileSync(path.join(outDir, 'frames', name), Buffer.from(f.data, 'base64'));
  frames.push({ file: name, t: +(f.metadata.timestamp - t0).toFixed(4) });
});
const now = () => (frames.length ? frames[frames.length - 1].t : 0);
const mark = (name) => { marks[name] = now(); console.log('mark', name, marks[name].toFixed(2)); };
const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: 720, y: 500 };
async function moveTo(x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(mouse.x + (x - mouse.x) * e, mouse.y + (y - mouse.y) * e);
    await wait(ms / steps);
  }
  mouse = { x, y };
}
async function centreOf(locator) { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; }
async function moveToLoc(locator, ms = 700, dx = 0, dy = 0) { const c = await centreOf(locator); await moveTo(c.x + dx, c.y + dy, ms); return c; }
async function smoothScrollTo(y, ms = 900) {
  await page.evaluate(([y, ms]) => new Promise((res) => {
    const sc = document.querySelector('.page-scroll') || document.scrollingElement;
    const y0 = sc.scrollTop; const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; sc.scrollTop = y0 + (y - y0) * e; k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [y, ms]);
}
async function scrollToLoc(locator, offset = 120, ms = 900) {
  const y = await locator.evaluate((el, off) => { const sc = document.querySelector('.page-scroll') || document.scrollingElement; return el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - off; }, offset);
  await smoothScrollTo(Math.max(0, y), ms);
}
async function start() {
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  recording = true; await wait(150);
}

if (act === 'act1') {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor();
  await page.mouse.move(mouse.x, mouse.y);
  // Reload so the entrance animation is recorded from its start.
  await start();
  await page.reload({ waitUntil: 'domcontentloaded' });
  mark('landing');
  await page.locator('h1').first().waitFor();
  await wait(3200);
  // Hover two lit lots on the plan, then go to the field.
  const lots = page.getByTestId('lc-lot');
  if (await lots.count()) { await moveToLoc(lots.nth(0), 900); await wait(700); if (await lots.count() > 2) { await moveToLoc(lots.nth(2), 700); await wait(600); } }
  const field = page.getByTestId('lc-address');
  await moveToLoc(field, 800);
  await field.click(); mark('field'); await wait(900);
  for (const ch of '2a p') { await page.keyboard.type(ch); await wait(190); }
  mark('typed'); await wait(1100);
  const option = page.getByTestId('lc-option').first();
  await moveToLoc(option, 500); await wait(500);
  mark('dig-start');
  await option.click();
  await page.getByTestId('dig').waitFor({ timeout: 8000 });
  await page.getByTestId('lc-ins-lead').waitFor({ timeout: 20000 });
  mark('reveal');
  await moveTo(1150, 300, 600);
  await wait(4200);
  // Point at the stamp and the lettering rows.
  await moveToLoc(page.getByTestId('lc-tag').first(), 800); await wait(1700);
  const shows = page.getByTestId('lc-shows');
  if (await shows.count()) { await moveToLoc(shows.first(), 900, 0, -40); await wait(2600); }
  mark('compare');
  await scrollToLoc(page.getByTestId('lc-frame'), 190, 1100); await wait(500);
  const divider = page.getByTestId('lc-divider');
  const frame = await centreOf(page.getByTestId('lc-frame'));
  const d = await centreOf(divider);
  await moveTo(d.x, d.y, 600); await page.mouse.down();
  await moveTo(frame.b.x + frame.b.width * 0.22, d.y, 1100); await moveTo(frame.b.x + frame.b.width * 0.78, d.y, 1400); await moveTo(frame.b.x + frame.b.width * 0.5, d.y, 900);
  await page.mouse.up(); await wait(500);
  mark('photo1939');
  const r1939 = page.getByRole('radio', { name: /1939/ });
  await moveToLoc(page.locator('label', { hasText: '1939 photo' }).first(), 600); await r1939.check({ force: true }); await wait(2600);
  mark('imagined');
  await moveToLoc(page.locator('label', { hasText: 'Imagined' }).first(), 600); await page.getByRole('radio', { name: /Imagined/ }).check({ force: true });
  await moveTo(frame.x - 120, frame.y + 60, 600); await wait(3000);
  mark('postcard');
  const postcard = page.getByTestId('lc-postcard');
  await scrollToLoc(postcard, 90, 1100); await wait(600);
  await moveToLoc(page.getByTestId('lc-postcard-image'), 700); await wait(900);
  const open = page.getByTestId('lc-postcard-open');
  if (await open.count()) { await open.first().click(); await wait(3200); await page.keyboard.press('Escape'); }
  await wait(800);
  mark('end');
} else if (act === 'act2') {
  await context.grantPermissions([]);
  await page.goto(BASE + '/lot/5451729', { waitUntil: 'networkidle' });
  await page.getByTestId('lc-ins-lead').waitFor({ timeout: 20000 }); await wait(2500);
  await scrollToLoc(page.getByTestId('lc-provenance'), 380, 10);
  await page.mouse.move(mouse.x, mouse.y);
  await start(); mark('provenance');
  await moveToLoc(page.getByTestId('lc-provenance'), 900, 120, 40); await wait(4200);
  mark('notdug');
  await page.goto(BASE + '/lot/0000', { waitUntil: 'networkidle' });
  await moveTo(760, 420, 700); await wait(3600);
  mark('record');
  await page.goto(BASE + '/report?lot=5451729', { waitUntil: 'networkidle' });
  await wait(1200); await moveTo(900, 420, 700); await wait(1200);
  await smoothScrollTo(520, 2600); await wait(1600);
  mark('end');
} else if (act === 'act3') {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor(); await page.mouse.move(mouse.x, mouse.y);
  await start();
  await page.reload({ waitUntil: 'domcontentloaded' }); mark('landing');
  await wait(3000);
  const lots = page.getByTestId('lc-lot'); const count = await lots.count();
  for (let i = 0; i < Math.min(count, 5); i++) { await moveToLoc(lots.nth(i), 650); await wait(550); }
  await wait(800); mark('end');
}
recording = false;
await cdp.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync(path.join(outDir, 'frames.json'), JSON.stringify(frames));
fs.writeFileSync(path.join(outDir, 'marks.json'), JSON.stringify(marks, null, 1));
const dur = frames.length ? frames[frames.length - 1].t : 0;
console.log(JSON.stringify({ act, frames: frames.length, seconds: +dur.toFixed(2), fps: +(frames.length / Math.max(dur, 0.01)).toFixed(1) }));
await browser.close();
