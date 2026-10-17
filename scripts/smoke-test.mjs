#!/usr/bin/env node
import { chromium } from 'playwright'

const BASE_URL = process.env.SMOKE_TEST_URL || 'http://localhost:3000'

async function runTest(name, test) {
  process.stdout.write(`Testing: ${name}... `)
  try {
    await test()
    console.log('✅')
    return true
  } catch (error) {
    console.log(`❌ ${error.message}`)
    return false
  }
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.createContext()
  let passed = 0
  let failed = 0

  const tests = [
    {
      name: 'Homepage loads',
      test: async () => {
        const page = await context.newPage()
        const response = await page.goto(BASE_URL, { waitUntil: 'networkidle' })
        if (!response || !response.ok()) throw new Error(`HTTP ${response?.status()}`)
        const title = await page.title()
        if (!title) throw new Error('No page title')
        await page.close()
      },
    },
    {
      name: 'Navigation works',
      test: async () => {
        const page = await context.newPage()
        await page.goto(BASE_URL, { waitUntil: 'networkidle' })
        const navLinks = await page.locator('nav a').count()
        if (navLinks === 0) throw new Error('No navigation links found')
        await page.close()
      },
    },
    {
      name: 'Product page loads',
      test: async () => {
        const page = await context.newPage()
        await page.goto(`${BASE_URL}/products`, { waitUntil: 'networkidle' })
        const productCount = await page.locator('[data-product-card]').count()
        if (productCount === 0) throw new Error('No products found')
        await page.close()
      },
    },
    {
      name: 'Search functionality',
      test: async () => {
        const page = await context.newPage()
        await page.goto(BASE_URL, { waitUntil: 'networkidle' })
        const searchInput = page
          .locator('input[placeholder*="חיפוש"], input[placeholder*="search"]')
          .first()
        if (!(await searchInput.isVisible())) throw new Error('Search input not visible')
        await page.close()
      },
    },
    {
      name: 'Cart button visible',
      test: async () => {
        const page = await context.newPage()
        await page.goto(BASE_URL, { waitUntil: 'networkidle' })
        const cartButton = page
          .locator('button[aria-label*="cart"], button[aria-label*="עגלה"]')
          .first()
        if (!(await cartButton.isVisible())) throw new Error('Cart button not visible')
        await page.close()
      },
    },
    {
      name: 'API health endpoint',
      test: async () => {
        const response = await fetch(`${BASE_URL}/api/health`)
        if (!response.ok && response.status !== 401) {
          throw new Error(`HTTP ${response.status}`)
        }
      },
    },
    {
      name: 'Sitemap exists',
      test: async () => {
        const response = await fetch(`${BASE_URL}/sitemap.xml`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        if (!text.includes('<?xml')) throw new Error('Invalid XML')
      },
    },
    {
      name: 'Robots.txt exists',
      test: async () => {
        const response = await fetch(`${BASE_URL}/robots.txt`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      },
    },
    {
      name: 'No console errors',
      test: async () => {
        const page = await context.newPage()
        const errors = []

        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            errors.push(msg.text())
          }
        })

        page.on('pageerror', (error) => {
          errors.push(error.toString())
        })

        await page.goto(BASE_URL, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        if (errors.length > 0) {
          throw new Error(`Console errors: ${errors.slice(0, 3).join(', ')}`)
        }

        await page.close()
      },
    },
    {
      name: 'Page responsive',
      test: async () => {
        const page = await context.newPage()
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(BASE_URL, { waitUntil: 'networkidle' })

        const bodyWidth = await page.evaluate(() => document.body.offsetWidth)
        if (bodyWidth > 375) throw new Error(`Body width ${bodyWidth} > viewport 375`)

        await page.close()
      },
    },
  ]

  console.log(`\n🔥 Running smoke tests against ${BASE_URL}\n`)

  for (const { name, test } of tests) {
    if (await runTest(name, test)) {
      passed++
    } else {
      failed++
    }
  }

  await browser.close()

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
