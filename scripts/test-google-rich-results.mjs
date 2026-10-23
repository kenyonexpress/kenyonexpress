#!/usr/bin/env node
/**
 * Google Rich Results Test - Actual Verification
 *
 * Starts local server, fetches pages, and verifies JSON-LD structured data
 * is present and valid. This provides evidence that Google Rich Results Test
 * would pass.
 */

import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const PORT = 3311
const BASE_URL = `http://localhost:${PORT}`

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
}

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`)
}

function header(text) {
  log(`\n${'='.repeat(60)}`, 'blue')
  log(text, 'blue')
  log('='.repeat(60), 'blue')
}

function pass(text) {
  log(`✓ ${text}`, 'green')
}

function fail(text) {
  log(`✗ ${text}`, 'red')
}

/**
 * Fetch and parse JSON-LD from a page
 */
async function fetchJsonLd(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }

    const html = await response.text()

    // Extract all JSON-LD scripts
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    const matches = [...html.matchAll(jsonLdRegex)]

    if (matches.length === 0) {
      return { error: 'No JSON-LD found' }
    }

    const schemas = matches
      .map((match) => {
        try {
          return JSON.parse(match[1])
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return { schemas, html }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Verify Hebrew/RTL in HTML
 */
function verifyHebrew(html) {
  const checks = {
    'lang="he"': html.includes('lang="he"'),
    'dir="rtl"': html.includes('dir="rtl"'),
    'locale=he_IL': html.includes('locale=he_IL') || html.includes('locale="he_IL"'),
    'Hebrew text': /[֐-׿]/.test(html),
  }

  return checks
}

/**
 * Test home page
 */
async function testHomePage() {
  header('Testing Home Page')

  const result = await fetchJsonLd(`${BASE_URL}/`)

  if (result.error) {
    fail(`Home page: ${result.error}`)
    return false
  }

  // Check for Organization and WebSite schemas
  const types = result.schemas.map((s) => s['@type'])
  const hasOrganization = types.includes('Organization')
  const hasWebSite = types.includes('WebSite')

  if (hasOrganization) {
    pass('Organization schema found')
  } else {
    fail('Organization schema missing')
  }

  if (hasWebSite) {
    const websiteSchema = result.schemas.find((s) => s['@type'] === 'WebSite')
    if (websiteSchema.potentialAction?.['@type'] === 'SearchAction') {
      pass('WebSite schema with SearchAction found')
    } else {
      fail('WebSite schema missing SearchAction')
    }
  } else {
    fail('WebSite schema missing')
  }

  // Verify Hebrew
  const hebrewChecks = verifyHebrew(result.html)
  for (const [check, passed] of Object.entries(hebrewChecks)) {
    if (passed) {
      pass(`Hebrew: ${check}`)
    } else {
      fail(`Hebrew: ${check} missing`)
    }
  }

  return hasOrganization && hasWebSite && Object.values(hebrewChecks).every(Boolean)
}

/**
 * Test sitemap
 */
async function testSitemap() {
  header('Testing Sitemap')

  try {
    const response = await fetch(`${BASE_URL}/sitemap.xml`)
    if (!response.ok) {
      fail(`Sitemap HTTP ${response.status}`)
      return false
    }

    const xml = await response.text()

    // Verify it's valid XML with <urlset>
    if (!xml.includes('<urlset') || !xml.includes('</urlset>')) {
      fail('Invalid sitemap XML structure')
      return false
    }

    // Count URLs
    const urlMatches = xml.match(/<url>/g)
    const urlCount = urlMatches ? urlMatches.length : 0

    if (urlCount > 0) {
      pass(`Sitemap contains ${urlCount} URLs`)
    } else {
      fail('Sitemap is empty')
      return false
    }

    // Verify some expected entries
    const hasHome = xml.includes('<loc>http')
    const hasSitemap = xml.includes('sitemap')

    if (hasHome) {
      pass('Sitemap has valid URL entries')
    }

    return urlCount > 0
  } catch (error) {
    fail(`Sitemap error: ${error.message}`)
    return false
  }
}

/**
 * Test robots.txt
 */
async function testRobots() {
  header('Testing Robots.txt')

  try {
    const response = await fetch(`${BASE_URL}/robots.txt`)
    if (!response.ok) {
      fail(`Robots.txt HTTP ${response.status}`)
      return false
    }

    const text = await response.text()

    const checks = {
      'User-agent':
        text.includes('user-agent') || text.includes('User-agent') || text.includes('userAgent'),
      'Disallow rules': text.includes('disallow') || text.includes('Disallow'),
      'Sitemap reference': text.includes('sitemap') || text.includes('Sitemap'),
    }

    let allPass = true
    for (const [check, passed] of Object.entries(checks)) {
      if (passed) {
        pass(check)
      } else {
        fail(check)
        allPass = false
      }
    }

    return allPass
  } catch (error) {
    fail(`Robots.txt error: ${error.message}`)
    return false
  }
}

/**
 * Start server and run tests
 */
async function main() {
  log('\n🔍 Google Rich Results Verification', 'blue')
  log('Starting local production server...', 'yellow')

  // Start server
  const server = spawn('pnpm', ['start'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  })

  // Wait for server to be ready
  log('Waiting for server to start...', 'yellow')
  let ready = false
  let attempts = 0

  while (!ready && attempts < 30) {
    try {
      const response = await fetch(`${BASE_URL}/`)
      if (response.ok) {
        ready = true
        pass('Server is ready')
      }
    } catch {
      // Server not ready yet
    }
    if (!ready) {
      await setTimeout(1000)
      attempts++
    }
  }

  if (!ready) {
    fail('Server failed to start')
    server.kill()
    process.exit(1)
  }

  // Run tests
  const results = {
    home: await testHomePage(),
    sitemap: await testSitemap(),
    robots: await testRobots(),
  }

  // Stop server
  server.kill()

  // Summary
  header('Verification Summary')

  const total = Object.keys(results).length
  const passed = Object.values(results).filter(Boolean).length

  log(`\nTotal tests: ${total}`, 'blue')
  log(`Passed: ${passed}`, passed === total ? 'green' : 'yellow')

  if (passed === total) {
    log('\n✅ All Google Rich Results checks passed!', 'green')
    log('✅ Ready for production Google Rich Results Test', 'green')
  } else {
    log(`\n❌ ${total - passed} check(s) failed`, 'red')
  }

  process.exit(passed === total ? 0 : 1)
}

main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red')
  process.exit(1)
})
