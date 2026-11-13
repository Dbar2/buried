/**
 * Renders the social card to `public/social-card.png` (session 031): 1200 x 630, from `social/card.css`
 * and the palette tokens, with the self-hosted Libre Baskerville file and the core-sample mark. Run once and
 * commit the PNG: `npm run gen:social-card`. The card holds the wordmark, the mark and the tagline
 * only; no map imagery, no generated art.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Mark } from '../src/shell/Mark';
import { TAGLINE } from '../src/shell/tagline';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(WEB, 'public', 'social-card.png');

const font = (): string =>
  pathToFileURL(join(WEB, 'node_modules', '@fontsource', 'libre-baskerville', 'files', 'libre-baskerville-latin-400-normal.woff2')).href;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
@font-face { font-family: 'Libre Baskerville'; font-weight: 400; src: url('${font()}') format('woff2'); }
${readFileSync(join(WEB, 'src', 'styles', 'tokens.css'), 'utf8')}
${readFileSync(join(WEB, 'social', 'card.css'), 'utf8')}
</style>
</head>
<body>
<div class="card-mark">${renderToStaticMarkup(createElement(Mark, { size: 190 }))}</div>
<h1>Buried</h1>
<p>${TAGLINE}</p>
</body>
</html>
`;

const dir = mkdtempSync(join(tmpdir(), 'buried-social-'));
const file = join(dir, 'card.html');
writeFileSync(file, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('400 40px "Libre Baskerville"'));
  if (!ok) throw new Error('Libre Baskerville did not load; the card would be drawn in a fallback face');
  mkdirSync(join(WEB, 'public'), { recursive: true });
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
