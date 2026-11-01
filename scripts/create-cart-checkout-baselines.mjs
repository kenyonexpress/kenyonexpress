#!/usr/bin/env node
/**
 * Create Next.js baseline references for cart, checkout, and thank-you pages.
 * This captures screenshots of our current implementation to use as new baselines.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:3311'
const WIDTHS = [380, 768, 1440]
const HEIGHT = 2600

async function captureBaseline(page, url, name, width, setupFn) {
  await page.setViewportSize({ width, height: HEIGHT })

  // Run setup if provided (e.g., add items to cart)
  if (setupFn) {
    await setupFn(page)
  }

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000) // Let any animations settle

  // An empty cart sends /checkout to /cart. If the seed did not take, refuse
  // rather than save the cart's pixels under checkout's name.
  const finalPath = new URL(page.url()).pathname
  if (finalPath !== new URL(url).pathname) {
    throw new Error(
      `${name}@${width}: asked for ${url} but landed on ${finalPath}; cart not seeded?`,
    )
  }

  const screenshot = await page.screenshot({
    fullPage: false,
    clip: { x: 0, y: 0, width, height: HEIGHT },
  })
  const filename = `refs/nextjs_${name}_${width}.png`
  writeFileSync(resolve(process.cwd(), filename), screenshot)
  console.log(`✓ Created ${filename}`)
}

async function addItemToCart(page) {
  // Add a product to cart so cart/checkout pages have content
  await page.goto(`${LOCAL_BASE}/products`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  // Find and click first "Add to Cart" button
  const addButton = page.locator('button:has-text("הוסף לסל")').first()
  if ((await addButton.count()) > 0) {
    await addButton.click()
    await page.waitForTimeout(1000)
  }
}

async function main() {
  console.log('Creating Next.js baseline references for cart, checkout, and thank-you...')
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Add item to cart first
    await addItemToCart(page)

    // Cart baseline
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/cart`, 'cart', width)
    }

    // Checkout baseline
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/checkout`, 'checkout', width)
    }

    // Thank-you baseline (checkout/return)
    // Note: This page requires a completed order, so baseline may show "order not found"
    for (const width of WIDTHS) {
      await captureBaseline(page, `${LOCAL_BASE}/checkout/return`, 'thank_you', width)
    }

    console.log('\n✓ All baselines created successfully')
    console.log('Use with: compare.mjs --baseline=nextjs_<page>_<width>.png')
  } catch (error) {
    console.error('Failed to create baselines:', error)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
