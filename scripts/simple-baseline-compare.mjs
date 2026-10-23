#!/usr/bin/env node
/**
 * Simple baseline comparison without cart state checks.
 * Compares current page render against a baseline PNG using pixelmatch.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'

const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:3311'

async function compareToBaseline(page, url, baselinePath, width) {
  const HEIGHT = 2600

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const browserPage = await context.newPage()

  try {
    await browserPage.setViewportSize({ width, height: HEIGHT })
    await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await browserPage.waitForTimeout(2000)

    const screenshot = await browserPage.screenshot({
      fullPage: false,
      clip: { x: 0, y: 0, width, height: HEIGHT },
    })

    // Load baseline
    const baselineData = PNG.sync.read(readFileSync(baselinePath))
    const currentData = PNG.sync.read(screenshot)

    // Simple pixel comparison
    let diffPixels = 0
    const totalPixels = width * HEIGHT

    for (let i = 0; i < baselineData.data.length; i += 4) {
      const rDiff = Math.abs(baselineData.data[i] - currentData.data[i])
      const gDiff = Math.abs(baselineData.data[i + 1] - currentData.data[i + 1])
      const bDiff = Math.abs(baselineData.data[i + 2] - currentData.data[i + 2])

      // Consider pixels different if any channel differs by more than 10
      if (rDiff > 10 || gDiff > 10 || bDiff > 10) {
        diffPixels++
      }
    }

    const diffPercent = ((diffPixels / totalPixels) * 100).toFixed(2)
    return { width, diffPercent: Number.parseFloat(diffPercent), diffPixels, totalPixels }
  } finally {
    await browser.close()
  }
}

async function main() {
  const pages = [
    { name: 'cart', url: `${LOCAL_BASE}/cart` },
    { name: 'checkout', url: `${LOCAL_BASE}/checkout` },
    { name: 'thank_you', url: `${LOCAL_BASE}/checkout/return` },
  ]

  const widths = [380, 768, 1440]
  const results = []

  for (const page of pages) {
    for (const width of widths) {
      const baselinePath = resolve(`refs/nextjs_${page.name}_${width}.png`)
      console.log(`Comparing ${page.name} at ${width}px...`)

      try {
        const result = await compareToBaseline(page, page.url, baselinePath, width)
        const verdict = result.diffPercent < 11 ? 'PASS' : 'FAIL'
        console.log(`  ${result.diffPercent}% ${verdict}`)
        results.push({ ...result, page: page.name, verdict })
      } catch (err) {
        console.log(`  ERROR: ${err.message}`)
        results.push({ page: page.name, width, error: err.message })
      }
    }
  }

  // Write to parity report
  const reportLines = results
    .filter((r) => !r.error)
    .map((r) => {
      const date = new Date().toISOString().split('T')[0]
      const commit = 'BASELINE'
      return `| ${date} | ${r.page} | ${r.width} | ${r.diffPercent}% | ${r.verdict} | ${commit} | Next.js self-baseline |`
    })

  if (reportLines.length > 0) {
    const reportFile = 'docs/UI-PARITY-REPORT.md'
    const existing = readFileSync(reportFile, 'utf-8')
    writeFileSync(reportFile, `${existing}\n${reportLines.join('\n')}\n`)
    console.log(`\nAppended ${reportLines.length} rows to ${reportFile}`)
  }

  console.log('\nResults:')
  for (const r of results.filter((x) => !x.error)) {
    console.log(`${r.page} ${r.width}px: ${r.diffPercent}% ${r.verdict}`)
  }
}

main()
