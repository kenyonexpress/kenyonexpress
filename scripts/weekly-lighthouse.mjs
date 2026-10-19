#!/usr/bin/env node
/**
 * Weekly Lighthouse audit on top 10 pages.
 * Measures: Performance, Accessibility, SEO
 * Alerts if any page scores < 90 on Performance or Accessibility
 *
 * Usage:
 *   pnpm build && pnpm start &
 *   node scripts/weekly-lighthouse.mjs
 *
 * Output: docs/UI-PARITY-REPORT.md (weekly measurements)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dir, '..')

const LOCAL = process.env.LOCAL_BASE ?? 'http://localhost:3000'

// Top 10 critical pages for measurement
const TOP_10_PAGES = [
  { name: 'home', url: '/', label: 'Homepage' },
  { name: 'products', url: '/products', label: 'Products Catalog' },
  { name: 'category', url: '/category/hot-deals', label: 'Category (Hot Deals)' },
  { name: 'search', url: '/search?q=אוזניות', label: 'Search Results' },
  { name: 'cart', url: '/cart', label: 'Shopping Cart' },
  // checkout redirects empty carts to /cart, so this script measures /cart under "checkout" name.
  // Use /cart measurement for checkout performance metrics.
  { name: 'contact', url: '/contact', label: 'Contact Form' },
  { name: 'account', url: '/account/affiliate', label: 'User Account' },
  { name: 'privacy', url: '/privacy-policy', label: 'Privacy Policy' },
  { name: 'terms', url: '/terms-and-conditions', label: 'Terms & Conditions' },
]

const THRESHOLD = {
  performance: 90,
  accessibility: 90,
  seo: 85,
}

console.log('🚀 Starting weekly Lighthouse audit on top 10 pages...\n')

const results = []
const failures = []

for (const page of TOP_10_PAGES) {
  const url = page.url.startsWith('http') ? page.url : `${LOCAL}${page.url}`
  const outFile = resolve(repoRoot, `refs/lh-${page.name}-weekly.json`)

  console.log(`📏 Measuring: ${page.label} (${url})`)

  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'lighthouse',
      url,
      '--only-categories=performance,accessibility,seo',
      '--chrome-flags=--headless --no-sandbox',
      '--output=json',
      `--output-path=${outFile}`,
      '--quiet',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  if (result.status !== 0) {
    console.error(`  ❌ Failed: ${result.stderr || result.stdout || 'unknown error'}`)
    failures.push({
      page: page.label,
      error: 'Lighthouse measurement failed',
    })
    continue
  }

  try {
    const report = JSON.parse(readFileSync(outFile, 'utf8'))
    const scores = {
      performance: Math.round((report.categories.performance?.score ?? 0) * 100),
      accessibility: Math.round((report.categories.accessibility?.score ?? 0) * 100),
      seo: Math.round((report.categories.seo?.score ?? 0) * 100),
    }

    results.push({
      page: page.label,
      url: page.url,
      ...scores,
      timestamp: new Date().toISOString(),
    })

    // Check for failures
    const perfFail = scores.performance < THRESHOLD.performance
    const a11yFail = scores.accessibility < THRESHOLD.accessibility

    if (perfFail || a11yFail) {
      failures.push({
        page: page.label,
        url: page.url,
        performance: scores.performance,
        accessibility: scores.accessibility,
        seo: scores.seo,
      })
      console.log(
        `  ⚠️  ALERT: Perf=${scores.performance} Acc=${scores.accessibility} SEO=${scores.seo}`,
      )
    } else {
      console.log(
        `  ✅ Pass: Perf=${scores.performance} Acc=${scores.accessibility} SEO=${scores.seo}`,
      )
    }
  } catch (e) {
    console.error(`  ❌ Parse error: ${e.message}`)
    failures.push({
      page: page.label,
      error: `Parse error: ${e.message}`,
    })
  }
}

// Generate weekly report
const reportPath = resolve(repoRoot, 'docs/WEEKLY-LIGHTHOUSE-REPORT.md')
const now = new Date()
const timestamp = now.toISOString().split('T')[0]

let reportContent = `# Weekly Lighthouse Audit Report

**Date:** ${timestamp}
**Generated:** ${now.toISOString()}

## Summary

- **Pages Measured:** ${results.length}/${TOP_10_PAGES.length}
- **Failures:** ${failures.length}
- **Threshold:** Performance ≥ ${THRESHOLD.performance}, Accessibility ≥ ${THRESHOLD.accessibility}

## Results

| Page | Performance | Accessibility | SEO | Status |
|------|-------------|----------------|-----|--------|
`

// Add results table
for (const r of results) {
  const perfStatus = r.performance >= THRESHOLD.performance ? '✅' : '❌'
  const a11yStatus = r.accessibility >= THRESHOLD.accessibility ? '✅' : '❌'
  reportContent += `| ${r.page} | ${r.performance} ${perfStatus} | ${r.accessibility} ${a11yStatus} | ${r.seo} | ${failures.some((f) => f.page === r.page) ? '⚠️ ALERT' : '✅ PASS'} |\n`
}

reportContent += '\n## Alert Details\n\n'

if (failures.length > 0) {
  reportContent += `### 🚨 ${failures.length} Critical Alerts\n\n`
  for (const failure of failures) {
    if (failure.error) {
      reportContent += `- **${failure.page}**: ${failure.error}\n`
    } else {
      reportContent += `- **${failure.page}**\n`
      reportContent += `  - URL: \`${failure.url}\`\n`
      reportContent += `  - Performance: ${failure.performance} (threshold: ${THRESHOLD.performance})\n`
      reportContent += `  - Accessibility: ${failure.accessibility} (threshold: ${THRESHOLD.accessibility})\n`
      reportContent += `  - SEO: ${failure.seo}\n\n`
    }
  }
} else {
  reportContent += '✅ **All pages passing!** No alerts.\n\n'
}

reportContent += `## Raw Data\n\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`

writeFileSync(reportPath, reportContent)
console.log(`\n📄 Report written to: ${reportPath}`)

// Send ntfy alert if there are failures
if (failures.length > 0) {
  console.log(`\n🚨 ALERT: ${failures.length} page(s) below threshold!`)

  const alertSummary = failures
    .slice(0, 5)
    .map((f) => {
      if (f.error) return f.page
      const issues = []
      if (f.performance < THRESHOLD.performance) issues.push(`Perf ${f.performance}`)
      if (f.accessibility < THRESHOLD.accessibility) issues.push(`A11y ${f.accessibility}`)
      return `${f.page}: ${issues.join(', ')}`
    })
    .join(' | ')

  const message = `⚠️ Lighthouse Weekly: ${failures.length} alert(s)\n${alertSummary}`

  const ntfyResult = spawnSync('curl', ['-d', message, 'ntfy.sh/kenyon-ofir-limit'])

  if (ntfyResult.status === 0) {
    console.log('✅ ntfy alert sent')
  } else {
    console.warn('⚠️ ntfy alert failed (non-blocking)')
  }

  process.exit(1)
} else {
  console.log('\n✅ All pages passing! No alerts.')
  process.exit(0)
}
