#!/usr/bin/env node
/**
 * Create Next.js baseline references for cart, checkout, and thank-you pages.
 * Cart and checkout are captured in EMPTY state for comparison.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:3311'
const WIDTHS = [380, 768, 1440]
const HEIGHT = 2600

async function captureBaseline(page, url, name, width) {
  await page.setViewportSize({ width, height: HEIGHT })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000) // Let any animations settle

  // Prove where we landed (checkout bounces to cart when empty)
  const finalUrl = page.url()
  console.log(`  Requested: ${url}, landed: ${finalUrl}`)

  const screenshot = await page.screenshot({
    fullPage: false,
    clip: { x: 0, y: 0, width, height: HEIGHT },
  })
  const filename = `refs/nextjs_${name}_${width}.png`
  writeFileSync(resolve(process.cwd(), filename), screenshot)
  console.log(`✓ Created ${filename}`)
}

async function main() {
  console.log('Creating Next.js baseline references (EMPTY cart state)...')
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Cart baseline - EMPTY cart
    console.log('\nCapturing empty cart baselines...')
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/cart`, 'cart', width)
    }

    // Checkout baseline - EMPTY (redirects to cart when empty)
    console.log('\nCapturing empty checkout baselines...')
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/checkout`, 'checkout', width)
    }

    // Thank-you baseline (shows "order not found" state)
    console.log('\nCapturing thank-you baselines...')
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/checkout/return`, 'thank_you', width)
    }

    console.log('\n✓ All baselines created successfully')
    console.log(
      'Measure with: COMPARE_CART_EMPTY=1 node scripts/compare.mjs --page=cart --width=<width> --baseline=nextjs_cart_<width>.png',
    )
  } catch (error) {
    console.error('Failed to create baselines:', error)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
