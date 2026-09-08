#!/usr/bin/env node
/**
 * REBUILDS THE PIXEL GATE'S REFERENCE SIDE, WHICH THE NETWORK NO LONGER HAS.
 *
 * WHAT BROKE. `compare.mjs` scores our pages against
 * `https://kenyonexpress.co.il/...`. That host stopped serving WordPress: the
 * DNS was cut to Vercel and it now serves THIS app. Measured 2026-09-08, the
 * apex returns zero `wp-content` markers and 158 `_next/static` ones, and
 * every `/wp-content/uploads/...` path answers 403.
 *
 * So the gate has been comparing our local build against our own production
 * deployment. It still prints a percentage. It is not a fidelity score, and at
 * 380px it said 39.76% with the tool's own height-ratio warning firing at
 * 1.80x - "these are structurally different pages".
 *
 * WHAT SURVIVES. Seven full WooCommerce snapshots in `refs/ke_live_*.html`,
 * one per page the gate knows, taken while the site was live. They are real:
 * `ke_live_home.html` carries 691 `wp-content` references, 96 `woocommerce`
 * ones and zero Next.js markers. Crucially the STYLING survives with them -
 * 372KB across 19 inline `<style>` blocks and only one remote stylesheet - so
 * the layout those files render is the real layout.
 *
 * What does NOT survive in them is imagery: 276 `uploads/` URLs pointing at a
 * host that now 403s, so the reference renders as a correctly-laid-out page
 * full of empty boxes. Scored that way, home@380 came out at 27.15% against a
 * gate of 11%, and most of it was image bands.
 *
 * WHAT THIS DOES. `refs/live-assets/` holds a crawl of that same site taken
 * 2026-09-05, before the cutover. This rewrites each snapshot's image URLs to
 * point into it, and writes the result to `refs/localized/`. Of the 276 URLs
 * on the home page, 48 have the exact file and 203 have the same image at
 * another size; 25 are genuinely gone.
 *
 * NEAREST-SIZE SUBSTITUTION IS DELIBERATE AND IS THE ONE RISKY PART. WordPress
 * emits `name-600x600.jpg` for a rendition; the crawl may hold only
 * `name-300x300.jpg`. Substituting it puts the RIGHT PICTURE at the right
 * place, and the layout box is set by CSS and the width/height attributes, not
 * by the file - so geometry is unaffected and only fine detail differs. The
 * alternative is an empty box, which differs from our page far more. Every
 * substitution is counted and reported so the number is never mistaken for an
 * exact restoration.
 *
 * NOT a mutation of the archives. `refs/ke_live_*.html` are the evidence and
 * are left byte-for-byte alone; the rewritten copies are derived files.
 *
 * Usage:
 *   node scripts/localize-live-refs.mjs            # rebuild refs/localized/
 *   node scripts/localize-live-refs.mjs --report   # stats only, write nothing
 *
 * Exit: 0 written, 1 nothing to work with.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const REPORT_ONLY = process.argv.includes('--report')

const REFS = 'refs'
const ASSETS = join(REFS, 'live-assets')
const OUT = join(REFS, 'localized')

/** The live host, in every spelling a saved page uses. */
const HOST = /(?:https?:)?\/\/(?:www\.)?kenyonexpress\.co\.il/g

if (!existsSync(ASSETS)) {
  console.error(`localize-live-refs: ${ASSETS} does not exist; nothing to localize against`)
  process.exit(1)
}

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/**
 * Index of every crawled asset, by exact site path and by "same image, any
 * size" stem.
 *
 * The stem drops the extension and WordPress's `-WIDTHxHEIGHT` rendition
 * suffix, and also this repo's own `.380`/`.768`/`.1440` derivative marks, so
 * `logo-600x600.webp` and `logo.avif` land in one bucket.
 */
const files = walk(ASSETS)
const siteath = (f) => decodeURIComponent(f.slice(ASSETS.length)) // "/wp-content/..."
const stemOf = (p) =>
  decodeURIComponent(basename(p, extname(p)))
    .replace(/\.(380|768|1440)$/, '')
    .replace(/-\d{2,4}x\d{2,4}$/, '')

const byExact = new Map()
const byStem = new Map()
for (const f of files) {
  byExact.set(siteath(f), f)
  const s = stemOf(f)
  if (!byStem.has(s)) byStem.set(s, [])
  byStem.get(s).push(f)
}

/**
 * Prefer a real photograph over a derivative: a `.webp`/`.avif` the crawl
 * generated is fine, but among candidates take the LARGEST, which is the one
 * closest to the full-size rendition a page usually asks for.
 */
for (const list of byStem.values()) {
  list.sort((a, b) => {
    const sizeA = readFileSync(a).length
    const sizeB = readFileSync(b).length
    return sizeB - sizeA
  })
}

const stats = { exact: 0, resized: 0, missing: 0, nonImage: 0 }

// IMAGES ONLY, AND THE GAP IS FONTS, AND THE FONTS ARE NOT COMING BACK.
//
// Measured 2026-09-08 by loading the localized home page in Chromium: 49
// images, ZERO broken - this works - alongside 96 failed requests, every one a
// font. Open Sans and two Font Awesome families still point at
// kenyonexpress.co.il/wp-content/, which 403s since the DNS was cut to Vercel.
//
// They are not recoverable by extending this regex. `refs/live-assets/` holds
// no .woff, .woff2 or .ttf at all - the archive captured imagery and not
// typefaces - and the origin that served them is gone. So the reference renders
// in fallback type with tofu where the icons were, and the parity percentage it
// produces is a FLOOR on the real difference rather than the 11% gate's number.
// scripts/compare.mjs carries the three non-interchangeable figures.
//
// Widening IMAGE_EXT to fonts would change `missing` from silence into noise
// and recover nothing. Left narrow on purpose, with the reason written down.
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg)$/i

/** Resolve one site path to a path relative to `refs/localized/`. */
function resolveAsset(sitePath) {
  const clean = decodeURIComponent(sitePath.split('?')[0].split('#')[0])
  if (!IMAGE_EXT.test(clean)) {
    stats.nonImage++
    return null
  }
  const exact = byExact.get(clean)
  if (exact) {
    stats.exact++
    return `../${exact.slice(`${REFS}/`.length)}`
  }
  const candidates = byStem.get(stemOf(clean))
  if (candidates?.length) {
    stats.resized++
    return `../${candidates[0].slice(`${REFS}/`.length)}`
  }
  stats.missing++
  return null
}

const pages = readdirSync(REFS).filter((f) => /^ke_live_.*\.html$/.test(f))
if (pages.length === 0) {
  console.error('localize-live-refs: no refs/ke_live_*.html snapshots found')
  process.exit(1)
}

if (!REPORT_ONLY) mkdirSync(OUT, { recursive: true })

const summary = []
for (const page of pages) {
  const before = { ...stats }
  const html = readFileSync(join(REFS, page), 'utf8')

  const rewritten = html.replace(HOST, (_m, ...rest) => {
    // The host match alone carries no path; the path replacement below does the
    // work. Returning a sentinel would corrupt non-asset links, so the host is
    // preserved here and only asset URLs are rewritten in the second pass.
    void rest
    return 'https://kenyonexpress.co.il'
  })

  // Second pass: only URLs that point at an asset directory are candidates.
  const localized = rewritten.replace(
    /(?:https?:)?\/\/(?:www\.)?kenyonexpress\.co\.il(\/wp-content\/[^"'\s)>]+)/g,
    (match, path) => resolveAsset(path) ?? match,
  )

  const delta = {
    exact: stats.exact - before.exact,
    resized: stats.resized - before.resized,
    missing: stats.missing - before.missing,
  }
  summary.push({ page, ...delta })

  if (!REPORT_ONLY) writeFileSync(join(OUT, page), localized)
}

console.log(`localize-live-refs: ${pages.length} snapshot(s)${REPORT_ONLY ? ' (report only)' : ''}`)
for (const row of summary) {
  const total = row.exact + row.resized + row.missing
  const recovered = total === 0 ? 100 : Math.round(((row.exact + row.resized) / total) * 100)
  console.log(
    `  ${row.page.padEnd(26)} ${String(recovered).padStart(3)}% recovered  ` +
      `(exact ${row.exact}, resized ${row.resized}, missing ${row.missing})`,
  )
}
if (!REPORT_ONLY) console.log(`\nwritten to ${OUT}/`)
console.log('\nResized substitutions are the same image at another rendition: right picture,')
console.log('geometry unchanged (the box is set by CSS and width/height attributes).')
