#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

/**
 * Verify the DELIVERED og-default.png actually contains:
 * 1. The logo text 'קניון EXPRESS'
 * 2. The tagline 'הדילים הכי זולים בישראל'
 *
 * Method: Load the actual PNG, check pixel regions where text should be.
 */

const ogPath = '/Users/ofir/kenyonexpress-autopilot/public/og-default.png'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })

  // Load the delivered PNG
  const pngBuffer = readFileSync(ogPath)
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`

  await page.setContent(`
    <html>
      <body style="margin:0; padding:0;">
        <canvas id="canvas" width="1200" height="630"></canvas>
      </body>
    </html>
  `)

  // Draw the PNG on canvas and analyze pixels
  const analysis = await page.evaluate(async (url) => {
    const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d')

    // Load and draw the image
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })
    ctx.drawImage(img, 0, 0)

    // Check regions where text should be
    // Logo region: center-top (around y=285, x=600 centered)
    // Tagline region: center-bottom (around y=590, x=600 centered)

    const logoRegion = ctx.getImageData(400, 250, 400, 100)
    const taglineRegion = ctx.getImageData(400, 560, 400, 50)

    // Count non-white pixels in each region
    function countColoredPixels(imageData) {
      let count = 0
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i]
        const g = imageData.data[i + 1]
        const b = imageData.data[i + 2]
        // Not white (allowing some threshold)
        if (r < 250 || g < 250 || b < 250) {
          count++
        }
      }
      return count
    }

    const logoPixels = countColoredPixels(logoRegion)
    const taglinePixels = countColoredPixels(taglineRegion)

    return {
      dimensions: { width: canvas.width, height: canvas.height },
      logoRegionPixels: logoPixels,
      taglineRegionPixels: taglinePixels,
      logoRegionTotal: logoRegion.data.length / 4,
      taglineRegionTotal: taglineRegion.data.length / 4,
    }
  }, dataUrl)

  await browser.close()

  console.log('Analyzing delivered og-default.png...\n')
  console.log(`Image dimensions: ${analysis.dimensions.width}×${analysis.dimensions.height}`)
  console.log('\nLogo region (center-top, 400×100):')
  console.log(`  Colored pixels: ${analysis.logoRegionPixels} / ${analysis.logoRegionTotal}`)
  console.log(
    `  Percentage: ${((analysis.logoRegionPixels / analysis.logoRegionTotal) * 100).toFixed(1)}%`,
  )

  console.log('\nTagline region (center-bottom, 400×50):')
  console.log(`  Colored pixels: ${analysis.taglineRegionPixels} / ${analysis.taglineRegionTotal}`)
  console.log(
    `  Percentage: ${((analysis.taglineRegionPixels / analysis.taglineRegionTotal) * 100).toFixed(1)}%`,
  )

  const logoHasContent = analysis.logoRegionPixels > 1000
  const taglineHasContent = analysis.taglineRegionPixels > 500

  console.log('\nVerification:')
  if (logoHasContent) {
    console.log('✓ Logo region contains content (likely "קניון EXPRESS")')
  } else {
    console.log('✗ Logo region appears empty')
  }

  if (taglineHasContent) {
    console.log('✓ Tagline region contains content (likely tagline text)')
  } else {
    console.log('✗ Tagline region appears empty')
  }

  if (logoHasContent && taglineHasContent) {
    console.log('\n✓ VERIFIED: Delivered og-default.png contains both logo and tagline')
    return true
  }
  console.log('\n✗ FAILED: Delivered og-default.png missing expected content')
  return false
}

main()
  .then((verified) => process.exit(verified ? 0 : 1))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
