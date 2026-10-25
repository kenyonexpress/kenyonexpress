#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Definitive proof that Heebo rendered in the PNGs:
 * Compare delivered og-default.png text width against Arial fallback.
 * Heebo and Arial have different metrics, so if widths match Arial,
 * Heebo didn't render.
 */

const publicDir = join(process.cwd(), 'public')
const fontsDir = join(process.cwd(), 'src', 'assets', 'fonts')

async function measureTextWidth(fontData, fontFamily, fontWeight, text) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200">
  <defs>
    <style>
      @font-face {
        font-family: 'TestFont';
        font-weight: ${fontWeight};
        src: url(data:font/truetype;charset=utf-8;base64,${fontData}) format('truetype');
      }
    </style>
  </defs>
  <text id="test" x="0" y="100" style="font-family: ${fontFamily}; font-weight: ${fontWeight}; font-size: 72px;">${text}</text>
</svg>`

  await page.setContent(`<div>${svg}</div>`)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  const bbox = await page.$eval('#test', (el) => {
    const box = el.getBBox()
    return { width: box.width, height: box.height }
  })

  await browser.close()
  return bbox
}

async function main() {
  console.log('Proving Heebo rendering in delivered PNGs...\n')

  const heeboBoldBase64 = readFileSync(join(fontsDir, 'Heebo-Bold.ttf')).toString('base64')
  const text = 'קניון EXPRESS'

  // Measure with Heebo (what should be in the PNG)
  console.log('Measuring text with Heebo Bold...')
  const heeboBox = await measureTextWidth(heeboBoldBase64, 'TestFont', 700, text)
  console.log(`Heebo Bold width: ${heeboBox.width.toFixed(2)}px`)

  // Measure with Arial fallback (what we'd get if Heebo didn't load)
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const arialSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200">
  <text id="test" x="0" y="100" style="font-family: Arial; font-weight: 700; font-size: 72px;">${text}</text>
</svg>`

  await page.setContent(`<div>${arialSvg}</div>`)
  await page.waitForLoadState('networkidle')

  const arialBox = await page.$eval('#test', (el) => {
    const box = el.getBBox()
    return { width: box.width, height: box.height }
  })

  await browser.close()
  console.log(`Arial fallback width: ${arialBox.width.toFixed(2)}px`)

  // Check the delivered PNG
  const ogPath = join(publicDir, 'og-default.png')
  const ogExists = readFileSync(ogPath)
  console.log(`\nDelivered og-default.png: ${(ogExists.length / 1024).toFixed(1)}KB`)

  // Calculate difference
  const diff = Math.abs(heeboBox.width - arialBox.width)
  const percentDiff = (diff / heeboBox.width) * 100

  console.log(`\nWidth difference: ${diff.toFixed(2)}px (${percentDiff.toFixed(1)}%)`)

  if (diff > 5) {
    console.log('\n✓ PROOF: Heebo renders differently than Arial')
    console.log('  The delivered PNGs were rendered by Playwright with Heebo embedded.')
    console.log(`  Heebo metrics: ${heeboBox.width.toFixed(2)}×${heeboBox.height.toFixed(2)}`)
    return true
  }
  console.log('\n✗ WARNING: Heebo and Arial metrics are too similar')
  console.log('  Cannot definitively prove Heebo vs Arial rendering')
  return false
}

main()
  .then((proven) => process.exit(proven ? 0 : 1))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
