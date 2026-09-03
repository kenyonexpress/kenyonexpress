#!/usr/bin/env node
/**
 * Lighthouse CI for the product page and checkout.
 *
 * Floors: accessibility > 95 and SEO > 95.
 *
 * Checkout (and cart, if an empty cart redirects there) is listed in
 * robots.txt on purpose. Lighthouse then fails the `is-crawlable` audit and
 * the SEO category lands around 69. That is not an SEO bug. The gated SEO
 * score drops `is-crawlable` only when robots.txt Disallow matches the final
 * URL; every other SEO audit still has to pass. Product pages are allowed to
 * be crawled, so their SEO score includes `is-crawlable`.
 *
 * Sitemap loc entries currently use kenyonexpress.co.il, which still serves
 * WordPress until DNS cutover. Product URLs are rewritten onto LIGHTHOUSE_BASE
 * so this job measures the Next app, not WordPress.
 *
 * Usage (Terminal):
 *   LIGHTHOUSE_BASE=https://kenyonexpress.vercel.app node scripts/lighthouse-ci.mjs
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

export const A11Y_MIN = 96
export const SEO_MIN = 96

export function parseRobotsDisallow(robotsTxt) {
  const paths = []
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = line.match(/^\s*Disallow:\s*(\S+)/i)
    if (match) paths.push(match[1])
  }
  return paths
}

export function robotsDisallows(disallow, pathname) {
  return disallow.some((rule) => {
    if (rule === '/') return true
    if (!rule) return false
    return pathname === rule || pathname.startsWith(rule.endsWith('/') ? rule : `${rule}`)
  })
}

export function gatedCategoryScore(report, category, options = {}) {
  const dropAuditIds = options.dropAuditIds ?? []
  const cat = report.categories[category]
  if (!cat) return 0
  let weightSum = 0
  let scoreSum = 0
  for (const ref of cat.auditRefs ?? []) {
    if (dropAuditIds.includes(ref.id)) continue
    if (!ref.weight) continue
    const audit = report.audits[ref.id]
    const score = typeof audit?.score === 'number' ? audit.score : 0
    weightSum += ref.weight
    scoreSum += score * ref.weight
  }
  if (weightSum === 0) return Math.round((cat.score ?? 0) * 100)
  return Math.round((scoreSum / weightSum) * 100)
}

export function rewriteToMeasuredOrigin(href, base) {
  const origin = new URL(base).origin
  const page = new URL(href, `${origin}/`)
  return new URL(`${page.pathname}${page.search}${page.hash}`, `${origin}/`).href
}

export async function firstProductUrl(base) {
  const headers = bypassHeaders()
  const sitemapRes = await fetch(`${base.replace(/\/$/, '')}/sitemap.xml`, { headers })
  if (sitemapRes.ok) {
    const xml = await sitemapRes.text()
    const match = xml.match(/https?:\/\/[^<\s]+\/product\/[^<\s]+/)
    if (match) {
      return rewriteToMeasuredOrigin(match[0].replace(/&amp;/g, '&'), base)
    }
  }
  const productsRes = await fetch(`${base.replace(/\/$/, '')}/products`, { headers })
  if (productsRes.ok) {
    const html = await productsRes.text()
    const href = html.match(/href="(\/product\/[^"]+)"/)
    if (href) return rewriteToMeasuredOrigin(href[1], base)
  }
  return null
}

export function failedBinaryAudits(report, category) {
  const cat = report.categories[category]
  if (!cat) return []
  const failed = []
  for (const ref of cat.auditRefs ?? []) {
    const audit = report.audits[ref.id]
    if (!audit) continue
    if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'informative') {
      continue
    }
    if (typeof audit.score === 'number' && audit.score < 1) {
      failed.push(ref.id)
    }
  }
  return failed
}

function bypassHeaders() {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!secret) return undefined
  return { 'x-vercel-protection-bypass': secret }
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  try {
    return chromium.executablePath()
  } catch {
    return null
  }
}

function runLighthouse(url, outPath, chrome) {
  const args = [
    'exec',
    'lighthouse',
    url,
    '--only-categories=accessibility,seo',
    '--chrome-flags=--headless --no-sandbox --disable-gpu',
    '--output=json',
    `--output-path=${outPath}`,
    '--quiet',
  ]
  const headers = bypassHeaders()
  if (headers) args.push(`--extra-headers=${JSON.stringify(headers)}`)
  if (chrome) args.push(`--chrome-path=${chrome}`)
  const result = spawnSync('pnpm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result
}

async function loadRobots(base) {
  const res = await fetch(`${base.replace(/\/$/, '')}/robots.txt`, { headers: bypassHeaders() })
  if (!res.ok) return []
  return parseRobotsDisallow(await res.text())
}

export function scorePage(report, { disallowed }) {
  const drop = disallowed ? ['is-crawlable'] : []
  return {
    accessibility: gatedCategoryScore(report, 'accessibility'),
    seo: gatedCategoryScore(report, 'seo', { dropAuditIds: drop }),
    seoRaw: gatedCategoryScore(report, 'seo'),
    crawlableDropped: drop.length > 0,
    finalUrl: report.finalUrl || report.requestedUrl,
  }
}

async function main() {
  const base = (process.env.LIGHTHOUSE_BASE || process.env.LOCAL_BASE || '').replace(/\/$/, '')
  if (!base) {
    console.error('lighthouse-ci: set LIGHTHOUSE_BASE (or LOCAL_BASE) to the origin to measure')
    process.exit(2)
  }

  const chrome = chromePath()
  const productRaw = process.env.LIGHTHOUSE_PRODUCT_URL || (await firstProductUrl(base))
  const product = productRaw ? rewriteToMeasuredOrigin(productRaw, base) : null
  const checkout = `${base}/checkout`
  if (!product) {
    console.error('lighthouse-ci: no /product/ URL in sitemap or /products')
    process.exit(1)
  }

  const disallow = await loadRobots(base)
  const tmp = mkdtempSync(join(tmpdir(), 'lh-ci-'))
  const pages = [
    { name: 'product', url: product },
    { name: 'checkout', url: checkout },
  ]
  const failures = []

  try {
    for (const page of pages) {
      const outPath = join(tmp, `${page.name}.json`)
      const result = runLighthouse(page.url, outPath, chrome)
      if (result.status !== 0) {
        console.error(result.stderr || result.stdout || 'lighthouse failed')
        failures.push(`${page.name}: lighthouse exited ${result.status}`)
        continue
      }
      const report = JSON.parse(readFileSync(outPath, 'utf8'))
      const finalPath = new URL(report.finalRequestedUrl || report.finalUrl || page.url).pathname
      const disallowed = robotsDisallows(disallow, finalPath)
      const scores = scorePage(report, { disallowed })
      console.log(`=== lighthouse ${page.name} ${scores.finalUrl} ===`)
      console.log({
        accessibility: scores.accessibility,
        seo: scores.seo,
        seoRaw: scores.seoRaw,
        crawlableDropped: scores.crawlableDropped,
      })
      if (scores.accessibility < A11Y_MIN) {
        const failed = failedBinaryAudits(report, 'accessibility')
        console.error(`failed a11y audits (${page.name}): ${failed.join(', ') || '(none listed)'}`)
        failures.push(`${page.name}: a11y ${scores.accessibility} < ${A11Y_MIN}`)
      }
      if (scores.seo < SEO_MIN) {
        failures.push(`${page.name}: seo ${scores.seo} < ${SEO_MIN}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  if (failures.length) {
    for (const f of failures) console.error(f)
    process.exit(1)
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)

if (isMain) main()
