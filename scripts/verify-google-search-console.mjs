#!/usr/bin/env node

/**
 * Verification script for Google Search Console setup (C55)
 *
 * Checks:
 * 1. DNS TXT record for google-site-verification
 * 2. Sitemap accessibility
 * 3. Sitemap format validity
 * 4. Robots.txt sitemap reference
 *
 * Usage:
 *   node scripts/verify-google-search-console.mjs
 *   node scripts/verify-google-search-console.mjs --domain kenyonexpress.co.il
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const DOMAIN = process.argv.includes('--domain')
  ? process.argv[process.argv.indexOf('--domain') + 1]
  : 'kenyonexpress.co.il'

const WWW_DOMAIN = `www.${DOMAIN}`
const SITEMAP_URL = `https://${WWW_DOMAIN}/sitemap.xml`
const ROBOTS_URL = `https://${WWW_DOMAIN}/robots.txt`

const checks = {
  dns_txt: false,
  sitemap_accessible: false,
  sitemap_xml_valid: false,
  sitemap_content_type: false,
  robots_references_sitemap: false,
}

let errorCount = 0
let warningCount = 0

function logSuccess(message) {
  console.log(`✅ ${message}`)
}

function logError(message) {
  console.log(`❌ ${message}`)
  errorCount++
}

function logWarning(message) {
  console.log(`⚠️  ${message}`)
  warningCount++
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`)
}

async function checkDnsTxtRecord() {
  console.log('\n=== Checking DNS TXT Record ===')
  logInfo(`Domain: ${DOMAIN}`)

  try {
    const { stdout, stderr } = await execAsync(`dig TXT ${DOMAIN} +short`)

    if (stderr) {
      logWarning(`dig stderr: ${stderr}`)
    }

    const txtRecords = stdout
      .split('\n')
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter((line) => line.length > 0)

    logInfo(`Found ${txtRecords.length} TXT record(s):`)
    for (const record of txtRecords) {
      console.log(`  - ${record.substring(0, 80)}${record.length > 80 ? '...' : ''}`)
    }

    const googleVerification = txtRecords.find((record) =>
      record.startsWith('google-site-verification='),
    )

    if (googleVerification) {
      const token = googleVerification.replace('google-site-verification=', '')
      logSuccess('Google verification TXT record found')
      logInfo(`Token: ${token.substring(0, 20)}...${token.substring(token.length - 20)}`)
      checks.dns_txt = true
    } else {
      logError('No google-site-verification TXT record found')
      logInfo('Expected format: google-site-verification=XXXXX...')
      logInfo('Add this record to your DNS provider (registrar, Vercel, or Cloudflare)')
    }
  } catch (error) {
    logError(`Failed to check DNS TXT record: ${error.message}`)
    if (error.message.includes('command not found')) {
      logInfo('Install dig: brew install bind (macOS) or apt-get install dnsutils (Linux)')
    }
  }
}

async function checkSitemapAccessibility() {
  console.log('\n=== Checking Sitemap Accessibility ===')
  logInfo(`URL: ${SITEMAP_URL}`)

  try {
    const { stdout, stderr } = await execAsync(`curl -s -I "${SITEMAP_URL}"`)

    if (stderr) {
      logWarning(`curl stderr: ${stderr}`)
    }

    const headers = stdout.split('\n').map((line) => line.trim())
    const statusLine = headers[0]

    if (statusLine.includes('200')) {
      logSuccess('Sitemap is accessible (200 OK)')
      checks.sitemap_accessible = true

      // Check content-type
      const contentTypeLine = headers.find((h) => h.toLowerCase().startsWith('content-type:'))
      if (contentTypeLine) {
        const contentType = contentTypeLine.split(':')[1].trim()
        logInfo(`Content-Type: ${contentType}`)

        if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
          logSuccess('Content-Type is correct (XML)')
          checks.sitemap_content_type = true
        } else {
          logWarning(`Content-Type should be application/xml, got: ${contentType}`)
        }
      }

      // Check cache headers
      const cacheControlLine = headers.find((h) => h.toLowerCase().startsWith('cache-control:'))
      if (cacheControlLine) {
        logInfo(`${cacheControlLine}`)
      }
    } else if (statusLine.includes('308') || statusLine.includes('301')) {
      logWarning(`Sitemap redirects: ${statusLine}`)
      const locationLine = headers.find((h) => h.toLowerCase().startsWith('location:'))
      if (locationLine) {
        logInfo(`Redirects to: ${locationLine.split(':')[1].trim()}`)
      }
      logInfo('This may be OK if apex redirects to www')
    } else {
      logError(`Sitemap not accessible: ${statusLine}`)
    }
  } catch (error) {
    logError(`Failed to check sitemap accessibility: ${error.message}`)
  }
}

async function checkSitemapContent() {
  console.log('\n=== Checking Sitemap Content ===')

  try {
    const { stdout, stderr } = await execAsync(`curl -s "${SITEMAP_URL}" | head -100`)

    if (stderr) {
      logWarning(`curl stderr: ${stderr}`)
    }

    // Check XML declaration
    if (stdout.includes('<?xml version="1.0"')) {
      logSuccess('Valid XML declaration found')
    } else {
      logError('Missing XML declaration')
    }

    // Check sitemap namespace
    if (stdout.includes('http://www.sitemaps.org/schemas/sitemap/0.9')) {
      logSuccess('Valid sitemap namespace')
      checks.sitemap_xml_valid = true
    } else {
      logError('Missing or invalid sitemap namespace')
    }

    // Count URLs (rough estimate from first 100 lines)
    const urlMatches = stdout.match(/<loc>/g)
    if (urlMatches) {
      logInfo(`Found ${urlMatches.length} URLs in sample (first 100 lines)`)

      // Show a few example URLs
      const urlLines = stdout.split('\n').filter((line) => line.includes('<loc>'))
      logInfo('Sample URLs:')
      for (const line of urlLines.slice(0, 3)) {
        const url = line.match(/<loc>(.*?)<\/loc>/)?.[1]
        if (url) console.log(`  - ${url}`)
      }

      // Check URL format
      const firstUrl = urlLines[0]?.match(/<loc>(.*?)<\/loc>/)?.[1]
      if (firstUrl) {
        if (firstUrl.startsWith('https://')) {
          logSuccess('URLs use HTTPS')
        } else {
          logWarning(`URLs should use HTTPS, got: ${firstUrl}`)
        }

        // Check which domain is used in sitemap
        if (firstUrl.includes(WWW_DOMAIN)) {
          logInfo(`Sitemap uses www subdomain (${WWW_DOMAIN})`)
        } else if (firstUrl.includes(DOMAIN)) {
          logInfo(`Sitemap uses apex domain (${DOMAIN})`)
        }
      }
    } else {
      logWarning('No URLs found in sitemap sample')
    }
  } catch (error) {
    logError(`Failed to check sitemap content: ${error.message}`)
  }
}

async function checkRobotsTxt() {
  console.log('\n=== Checking Robots.txt ===')
  logInfo(`URL: ${ROBOTS_URL}`)

  try {
    const { stdout, stderr } = await execAsync(`curl -s "${ROBOTS_URL}"`)

    if (stderr) {
      logWarning(`curl stderr: ${stderr}`)
    }

    if (stdout.includes('Sitemap:')) {
      logSuccess('Robots.txt contains Sitemap directive')

      const sitemapLine = stdout.split('\n').find((line) => line.includes('Sitemap:'))
      if (sitemapLine) {
        const sitemapUrl = sitemapLine.split('Sitemap:')[1].trim()
        logInfo(`Sitemap URL: ${sitemapUrl}`)

        if (sitemapUrl.includes('/sitemap.xml')) {
          logSuccess('Sitemap URL points to /sitemap.xml')
          checks.robots_references_sitemap = true
        } else {
          logWarning(`Sitemap URL doesn't match expected: ${sitemapUrl}`)
        }
      }
    } else {
      logWarning('Robots.txt missing Sitemap directive')
      logInfo(`Expected: Sitemap: ${SITEMAP_URL}`)
    }

    // Show robots.txt content
    logInfo('Robots.txt content (first 10 lines):')
    for (const line of stdout.split('\n').slice(0, 10)) {
      if (line.trim()) console.log(`  ${line}`)
    }
  } catch (error) {
    logError(`Failed to check robots.txt: ${error.message}`)
  }
}

async function printSummary() {
  console.log('\n=== Summary ===')

  const allChecks = Object.entries(checks)
  const passedChecks = allChecks.filter(([_, passed]) => passed).length
  const totalChecks = allChecks.length

  console.log(`\nChecks: ${passedChecks}/${totalChecks} passed`)
  for (const [check, passed] of allChecks) {
    const icon = passed ? '✅' : '❌'
    const label = check.replace(/_/g, ' ').toUpperCase()
    console.log(`${icon} ${label}`)
  }

  console.log(`\nErrors: ${errorCount}`)
  console.log(`Warnings: ${warningCount}`)

  if (errorCount === 0 && passedChecks === totalChecks) {
    console.log('\n🎉 All checks passed! Google Search Console setup is ready.')
    return 0
  }
  if (!checks.dns_txt) {
    console.log('\n⚠️  DNS TXT verification record not found.')
    console.log('\nNext steps:')
    console.log('1. Go to https://search.google.com/search-console/')
    console.log(`2. Add property: ${DOMAIN}`)
    console.log(`3. Choose "Domain" verification method`)
    console.log('4. Copy the google-site-verification TXT record')
    console.log('5. Add it to your DNS provider')
    console.log('6. Wait 5-15 minutes for DNS propagation')
    console.log('7. Run this script again to verify')
    return 1
  }
  console.log('\n⚠️  Some checks failed. Review errors above.')
  return 1
}

async function main() {
  console.log('Google Search Console Verification (C55)')
  console.log('=========================================')

  await checkDnsTxtRecord()
  await checkSitemapAccessibility()
  await checkSitemapContent()
  await checkRobotsTxt()
  const exitCode = await printSummary()

  process.exit(exitCode)
}

main().catch((error) => {
  console.error(`\n❌ Fatal error: ${error.message}`)
  process.exit(1)
})
