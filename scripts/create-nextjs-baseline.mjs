#!/usr/bin/env node
/**
 * Create Next.js baseline references for category and city pages.
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
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000) // Let any animations settle

  const screenshot = await page.screenshot({
    fullPage: false,
    clip: { x: 0, y: 0, width, height: HEIGHT },
  })
  const filename = `refs/nextjs_${name}_${width}.png`
  writeFileSync(resolve(process.cwd(), filename), screenshot)
  console.log(`✓ Created ${filename}`)
}

async function main() {
  console.log('Creating Next.js baseline references...')
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Category baseline
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/category/hot-deals`, 'category', width)
    }

    // City baseline (even if empty, capture the layout)
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/c/tel-aviv`, 'city', width)
    }

    console.log('\n✓ All baselines created successfully')
    console.log('Update compare.mjs to use --baseline=nextjs_category_<width>.png')
  } catch (error) {
    console.error('Failed to create baselines:', error)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
