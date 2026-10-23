#!/usr/bin/env node
/**
 * Mobile + Desktop Lighthouse sweep for C33
 * Tests all public routes on both devices
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:3455'

// Public routes only (exclude 404 product pages and blocked routes)
const ROUTES = [
  ['home', '/'],
  ['catalogue', '/products'],
  ['category', '/category/hot-deals'],
  ['coupons', '/coupons'],
  ['search', '/search?q=%D7%9E%D7%95%D7%A6%D7%A8'],
  ['login', '/login'],
  ['signup', '/signup'],
  ['suppliers', '/suppliers'],
  ['contact', '/contact'],
  ['terms', '/terms'],
  ['privacy', '/privacy'],
  ['returns', '/returns'],
  ['accessibility', '/accessibility'],
]

const results = { mobile: [], desktop: [] }

for (const device of ['mobile', 'desktop']) {
  const formFactor = device === 'mobile' ? 'mobile' : 'desktop'
  console.log(`\n=== Testing ${device.toUpperCase()} ===\n`)

  for (const [name, path] of ROUTES) {
    const url = BASE + path
    const outDir = mkdtempSync(join(tmpdir(), `lh-${device}-`))
    const out = join(outDir, `${name}.json`)

    const args = [
      'exec',
      'lighthouse',
      url,
      '--only-categories=performance,accessibility,best-practices,seo',
      `--emulated-form-factor=${formFactor}`,
      '--throttling-method=simulate',
      '--chrome-flags=--headless=new --no-sandbox',
      '--output=json',
      `--output-path=${out}`,
      '--quiet',
    ]

    const res = spawnSync('pnpm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

    if (res.status !== 0) {
      console.log(`ERR  ${name}`)
      results[device].push({ name, path, error: true })
      continue
    }

    const r = JSON.parse(readFileSync(out, 'utf8'))
    const score = (cat) =>
      r.categories[cat]?.score == null ? null : Math.round(r.categories[cat].score * 100)

    const row = {
      name,
      path,
      perf: score('performance'),
      a11y: score('accessibility'),
      bp: score('best-practices'),
      seo: score('seo'),
    }

    results[device].push(row)
    console.log(
      `${String(row.perf).padStart(3)} ${String(row.a11y).padStart(3)} ${String(row.bp).padStart(3)} ${String(row.seo).padStart(3)}  ${name}`,
    )
  }
}

writeFileSync('refs/lighthouse-mobile-desktop.json', JSON.stringify(results, null, 2))
console.log('\n✓ Results written to refs/lighthouse-mobile-desktop.json')

// Check if targets are met
const mobilePass = results.mobile.every(
  (r) => !r.error && r.perf > 90 && r.a11y > 95 && r.bp > 95 && r.seo > 95,
)
const desktopPass = results.desktop.every(
  (r) => !r.error && r.perf > 90 && r.a11y > 95 && r.bp > 95 && r.seo > 95,
)

console.log(`\nMobile all > thresholds: ${mobilePass ? '✅' : '❌'}`)
console.log(`Desktop all > thresholds: ${desktopPass ? '✅' : '❌'}`)

process.exit(mobilePass && desktopPass ? 0 : 1)
