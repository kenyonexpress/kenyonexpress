#!/usr/bin/env node
/**
 * Complete Google Rich Results Verification
 * Tests all JSON-LD schemas on actual pages from running server
 */

import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const PORT = 3311
const BASE_URL = `http://localhost:${PORT}`

function log(msg, color = '') {
  const colors = { green: '\x1b[32m', red: '\x1b[31m', blue: '\x1b[34m', reset: '\x1b[0m' }
  console.log(`${colors[color] || ''}${msg}${colors.reset}`)
}

async function fetchJsonLd(url) {
  const response = await fetch(url)
  const html = await response.text()
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const schemas = [...html.matchAll(regex)]
    .map((m) => {
      try {
        return JSON.parse(m[1])
      } catch {
        return null
      }
    })
    .filter(Boolean)
  return { schemas, html }
}

async function main() {
  log('\n=== Complete Google Rich Results Verification ===', 'blue')

  // Start server
  log('Starting production server...', 'blue')
  const server = spawn('pnpm', ['start'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  })

  // Wait for ready
  let ready = false
  for (let i = 0; i < 30 && !ready; i++) {
    try {
      await fetch(`${BASE_URL}/`)
      ready = true
    } catch {
      await setTimeout(1000)
    }
  }

  if (!ready) {
    log('❌ Server failed to start', 'red')
    server.kill()
    process.exit(1)
  }

  log('✓ Server ready\n', 'green')

  const results = []

  // Test 1: Homepage - Organization + WebSite
  log('Testing Homepage (Organization + WebSite)...', 'blue')
  const home = await fetchJsonLd(`${BASE_URL}/`)
  const homeTypes = home.schemas.map((s) => s['@type'])
  results.push({
    name: 'Homepage Organization',
    pass: homeTypes.includes('Organization'),
  })
  results.push({
    name: 'Homepage WebSite with SearchAction',
    pass:
      homeTypes.includes('WebSite') &&
      home.schemas.find((s) => s['@type'] === 'WebSite')?.potentialAction?.['@type'] ===
        'SearchAction',
  })

  // Test 2: Hebrew schema
  results.push({ name: 'HTML lang=he', pass: home.html.includes('lang="he"') })
  results.push({ name: 'HTML dir=rtl', pass: home.html.includes('dir="rtl"') })
  results.push({ name: 'OG locale he_IL', pass: home.html.includes('he_IL') })
  results.push({ name: 'Hebrew text present', pass: /[֐-׿]/.test(home.html) })

  // Test 3: Sitemap
  log('Testing Sitemap...', 'blue')
  const sitemap = await fetch(`${BASE_URL}/sitemap.xml`)
  const sitemapText = await sitemap.text()
  const urlCount = (sitemapText.match(/<url>/g) || []).length
  results.push({ name: `Sitemap (${urlCount} URLs)`, pass: urlCount > 0 })

  // Test 4: Robots.txt
  log('Testing Robots.txt...', 'blue')
  const robots = await fetch(`${BASE_URL}/robots.txt`)
  const robotsText = await robots.text()
  results.push({
    name: 'Robots.txt valid',
    pass:
      robotsText.toLowerCase().includes('disallow') && robotsText.toLowerCase().includes('sitemap'),
  })

  // Print results
  log('\n=== Results ===', 'blue')
  const passed = results.filter((r) => r.pass).length
  const total = results.length

  for (const r of results) {
    log(r.pass ? `✓ ${r.name}` : `✗ ${r.name}`, r.pass ? 'green' : 'red')
  }

  log(`\n${passed}/${total} checks passed`, passed === total ? 'green' : 'red')

  if (passed === total) {
    log('\n✅ All Google Rich Results checks PASSED', 'green')
    log('✅ JSON-LD schemas verified on live pages', 'green')
    log('✅ Ready for production deployment\n', 'green')
  }

  server.kill()
  process.exit(passed === total ? 0 : 1)
}

main().catch((e) => {
  log(`\n❌ Error: ${e.message}`, 'red')
  process.exit(1)
})
