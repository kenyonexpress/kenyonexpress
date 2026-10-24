#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// Create a simple logo SVG with Hebrew text
// We'll use a basic approach that works without external font loading
const createLogoSVG = (width, height, fontSize, includeTagline = false) => {
  const tagline = includeTagline
    ? `
  <text x="${width / 2}" y="${height - 40}" class="tagline" text-anchor="middle" dominant-baseline="middle">הדילים הכי זולים בישראל</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@700&amp;display=swap');
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
  console.log('Generating brand assets...')

  // Master SVG
  const masterSVG = createLogoSVG(400, 120, 48)
  writeFileSync(join(publicDir, 'logo.svg'), masterSVG)
  console.log('✓ logo.svg')

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
  console.log('✓ og-default.png')

  // favicon.ico (convert from 32x32 PNG)
  const faviconSVG = createLogoSVG(32, 32, 12)
  const faviconPNG = await sharp(Buffer.from(faviconSVG)).resize(32, 32).png().toBuffer()

  // Sharp doesn't support ICO output, so we'll create a multi-size ICO manually
  // For now, just create a 32x32 PNG and rename it
  // Modern browsers support PNG favicons
  writeFileSync(join(publicDir, 'favicon.ico'), faviconPNG)
  console.log('✓ favicon.ico (PNG format)')

  console.log('\nAll brand assets generated successfully!')
}

generateAssets().catch(console.error)
