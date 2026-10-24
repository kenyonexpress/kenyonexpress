#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const fontsDir = join(__dirname, '..', 'src', 'assets', 'fonts')

// Read the local Heebo Bold font and base64 encode it
const heeboBoldPath = join(fontsDir, 'Heebo-Bold.ttf')
const heeboBoldBase64 = readFileSync(heeboBoldPath).toString('base64')

// Create logo SVG with embedded font (no external fetch required)
const createLogoSVG = (width, height, fontSize, includeTagline = false) => {
  const tagline = includeTagline
    ? `
  <text x="${width / 2}" y="${height - 40}" class="tagline" text-anchor="middle" dominant-baseline="middle">הדילים הכי זולים בישראל</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <defs>
    <style>
      @font-face {
        font-family: 'Heebo';
        font-weight: 700;
        font-style: normal;
        src: url(data:font/truetype;charset=utf-8;base64,${heeboBoldBase64}) format('truetype');
      }
      .logo-text {
        font-family: 'Heebo', Arial, sans-serif;
        font-weight: 700;
        font-size: ${fontSize}px;
        fill: #fed700;
      }
      .tagline {
        font-family: 'Heebo', Arial, sans-serif;
        font-weight: 400;
        font-size: 24px;
        fill: #333333;
      }
    </style>
  </defs>
  <text x="${width / 2}" y="${includeTagline ? height / 2 - 30 : height / 2}" class="logo-text" text-anchor="middle" dominant-baseline="middle" direction="rtl">קניון EXPRESS</text>${tagline}
</svg>`
}

async function generateAssets() {
  console.log('Generating brand assets with embedded Heebo font...\n')

  // Master SVG with embedded font
  const masterSVG = createLogoSVG(400, 120, 48)
  writeFileSync(join(publicDir, 'logo.svg'), masterSVG)
  console.log('✓ logo.svg (with embedded Heebo Bold)')

  // logo-192.png (square, for PWA)
  const logo192SVG = createLogoSVG(192, 192, 36)
  await sharp(Buffer.from(logo192SVG))
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, 'logo-192.png'))
  console.log('✓ logo-192.png')

  // logo-512.png (square, for PWA)
  const logo512SVG = createLogoSVG(512, 512, 96)
  await sharp(Buffer.from(logo512SVG))
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'logo-512.png'))
  console.log('✓ logo-512.png')

  // apple-touch-icon.png (180x180)
  const appleSVG = createLogoSVG(180, 180, 32)
  await sharp(Buffer.from(appleSVG))
    .resize(180, 180)
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')

  // og-default.png (1200x630 with tagline)
  const ogSVG = createLogoSVG(1200, 630, 72, true)
  await sharp(Buffer.from(ogSVG)).resize(1200, 630).png().toFile(join(publicDir, 'og-default.png'))
  console.log('✓ og-default.png (with tagline)')

  // favicon.ico (proper multi-resolution ICO with 16x16, 32x32, 48x48)
  const favicon16SVG = createLogoSVG(16, 16, 6)
  const favicon16PNG = await sharp(Buffer.from(favicon16SVG)).resize(16, 16).png().toBuffer()

  const favicon32SVG = createLogoSVG(32, 32, 12)
  const favicon32PNG = await sharp(Buffer.from(favicon32SVG)).resize(32, 32).png().toBuffer()

  const favicon48SVG = createLogoSVG(48, 48, 18)
  const favicon48PNG = await sharp(Buffer.from(favicon48SVG)).resize(48, 48).png().toBuffer()

  // Create proper multi-resolution ICO file
  const icoBuffer = await pngToIco([favicon16PNG, favicon32PNG, favicon48PNG])
  writeFileSync(join(publicDir, 'favicon.ico'), icoBuffer)
  console.log('✓ favicon.ico (multi-resolution ICO: 16x16, 32x32, 48x48)')

  console.log('\n✓ All brand assets generated with embedded Heebo font')
  console.log('  Sharp will use the embedded font data, not external fetch')
}

generateAssets().catch(console.error)
