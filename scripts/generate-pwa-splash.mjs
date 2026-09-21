#!/usr/bin/env node
/**
 * Generates the iOS launch images listed in src/lib/pwa/splash.ts from
 * public/logo.png: brand-yellow canvas at the device's pixel size, the mark
 * centred at 38% of the width and never upscaled past what looks clean.
 *
 * Same reasoning as generate-pwa-icons.mjs: a script, so the set can be
 * rebuilt when the logo or the device table changes, and the numbers are
 * reviewable. Run: node scripts/generate-pwa-splash.mjs
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'public/logo.png'
const OUT = 'public/splash'
// --color-brand-primary. Hard-coded like the icon script: a stale asset beats
// a generator that breaks when the stylesheet is reformatted.
const BRAND = { r: 0xfe, g: 0xd7, b: 0x00, alpha: 1 }
const MARK_WIDTH = 0.38

// The table lives in a TS module the app imports; this script is plain Node,
// so the module is read as text and its literal rows are parsed out. A row
// that stops matching the pattern is a row that stops being generated, and
// splash.test.ts then fails on the missing file.
const { readFileSync } = await import('node:fs')
const source = readFileSync('src/lib/pwa/splash.ts', 'utf8')
const rows = [...source.matchAll(/width:\s*(\d+),\s*height:\s*(\d+),\s*ratio:\s*(\d)/g)].map(
  (m) => ({
    width: Number(m[1]),
    height: Number(m[2]),
    ratio: Number(m[3]),
  }),
)
if (rows.length === 0) {
  console.error('generate-pwa-splash: no rows found in src/lib/pwa/splash.ts')
  process.exit(1)
}
if (!existsSync(SRC)) {
  console.error(`generate-pwa-splash: ${SRC} not found`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })
for (const row of rows) {
  const width = row.width * row.ratio
  const height = row.height * row.ratio
  const markWidth = Math.round(width * MARK_WIDTH)
  const mark = await sharp(SRC).resize(markWidth, null, { fit: 'inside' }).png().toBuffer()
  const name = `splash-${width}x${height}.png`
  await sharp({ create: { width, height, channels: 4, background: BRAND } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${OUT}/${name}`)
  console.log(`  ${name}`)
}
console.log(`generate-pwa-splash: ${rows.length} images`)
