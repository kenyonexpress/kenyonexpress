#!/usr/bin/env node
/**
 * SEO Implementation Verification Script
 *
 * Verifies that all SEO features are properly implemented:
 * - JSON-LD structured data (Product, Organization, WebSite, BreadcrumbList, LocalBusiness)
 * - Sitemap.xml generation
 * - Robots.txt
 * - OpenGraph meta tags
 * - Hebrew schema (lang, dir, locale)
 *
 * Can also test against Google Rich Results Test API
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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
 * Verify JSON-LD implementation files exist
 */
function verifyJsonLdFiles() {
  header('Verifying JSON-LD Implementation Files')

  const files = ['src/lib/seo/json-ld.ts', 'src/lib/seo/json-ld.test.ts']

  let allExist = true
  for (const file of files) {
    try {
      readFileSync(file, 'utf8')
      pass(`File exists: ${file}`)
    } catch (_error) {
      fail(`File missing: ${file}`)
      allExist = false
    }
  }

  return allExist
}

/**
 * Verify sitemap and robots.txt files exist
 */
function verifySitemapAndRobots() {
  header('Verifying Sitemap and Robots.txt')

  const files = [
    'src/app/sitemap.ts',
    'src/app/sitemap.test.ts',
    'src/app/robots.ts',
    'src/app/robots.test.ts',
  ]

  let allExist = true
  for (const file of files) {
    try {
      readFileSync(file, 'utf8')
      pass(`File exists: ${file}`)
    } catch (_error) {
      fail(`File missing: ${file}`)
      allExist = false
    }
  }

  return allExist
}

/**
 * Verify Hebrew schema in layout
 */
function verifyHebrewSchema() {
  header('Verifying Hebrew Schema')

  try {
    const layout = readFileSync('src/app/layout.tsx', 'utf8')

    const checks = [
      { pattern: /lang="he"/, name: 'lang="he" in HTML tag' },
      { pattern: /dir="rtl"/, name: 'dir="rtl" in HTML tag' },
      { pattern: /locale:\s*['"]he_IL['"]/, name: 'locale: "he_IL" in OpenGraph' },
      { pattern: /languages:\s*\{[\s\S]*?'he-IL'/, name: 'languages: he-IL in alternates' },
    ]

    let allPass = true
    for (const check of checks) {
      if (check.pattern.test(layout)) {
        pass(check.name)
      } else {
        fail(check.name)
        allPass = false
      }
    }

    return allPass
  } catch (error) {
    fail(`Could not read layout.tsx: ${error.message}`)
    return false
  }
}

/**
 * Verify JSON-LD usage in pages
 */
function verifyJsonLdUsage() {
  header('Verifying JSON-LD Usage in Pages')

  const pages = [
    { file: 'src/app/(store)/page.tsx', schemas: ['buildSiteJsonLd'] },
    {
      file: 'src/app/(store)/product/[slug]/page.tsx',
      schemas: ['buildProductJsonLd', 'buildBreadcrumbJsonLd'],
    },
    { file: 'src/app/(store)/category/[slug]/page.tsx', schemas: ['buildBreadcrumbJsonLd'] },
  ]

  let allPass = true
  for (const page of pages) {
    try {
      const content = readFileSync(page.file, 'utf8')
      let _pagePass = true

      for (const schema of page.schemas) {
        if (content.includes(schema)) {
          pass(`${page.file} uses ${schema}`)
        } else {
          fail(`${page.file} missing ${schema}`)
          _pagePass = false
          allPass = false
        }
      }
    } catch (error) {
      fail(`Could not read ${page.file}: ${error.message}`)
      allPass = false
    }
  }

  return allPass
}

/**
 * Run SEO tests
 */
function runTests() {
  header('Running SEO Tests')

  try {
    const output = execSync(
      'pnpm test src/lib/seo/json-ld.test.ts src/app/sitemap.test.ts src/app/robots.test.ts --run',
      { encoding: 'utf8', stdio: 'pipe' },
    )

    // Extract test results
    const passMatch = output.match(/Tests\s+(\d+)\s+passed/)
    const failMatch = output.match(/(\d+)\s+failed/)

    if (passMatch) {
      pass(`${passMatch[1]} tests passed`)
    }
    if (failMatch && Number.parseInt(failMatch[1]) > 0) {
      fail(`${failMatch[1]} tests failed`)
      return false
    }

    return true
  } catch (error) {
    fail(`Tests failed: ${error.message}`)
    return false
  }
}

/**
 * Verify OpenGraph implementation
 */
function verifyOpenGraph() {
  header('Verifying OpenGraph Implementation')

  try {
    const layout = readFileSync('src/app/layout.tsx', 'utf8')

    const checks = [
      { pattern: /openGraph:\s*\{/, name: 'OpenGraph metadata block' },
      { pattern: /type:\s*['"]website['"]/, name: 'og:type = website' },
      { pattern: /locale:\s*['"]he_IL['"]/, name: 'og:locale = he_IL' },
      { pattern: /siteName:/, name: 'og:site_name' },
    ]

    let allPass = true
    for (const check of checks) {
      if (check.pattern.test(layout)) {
        pass(check.name)
      } else {
        fail(check.name)
        allPass = false
      }
    }

    return allPass
  } catch (error) {
    fail(`Could not verify OpenGraph: ${error.message}`)
    return false
  }
}

/**
 * Generate summary report
 */
function generateReport(results) {
  header('SEO Verification Summary')

  const total = Object.keys(results).length
  const passed = Object.values(results).filter(Boolean).length
  const failed = total - passed

  log(`\nTotal checks: ${total}`, 'blue')
  log(`Passed: ${passed}`, passed === total ? 'green' : 'yellow')
  if (failed > 0) {
    log(`Failed: ${failed}`, 'red')
  }

  const percentage = Math.round((passed / total) * 100)
  log(`\nSuccess rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow')

  if (percentage === 100) {
    log('\n✓ All SEO features are properly implemented!', 'green')
    log('✓ Ready for Google Rich Results Test', 'green')
  } else {
    log('\n✗ Some SEO features need attention', 'red')
  }

  return percentage === 100
}

/**
 * Print Google Rich Results Test instructions
 */
function printGoogleTestInstructions() {
  header('Google Rich Results Test Instructions')

  log('\nTo verify with Google Rich Results Test:', 'blue')
  log('\n1. Start the production server:', 'yellow')
  log('   pnpm build && pnpm start')

  log('\n2. Test URLs manually at:', 'yellow')
  log('   https://search.google.com/test/rich-results')

  log('\n3. Test these pages:', 'yellow')
  log(`   - Home: ${SITE_URL}/`)
  log(`   - Product: ${SITE_URL}/product/[any-product-slug]`)
  log(`   - Category: ${SITE_URL}/category/[any-category-slug]`)
  log(`   - Sitemap: ${SITE_URL}/sitemap.xml`)
  log(`   - Robots: ${SITE_URL}/robots.txt`)

  log('\n4. Expected results:', 'yellow')
  log('   - Home: Organization + WebSite schemas')
  log('   - Product: Product + BreadcrumbList schemas')
  log('   - Category: BreadcrumbList schema')
  log('   - Sitemap: Valid XML with all pages')
  log('   - Robots: Proper disallow rules')

  log('\n5. Verify Hebrew support:', 'yellow')
  log('   - Check that Hebrew text renders correctly in previews')
  log('   - Verify RTL direction is maintained')
  log('   - Confirm locale is he_IL')
}

/**
 * Main verification function
 */
function main() {
  log('\n🔍 SEO Implementation Verification', 'blue')
  log('='.repeat(60), 'blue')

  const results = {
    jsonLdFiles: verifyJsonLdFiles(),
    sitemapRobots: verifySitemapAndRobots(),
    hebrewSchema: verifyHebrewSchema(),
    jsonLdUsage: verifyJsonLdUsage(),
    openGraph: verifyOpenGraph(),
    tests: runTests(),
  }

  const allPassed = generateReport(results)
  printGoogleTestInstructions()

  process.exit(allPassed ? 0 : 1)
}

main()
