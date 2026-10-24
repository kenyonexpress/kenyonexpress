#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const fontsDir = join(__dirname, '..', 'src', 'assets', 'fonts')

// Read and encode both Heebo fonts
const heeboBoldBase64 = readFileSync(join(fontsDir, 'Heebo-Bold.ttf')).toString('base64')
const heeboRegularBase64 = readFileSync(join(fontsDir, 'Heebo-Regular.ttf')).toString('base64')

// Create logo SVG with both fonts embedded
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
      @font-face {
        font-family: 'Heebo';
        font-weight: 400;
        font-style: normal;
        src: url(data:font/truetype;charset=utf-8;base64,${heeboRegularBase64}) format('truetype');
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

async function renderSVGToPNG(svgContent, width, height) {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  })

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`
  await page.goto(dataUrl)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  const screenshot = await page.screenshot({ type: 'png' })
  await browser.close()
  return screenshot
}

async function generateAssets() {
  console.log('Generating brand assets with Playwright (guaranteed Heebo rendering)...\n')

  // Master SVG
  const masterSVG = createLogoSVG(400, 120, 48)
  writeFileSync(join(publicDir, 'logo.svg'), masterSVG)
  console.log('✓ logo.svg (Heebo Bold + Regular embedded)')

  // logo-192.png
  const logo192SVG = createLogoSVG(192, 192, 36)
  const logo192PNG = await renderSVGToPNG(logo192SVG, 192, 192)
  writeFileSync(join(publicDir, 'logo-192.png'), logo192PNG)
  console.log('✓ logo-192.png (Playwright-rendered with Heebo)')

  // logo-512.png
  const logo512SVG = createLogoSVG(512, 512, 96)
  const logo512PNG = await renderSVGToPNG(logo512SVG, 512, 512)
  writeFileSync(join(publicDir, 'logo-512.png'), logo512PNG)
  console.log('✓ logo-512.png (Playwright-rendered with Heebo)')

  // apple-touch-icon.png
  const appleSVG = createLogoSVG(180, 180, 32)
  const applePNG = await renderSVGToPNG(appleSVG, 180, 180)
  writeFileSync(join(publicDir, 'apple-touch-icon.png'), applePNG)
  console.log('✓ apple-touch-icon.png (Playwright-rendered with Heebo)')

  // og-default.png with tagline (Heebo Regular for tagline)
  const ogSVG = createLogoSVG(1200, 630, 72, true)
  const ogPNG = await renderSVGToPNG(ogSVG, 1200, 630)
  writeFileSync(join(publicDir, 'og-default.png'), ogPNG)
  console.log('✓ og-default.png (Playwright-rendered, logo Bold + tagline Regular)')

  // favicon.ico from Playwright-rendered PNGs
  const favicon16SVG = createLogoSVG(16, 16, 6)
  const favicon16PNG = await renderSVGToPNG(favicon16SVG, 16, 16)

  const favicon32SVG = createLogoSVG(32, 32, 12)
  const favicon32PNG = await renderSVGToPNG(favicon32SVG, 32, 32)

  const favicon48SVG = createLogoSVG(48, 48, 18)
  const favicon48PNG = await renderSVGToPNG(favicon48SVG, 48, 48)

  const icoBuffer = await pngToIco([favicon16PNG, favicon32PNG, favicon48PNG])
  writeFileSync(join(publicDir, 'favicon.ico'), icoBuffer)
  console.log('✓ favicon.ico (Playwright-rendered, multi-resolution ICO)')

  console.log('\n✓ All assets generated via Playwright with embedded Heebo fonts')
  console.log('  Logo: Heebo Bold (700)')
  console.log('  Tagline: Heebo Regular (400)')
  console.log('  Rendering engine: Chromium (not Sharp/librsvg)')
}

generateAssets().catch(console.error)
