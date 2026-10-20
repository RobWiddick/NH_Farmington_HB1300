#!/usr/bin/env node
// Regenerates public/og.png (1200x630 social share image) with headless Chromium.
// Run manually after changing the headline: node scripts/make-og-image.mjs
// Requires Playwright with a Chromium build available (not needed in CI).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}

const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
const html = `<!doctype html><html><head><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fbfaf6;font-family:'Iowan Old Style','Palatino Linotype',Georgia,serif;color:#18202e;display:flex}
  .bar{width:28px;background:#14325c}
  .c{padding:70px 80px;display:flex;flex-direction:column;justify-content:space-between;flex:1}
  .k{font:700 26px/1 system-ui,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#5b6475}
  .k b{color:#b3261e}
  h1{font-size:76px;line-height:1.05;letter-spacing:-.01em;max-width:960px}
  h1 em{font-style:normal;background:linear-gradient(transparent 62%,#fbefd6 62%)}
  .f{font:600 28px/1.3 system-ui,Arial,sans-serif;color:#333c4d;display:flex;justify-content:space-between;align-items:flex-end}
  .pill{background:#14325c;color:#fff;border-radius:999px;padding:14px 26px;font-weight:700}
</style></head><body><div class="bar"></div><div class="c">
  <div class="k">Farmington, NH · <b>Ballot Question 2</b> · Nov. 3, 2026</div>
  <h1>It's called a tax cap. It's really a <em>cap on Farmington's schools.</em></h1>
  <div class="f"><span>What HB 1300 does — in plain English, with sources.</span><span class="pill">Read before you vote</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log(`Wrote ${out}`);
