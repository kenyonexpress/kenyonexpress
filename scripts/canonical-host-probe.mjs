#!/usr/bin/env node
/**
 * Does the URL this site tells search engines to index actually answer 200?
 *
 * WHY THIS EXISTS. Measured 2026-09-09 against the live custom domain:
 *
 *   https://kenyonexpress.co.il/        308 -> https://www.kenyonexpress.co.il/
 *   <link rel="canonical" href="https://kenyonexpress.co.il"/>
 *   <meta property="og:url" content="https://kenyonexpress.co.il"/>
 *   every <loc> in /sitemap.xml         https://kenyonexpress.co.il/...
 *
 * So the site publishes the apex as canonical in three places, and the apex is
 * a redirect to `www`. Vercel serves `www` and redirects the apex; the code
 * defaults the other way (`NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'`,
 * `src/app/layout.tsx`). Nothing in the repository could see the disagreement,
 * because one side of it is a Vercel domain setting and the other is a default
 * in a source file, and neither knows the other exists.
 *
 * WHY NO EXISTING GATE CATCHES IT. `production-smoke.yml` probes the BASE it is
 * given -- today `https://kenyonexpress.vercel.app` -- and gets 200. It never
 * requests the host the page nominates. `deployed-cron-probe.mjs` asks the
 * deployment about routes, not about hostnames. Every SEO test in `src/` renders
 * metadata and compares it to a constant in the same repository.
 *
 * WHAT A REDIRECTING CANONICAL COSTS. Google resolves a 3xx canonical rather
 * than dropping the page, so this is not a de-indexing event and is not
 * reported as one here. What it does cost is real and quieter: every crawl of
 * every URL pays an extra round trip, `og:url` hands social scrapers a
 * redirect, and the day the redirect direction is changed at Vercel without
 * anyone touching this repository, the canonical becomes a 404 and the same
 * three gates stay green.
 *
 * WHAT THE STATUS CODES MEAN. Redirects are deliberately NOT followed:
 *
 *   200  the canonical is served directly        the healthy answer
 *   3xx  the canonical is itself a redirect      the finding this is for
 *   404  the canonical is not served at all      worse, same class
 *   000  no response at all                      host down or unreachable
 *
 * A 3xx is a failure and not a warning on purpose. "It still resolves" is the
 * reasoning that lets a canonical point at a host nobody is checking.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = join(HERE, 'cron-jobs.json')
const TIMEOUT_MS = 20_000

/**
 * Classification, kept pure so `canonical-host-probe.test.ts` can drive every
 * branch without a network.
 */
export function classify(status) {
  if (status === 200) return { ok: true, verdict: 'served-directly' }
  if (status >= 300 && status < 400) return { ok: false, verdict: 'canonical-is-a-redirect' }
  if (status === 404) return { ok: false, verdict: 'canonical-not-served' }
  if (status === 0) return { ok: false, verdict: 'no-response' }
  return { ok: false, verdict: `unexpected-${status}` }
}

/** Exit code for a whole run, so the shape is testable without the network. */
export function summarize(results) {
  const failed = results.filter((r) => !r.ok)
  return { failed, exitCode: failed.length === 0 ? 0 : 1 }
}

/**
 * Pulls every URL the page nominates as its own address.
 *
 * Three separate declarations rather than one, because they are emitted by
 * three different code paths (`metadata.alternates`, `metadata.openGraph`, and
 * `sitemap.ts`) and have drifted apart before. Deduplicated, so the common case
 * of all three agreeing costs one request.
 */
export function declaredUrls({ html = '', sitemapXml = '' } = {}) {
  const found = []

  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
  if (canonical) found.push({ source: 'link rel=canonical', url: canonical[1] })

  const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i)
  if (ogUrl) found.push({ source: 'og:url', url: ogUrl[1] })

  const firstLoc = sitemapXml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)
  if (firstLoc) found.push({ source: 'sitemap.xml first <loc>', url: firstLoc[1] })

  const seen = new Set()
  return found.filter(({ url }) => {
    const key = url.replace(/\/+$/, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function baseUrl() {
  const configured = process.env.PRODUCTION_URL || process.env.CRON_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  return registry.defaultBaseUrl.replace(/\/+$/, '')
}

async function get(url, { redirect = 'follow' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'GET', redirect, signal: controller.signal })
    const body = redirect === 'follow' ? await response.text() : ''
    return { status: response.status, location: response.headers.get('location') ?? '', body }
  } catch {
    return { status: 0, location: '', body: '' }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const base = baseUrl()
  console.log(`reading the declared canonical from ${base}`)

  // Following redirects here is right: this fetch is only how the declarations
  // are READ, and reading them from wherever the base lands is what a crawler
  // does. The declarations themselves are then probed without following.
  const home = await get(`${base}/`)
  const sitemap = await get(`${base}/sitemap.xml`)

  const declared = declaredUrls({ html: home.body, sitemapXml: sitemap.body })
  if (declared.length === 0) {
    console.log(
      `\nno canonical, og:url or sitemap <loc> found on ${base}. The page declares no address of its own, which is its own finding.`,
    )
    return 1
  }

  const results = []
  for (const { source, url } of declared) {
    const { status, location } = await get(url, { redirect: 'manual' })
    const { ok, verdict } = classify(status)
    results.push({ source, url, status, location, ok, verdict })
    const arrow = location ? ` -> ${location}` : ''
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${source.padEnd(24)} ${status} ${verdict}${arrow}`)
    console.log(`       ${url}`)
  }

  const { failed, exitCode } = summarize(results)
  if (exitCode === 0) {
    console.log(`\nall ${results.length} declared canonical URLs are served directly`)
    return 0
  }

  console.log(`\n${failed.length} of ${results.length} declared canonical URLs do not answer 200:`)
  for (const f of failed) {
    console.log(`  ${f.source}: ${f.url} -> ${f.status}${f.location ? ` (${f.location})` : ''}`)
  }
  console.log(
    '\nThe host that serves and the host the page nominates are set in two places that do not know about each other: the Vercel domain configuration, and NEXT_PUBLIC_APP_URL (defaulted in src/app/layout.tsx). Change one of the two so they name the same host.',
  )
  return exitCode
}

// Only run when invoked directly, so the test can import the pure halves.
if (process.argv[1]?.endsWith('canonical-host-probe.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
