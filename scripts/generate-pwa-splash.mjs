#!/usr/bin/env node
/**
 * Generates iOS launch screens (apple-touch-startup-image) into public/splash.
 * iOS ignores manifest background_color and shows white until first paint
 * unless a PNG matching the exact device size is linked. The device table
 * lives in src/lib/pwa/splash.ts so links and files cannot drift.
 *
 *   node scripts/generate-pwa-splash.mjs
 */
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const SRC = 'public/logo.png'
const OUT = 'public/splash'
const BG = { r: 0xff, g: 0xff, b: 0xff, alpha: 1 }

// Keep in sync with SPLASH_DEVICES in src/lib/pwa/splash.ts (a test pins it).
const DEVICES = [
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [375, 667, 2],
  [820, 1180, 2],
  [768, 1024, 2],
]

await mkdir(OUT, { recursive: true })
for (const [w, h, dpr] of DEVICES) {
  const W = w * dpr
  const H = h * dpr
  const mark = await sharp(SRC)
    .resize(Math.round(W * 0.4), Math.round(W * 0.4), { fit: 'inside' })
    .png()
    .toBuffer()
  await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(`${OUT}/splash-${W}x${H}.png`)
  console.log(`  splash-${W}x${H}.png`)
}
