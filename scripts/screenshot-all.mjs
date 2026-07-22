// screenshot-all.mjs
//
// Purpose:
//   Capture full-page screenshots of key routes on BOTH the live site
//   (https://kenyonexpress.co.il) and the local dev server
//   (http://localhost:3000), so the two can be compared side by side.
//
// Prerequisites:
//   1. Playwright (chromium) installed: `pnpm add -D playwright` and
//      `npx playwright install chromium`.
//   2. The local dev server MUST be running on port 3000 (`pnpm dev`).
//   3. Network access, because this script also hits the LIVE public site.
//
// Run command:
//   node scripts/screenshot-all.mjs
//
// Optional: override the product/category slugs (they differ between live and
// local) via CLI args or env vars. See CONFIG below.
//
// Note: this script reaches out to the live production site
// (https://kenyonexpress.co.il) over the public internet.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
// The first product/category slug is usually different between the live site
// and your local database, so set these to real, existing paths.
// You can override any of them with an env var (preferred) or, for the four
// path values, positional CLI args in this order:
//   node scripts/screenshot-all.mjs <LIVE_PRODUCT> <LIVE_CATEGORY> <LOCAL_PRODUCT> <LOCAL_CATEGORY>
const argv = process.argv.slice(2);

const CONFIG = {
  // Base URLs for each target.
  LIVE_BASE: process.env.LIVE_BASE || 'https://kenyonexpress.co.il',
  LOCAL_BASE: process.env.LOCAL_BASE || 'http://localhost:3000',

  // TODO: set these to real slugs that exist on each environment.
  // Local routes are `/product/[first]` and `/category/[first]`; because the
  // first slug differs between live and local, adjust the defaults below.
  LIVE_PRODUCT_PATH:
    process.env.LIVE_PRODUCT_PATH || argv[0] || '/product/example-product',
  LIVE_CATEGORY_PATH:
    process.env.LIVE_CATEGORY_PATH || argv[1] || '/category/example-category',
  LOCAL_PRODUCT_PATH:
    process.env.LOCAL_PRODUCT_PATH || argv[2] || '/product/example-product',
  LOCAL_CATEGORY_PATH:
    process.env.LOCAL_CATEGORY_PATH || argv[3] || '/category/example-category',
};

// Viewports to capture. Comment out the mobile entry to skip it, or add more.
const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
];

// Where screenshots go.
const SHOTS_ROOT = path.resolve(
  new URL('..', import.meta.url).pathname,
  'refs',
  'shots'
);

// Per-shot navigation timeout (milliseconds). Generous, because networkidle on
// image-heavy pages can be slow.
const NAV_TIMEOUT = 60000;

// ---------------------------------------------------------------------------
// Build the matrix of targets x routes.
// ---------------------------------------------------------------------------
const TARGETS = [
  {
    name: 'live',
    base: CONFIG.LIVE_BASE,
    routes: [
      { label: 'home', path: '/' },
      { label: 'product', path: CONFIG.LIVE_PRODUCT_PATH },
      { label: 'category', path: CONFIG.LIVE_CATEGORY_PATH },
    ],
  },
  {
    name: 'local',
    base: CONFIG.LOCAL_BASE,
    routes: [
      { label: 'home', path: '/' },
      { label: 'product', path: CONFIG.LOCAL_PRODUCT_PATH },
      { label: 'category', path: CONFIG.LOCAL_CATEGORY_PATH },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timestampLabel(date) {
  // YYYY-MM-DD_HH-MM-SS in local time, filesystem safe.
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function joinUrl(base, routePath) {
  const trimmedBase = base.replace(/\/+$/, '');
  const suffix = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${trimmedBase}${suffix}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date();
  const stamp = timestampLabel(startedAt);
  const outDir = path.join(SHOTS_ROOT, stamp);
  await mkdir(outDir, { recursive: true });

  console.log(`Screenshot run: ${stamp}`);
  console.log(`Output dir: ${outDir}`);
  console.log(`Note: this run hits the LIVE site at ${CONFIG.LIVE_BASE}`);
  console.log('');

  const browser = await chromium.launch();

  const saved = [];
  const failed = [];

  try {
    for (const target of TARGETS) {
      for (const viewport of VIEWPORTS) {
        // One context per (target, viewport) so the viewport applies cleanly.
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();

        for (const route of target.routes) {
          const url = joinUrl(target.base, route.path);
          const fileName = `${target.name}_${route.label}_${viewport.label}.png`;
          const filePath = path.join(outDir, fileName);

          try {
            console.log(`-> ${target.name} ${route.label} (${viewport.label}): ${url}`);
            await page.goto(url, {
              waitUntil: 'networkidle',
              timeout: NAV_TIMEOUT,
            });
            await page.screenshot({ path: filePath, fullPage: true });
            saved.push(filePath);
            console.log(`   saved: ${fileName}`);
          } catch (err) {
            // Log and continue so one bad route does not abort the whole run.
            failed.push({ url, fileName, error: err?.message });
            console.warn(`   FAILED: ${fileName} (${err?.message})`);
          }
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Summary.
  console.log('');
  console.log('==== Summary ====');
  console.log(`Saved ${saved.length} screenshot(s) to ${outDir}`);
  for (const f of saved) {
    console.log(`  ok:   ${path.basename(f)}`);
  }
  if (failed.length > 0) {
    console.log(`Failed ${failed.length} shot(s):`);
    for (const f of failed) {
      console.log(`  fail: ${f.fileName} (${f.url})`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
