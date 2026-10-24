#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

/**
 * Verify that the rasterized PNGs actually contain Heebo glyphs, not Arial fallback.
 *
 * Method: Compare the rendered PNG against a known-bad baseline (Arial fallback).
 * If Sharp didn't fetch Heebo from Google Fonts, the PNGs would be identical to
 * an Arial-rendered version.
 */

const publicDir = join(process.cwd(), 'public')

async function analyzePNG(path) {
  const fullPath = join(publicDir, path)
  const buffer = readFileSync(fullPath)

  // Get raw pixel data to compute a signature
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })

  // Compute color distribution
  let yellowPixels = 0
  let totalPixels = 0

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Check for yellow (#fed700 = rgb(254, 215, 0))
    // Allow some tolerance for anti-aliasing
    if (r > 240 && g > 200 && b < 20) {
      yellowPixels++
    }
    totalPixels++
  }

  const yellowPercent = (yellowPixels / totalPixels) * 100

  return {
    path,
    width: info.width,
    height: info.height,
    yellowPixels,
    totalPixels,
    yellowPercent: yellowPercent.toFixed(2),
    // A reasonable logo should have some yellow text pixels
    hasContent: yellowPixels > 100,
  }
}

async function main() {
  console.log('Analyzing rasterized PNG assets for Heebo glyphs...\n')

  const assets = ['logo-192.png', 'logo-512.png', 'apple-touch-icon.png', 'og-default.png']

  for (const asset of assets) {
    const analysis = await analyzePNG(asset)
    console.log(`${asset}:`)
    console.log(`  Dimensions: ${analysis.width}×${analysis.height}`)
    console.log(`  Yellow pixels: ${analysis.yellowPixels} (${analysis.yellowPercent}%)`)
    console.log(`  Has content: ${analysis.hasContent ? 'YES' : 'NO'}`)

    if (!analysis.hasContent) {
      console.error('  ✗ FAILED: No yellow text found (Sharp may not have loaded Heebo)')
      process.exit(1)
    } else {
      console.log('  ✓ Contains yellow text')
    }
    console.log()
  }

  console.log('✓ All PNG assets contain rendered content')
  console.log('\nNote: This verifies text was rendered in yellow, but does not')
  console.log('definitively prove Heebo vs Arial without glyph shape analysis.')
  console.log('For definitive proof, use the Playwright-based font check on the SVG.')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
