#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

/**
 * Visual verification that the Hebrew text 'קניון EXPRESS' actually renders
 * with Heebo Bold font in the generated assets. This goes beyond pixel analysis
 * to confirm the font is loaded and applied correctly.
 */
async function verifyFontRendering() {
  console.log('Verifying Heebo font rendering...\n')

  // Read the SVG
  const svgPath = join(process.cwd(), 'public', 'logo.svg')
  const svgContent = readFileSync(svgPath, 'utf-8')

  // Launch browser to render the SVG
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Load SVG as data URL
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`
  await page.goto(dataUrl)

  // Wait for fonts to load
  await page.waitForLoadState('networkidle')

  // Check if Heebo font actually loaded (not just declared in CSS)
  const fontInfo = await page.evaluate(async () => {
    const textElement = document.querySelector('text')
    if (!textElement) return null

    // Wait for all fonts to load
    await document.fonts.ready

    // Check if Heebo actually loaded
    const heeboLoaded = document.fonts.check('700 48px Heebo')

    const computedStyle = window.getComputedStyle(textElement)
    const bbox = textElement.getBBox()

    // Get the actual font being used (browser may report this)
    const actualFont = document.fonts.check('700 48px Heebo')
      ? 'Heebo (loaded)'
      : 'Heebo (NOT loaded, using fallback)'

    return {
      fontFamily: computedStyle.fontFamily,
      fontWeight: computedStyle.fontWeight,
      fontSize: computedStyle.fontSize,
      fill: computedStyle.fill || textElement.getAttribute('fill'),
      textContent: textElement.textContent,
      bbox: bbox ? { width: bbox.width, height: bbox.height } : null,
      heeboLoaded,
      actualFont,
      fontsAvailable: Array.from(document.fonts.values()).map(
        (f) => `${f.family} ${f.weight} ${f.style} - ${f.status}`,
      ),
    }
  })

  await browser.close()

  if (!fontInfo) {
    console.error('✗ No text element found in SVG')
    return false
  }

  console.log('Rendered font properties:')
  console.log(`  Font Family (CSS): ${fontInfo.fontFamily}`)
  console.log(`  Heebo Loaded: ${fontInfo.heeboLoaded ? 'YES' : 'NO'}`)
  console.log(`  Actual Font: ${fontInfo.actualFont}`)
  console.log(`  Font Weight: ${fontInfo.fontWeight}`)
  console.log(`  Font Size: ${fontInfo.fontSize}`)
  console.log(`  Fill Color: ${fontInfo.fill}`)
  console.log(`  Text Content: "${fontInfo.textContent}"`)
  if (fontInfo.bbox && fontInfo.bbox.width !== undefined) {
    console.log(
      `  Bounding Box: ${fontInfo.bbox.width.toFixed(2)}×${fontInfo.bbox.height.toFixed(2)}`,
    )
  }
  console.log('\nLoaded fonts:')
  for (const font of fontInfo.fontsAvailable || []) {
    console.log(`  - ${font}`)
  }

  // Verify requirements
  const checks = [
    {
      name: 'Hebrew text content',
      pass: fontInfo.textContent === 'קניון EXPRESS',
      actual: fontInfo.textContent,
      expected: 'קניון EXPRESS',
    },
    {
      name: 'Heebo font actually loaded',
      pass: fontInfo.heeboLoaded === true,
      actual: fontInfo.heeboLoaded ? 'Heebo loaded' : 'Heebo NOT loaded (using fallback)',
      expected: 'Heebo loaded',
    },
    {
      name: 'Bold font weight',
      pass: fontInfo.fontWeight === '700' || fontInfo.fontWeight === 'bold',
      actual: fontInfo.fontWeight,
      expected: '700',
    },
    {
      name: 'Yellow fill color',
      pass: fontInfo.fill.toLowerCase().includes('#fed700') || fontInfo.fill === 'rgb(254, 215, 0)',
      actual: fontInfo.fill,
      expected: '#fed700',
    },
    {
      name: 'Text has rendered dimensions',
      pass: fontInfo.bbox && fontInfo.bbox.width > 0 && fontInfo.bbox.height > 0,
      actual: fontInfo.bbox
        ? `${fontInfo.bbox.width.toFixed(2)}×${fontInfo.bbox.height.toFixed(2)}`
        : 'undefined',
      expected: '> 0×0',
    },
  ]

  console.log('\nVerification results:')
  let allPassed = true
  for (const check of checks) {
    if (check.pass) {
      console.log(`✓ ${check.name}`)
    } else {
      console.error(`✗ ${check.name}: expected ${check.expected}, got ${check.actual}`)
      allPassed = false
    }
  }

  return allPassed
}

async function main() {
  try {
    const passed = await verifyFontRendering()
    if (passed) {
      console.log('\n✓ Heebo font rendering verified successfully')
      process.exit(0)
    } else {
      console.error('\n✗ Heebo font rendering verification failed')
      process.exit(1)
    }
  } catch (error) {
    console.error('Verification error:', error)
    process.exit(1)
  }
}

main()
