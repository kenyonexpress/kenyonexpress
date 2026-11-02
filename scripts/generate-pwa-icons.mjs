#!/usr/bin/env node
/**
 * Generates the PWA icon set from the upgraded logo, public/images/logo.svg
 * (C137). Only the round yellow cart mark is used: the Hebrew/Latin wordmark
 * is unreadable at launcher size, and the mark is the part people recognise.
 *
 * Kept as a script rather than done once by hand so the icons can be rebuilt
 * when the logo changes, and so the crop and padding numbers below are
 * reviewable instead of baked into opaque binaries.
 *
 * The mark is vector, so every size is rendered from the SVG at its own
 * density: no upscaling of a small PNG.
 *
 * Two purposes, two paddings, because they are genuinely different jobs:
 *   any       the mark's circle fills the square on brand yellow, so the
 *             launcher draws a full-bleed yellow tile with the cart in it.
 *   maskable  the launcher may clip to a circle and keep only the middle 80%,
 *             so the circle is shrunk to that safe zone. Using the tight icon
 *             as maskable is what produces the cropped-logo look on Android.
 *
 *   node scripts/generate-pwa-icons.mjs
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'public/images/logo.svg'
const OUT = 'public/icons'

// --color-brand-primary (#fed700). Hard-coded rather than parsed: this is a
// build-time asset, and a stale icon is better than a script that breaks when
// the stylesheet is reformatted.
const BRAND = '#fed700'

// The mark in logo.svg: <circle cx="333" cy="50" r="45">.
const MARK = { cx: 333, cy: 50, r: 45 }

/** Fraction of the canvas the mark's circle spans, per purpose. */
const SPAN = { any: 1, maskable: 0.8 }

if (!existsSync(SRC)) {
  console.error(`generate-pwa-icons: ${SRC} not found`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })
const svg = await readFile(SRC, 'utf8')
// Everything inside the root <svg> minus the <title> and the wordmark (the
// top-level filled <path>s). The wordmark has to be removed, not just cropped:
// the maskable viewBox is wider than the circle and would show its edge.
const body = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/<path fill="[^"]*" d="[^"]*"\/>/g, '')

function markSvg(size, purpose) {
  const half = MARK.r / SPAN[purpose]
  const x = MARK.cx - half
  const y = MARK.cy - half
  const side = half * 2
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${side} ${side}">` +
      `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${BRAND}"/>${body}</svg>`,
  )
}

async function icon(size, purpose, name) {
  await sharp(markSvg(size, purpose)).png().toFile(`${OUT}/${name}`)
  console.log(`  ${name}  ${size}x${size}  ${purpose}`)
}

await icon(192, 'any', 'icon-192.png')
await icon(512, 'any', 'icon-512.png')
await icon(192, 'maskable', 'icon-maskable-192.png')
await icon(512, 'maskable', 'icon-maskable-512.png')
// iOS ignores the manifest icons and reads this one, and it must not be
// transparent -- Safari composites transparency onto black.
await icon(180, 'any', 'apple-touch-icon.png')

console.log('generate-pwa-icons: done')
