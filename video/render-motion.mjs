// Renders a motion scene to frames. Usage: node render-motion.mjs <A|G|H> <outDir> [preview t1,t2,...]
import { chromium } from '@playwright/test';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const [scene, outDir, previewArg] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const lines = (f, a, b) => fs.readFileSync(path.join(root, f), 'utf8').split('\n').slice(a - 1, b).join('\n').replace(/\n\s+(?!\d+\. |- )/g, ' ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mark = (s, needle) => s.replace(esc(needle), `<span class="hl">${esc(needle)}</span>`);
const hook = JSON.parse(fs.readFileSync(path.join(root, '.kiro/hooks/held-out.json'), 'utf8')).hooks[0];
const mcp = JSON.parse(fs.readFileSync(path.join(root, '.kiro/settings/mcp.json'), 'utf8')).mcpServers['buried-evidence'];
const DATA = {
  steering: mark(esc(lines('.kiro/steering/product.md', 138, 144)), '1. **Banned words.**'),
  req: mark(esc(lines('.kiro/specs/08-lot-check/requirements.md', 94, 96)), 'SHALL NOT appear without at least one trigger'),
  design: mark(esc(lines('.kiro/specs/08-lot-check/design.md', 85, 86)), 'P1 [PBT]'),
  tasks: esc(lines('.kiro/specs/08-lot-check/tasks.md', 6, 7)),
  hooks: fs.readdirSync(path.join(root, '.kiro/hooks')).filter((f) => f.endsWith('.json')).sort(),
  hookdesc: esc(`"name": "${hook.name}",\n"trigger": "${hook.trigger}", "matcher": "${hook.matcher}"`),
  tools: mcp.autoApprove,
};
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript((d) => { window.DATA = d; }, DATA);
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
await page.goto(pathToFileURL(path.join(here, 'motion/index.html')).href + '?scene=' + scene, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))));
await page.waitForTimeout(400);
const duration = await page.evaluate(() => window.duration);
if (previewArg) {
  for (const t of previewArg.split(',').map(Number)) { await page.evaluate((t) => window.renderAt(t), t); await page.screenshot({ path: path.join(outDir, `${scene}-${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 85 }); }
  console.log(JSON.stringify({ scene, duration, preview: previewArg }));
} else {
  const fps = 30; const total = Math.round(duration * fps); const t0 = Date.now();
  for (let i = 0; i < total; i++) { await page.evaluate((t) => window.renderAt(t), i / fps); await page.screenshot({ path: path.join(outDir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 }); }
  console.log(JSON.stringify({ scene, duration, frames: total, seconds: Math.round((Date.now() - t0) / 1000) }));
}
await browser.close();
