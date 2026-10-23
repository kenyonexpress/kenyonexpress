#!/usr/bin/env node
/**
 * Generates PWA icons from Electro v7 shopping bag icon.
 *
 * C10 requirement: Use Electro v7 icons for the PWA manifest.
 * This uses ec-shopping-bag.svg from the Electro v7 icon set.
 *
 * Two purposes, two paddings:
 *   any       tight crop; launcher draws the square as-is
 *   maskable  60% safe box with brand colour around it
 *
 *   node scripts/generate-pwa-icons-electro.mjs
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'public/icons/electro/ec-shopping-bag.svg'
const OUT = 'public/icons'

// Brand primary color from tokens
const BRAND = { r: 0xfe, g: 0xd7, b: 0x00, alpha: 1 }

/** Fraction of the canvas the icon occupies, per purpose */
const INSET = { any: 0.7, maskable: 0.5 }

if (!existsSync(SRC)) {
  console.error(`generate-pwa-icons-electro: ${SRC} not found`)
  process.exit(1)
}

await mkdir(OUT, { recursive: true })

async function icon(size, purpose, name) {
  const box = Math.round(size * INSET[purpose])

  // Read SVG and convert to PNG with icon color
  const svgBuffer = await sharp(SRC)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  // Create canvas with brand color background
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: svgBuffer, gravity: 'centre' }])
    .png()
    .toFile(`${OUT}/${name}`)

  console.log(`  ${name}  ${size}x${size}  ${purpose}`)
}

await icon(192, 'any', 'icon-192.png')
await icon(512, 'any', 'icon-512.png')
await icon(512, 'maskable', 'icon-maskable-512.png')
await icon(180, 'any', 'apple-touch-icon.png')

console.log('generate-pwa-icons-electro: done')
