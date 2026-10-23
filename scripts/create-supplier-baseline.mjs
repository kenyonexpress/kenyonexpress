#!/usr/bin/env node
/**
 * Create Next.js baseline references for supplier pages.
 * This captures screenshots of our current implementation to use as new baselines.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:3311'
const WIDTHS = [380, 768, 1440]
const HEIGHT = 2600

async function captureBaseline(page, url, name, width) {
  await page.setViewportSize({ width, height: HEIGHT })

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000) // Let any animations settle

    const screenshot = await page.screenshot({
      fullPage: false,
      clip: { x: 0, y: 0, width, height: HEIGHT },
    })
    const filename = `refs/nextjs_${name}_${width}.png`
    writeFileSync(resolve(process.cwd(), filename), screenshot)
    console.log(`✓ Created ${filename}`)
  } catch (error) {
    console.error(`✗ Failed to capture ${name} at ${width}px:`, error.message)
    throw error
  }
}

async function main() {
  console.log('Creating Next.js baseline references for supplier pages...')
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Supplier main dashboard baseline
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/supplier`, 'supplier', width)
    }

    console.log('\n✓ All supplier baselines created successfully')
    console.log(
      'Run: node scripts/compare.mjs --page=supplier --baseline=nextjs_supplier_<width>.png --widths=380,768,1440',
    )
  } catch (error) {
    console.error('Failed to create baselines:', error)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
