#!/usr/bin/env node
/**
 * Generates the PWA icon set from public/logo.png.
 *
 * Kept as a script rather than done once by hand so the icons can be rebuilt
 * when the logo changes, and so the padding numbers below are reviewable
 * instead of baked into opaque binaries.
 *
 * The source logo is 133x102 -- not square, and far too small to upscale into a
 * 512px icon without it turning to mush. So it is never upscaled past its own
 * pixels: it is placed at its natural size class onto a square brand-coloured
 * canvas, which is what the brand mark wants anyway.
 *
 * Two purposes, two paddings, because they are genuinely different jobs:
 *   any       tight crop; the launcher draws the square as-is.
 *   maskable  the launcher may clip to a circle and keep only the middle 80%,
 *             so the mark sits inside a 60% safe box with brand colour around
 *             it. Using the tight icon as maskable is what produces the
 *             famous cropped-logo look on Android.
 *
 *   node scripts/generate-pwa-icons.mjs
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'public/logo.png'
const OUT = 'public/icons'

// --color-brand-primary in globals.css. Hard-coded rather than parsed: this is
// a build-time asset, and a stale icon is better than a script that breaks when
// the stylesheet is reformatted.
const BRAND = { r: 0xfe, g: 0xd7, b: 0x00, alpha: 1 }

/** Fraction of the canvas the mark occupies, per purpose. */
const INSET = { any: 0.78, maskable: 0.6 }

if (!existsSync(SRC)) {
  console.error(`generate-pwa-icons: ${SRC} not found`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })

async function icon(size, purpose, name) {
  const box = Math.round(size * INSET[purpose])
  const mark = await sharp(SRC)
    // `inside` never enlarges beyond the box and preserves the 133x102 ratio,
    // so the mark stays sharp and undistorted.
    .resize(box, box, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(`${OUT}/${name}`)

  console.log(`  ${name}  ${size}x${size}  ${purpose}`)
}

await icon(192, 'any', 'icon-192.png')
await icon(512, 'any', 'icon-512.png')
await icon(512, 'maskable', 'icon-maskable-512.png')
// iOS ignores the manifest icons and reads this one, and it must not be
// transparent -- Safari composites transparency onto black.
await icon(180, 'any', 'apple-touch-icon.png')

console.log('generate-pwa-icons: done')
