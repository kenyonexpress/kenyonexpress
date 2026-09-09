#!/usr/bin/env node
/**
 * First-load JavaScript per route, measured off a running production server.
 *
 * WHY NOT `next build`'s TABLE. Next 16 with Turbopack no longer prints a
 * "First Load JS" column, and it writes no `app-build-manifest.json` to derive
 * one from - `.next/build-manifest.json` carries `pages`, `rootMainFiles` and
 * chunk-group bootstrap params, and none of them maps an APP route to its
 * chunks. Measured on this build: the route table has 118 rows and not one byte
 * count.
 *
 * WHAT THIS DOES INSTEAD is closer to the thing that matters anyway. It fetches
 * the route, reads every `<script src="/_next/...">` the HTML actually
 * references, and adds up their sizes on disk - raw and gzipped. That is what a
 * browser downloads before the page is interactive, rather than what a bundler
 * believes it grouped.
 *
 * IT NEEDS A BUILT SERVER, not `next dev`, which serves unminified modules and
 * would report numbers several times too large:
 *
 *   pnpm build && PORT=3311 pnpm start &
 *   LOCAL_BASE=http://localhost:3311 node scripts/bundle-report.mjs
 *
 * `localhost` and not `127.0.0.1`: this project's server actions refuse the
 * numeric form, and a probe that browses the wrong one measures a page whose
 * interactions are silently broken.
 *
 * Exit: 0 always. This reports; it does not gate. A byte budget that fails a
 * build wants a number somebody chose, and choosing one is what the report is
 * for.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASE = (process.env.LOCAL_BASE ?? 'http://localhost:3311').replace(/\/+$/, '')
const NEXT_DIR = resolve(process.cwd(), '.next')

/**
 * The routes worth a number, and why each is here.
 *
 * The five a customer actually walks through, plus the two heaviest admin
 * screens - which do not have to be small, but which should not be a surprise.
 * A list rather than every route: 118 rows is a table nobody reads, and the
 * ones that matter are the ones on the path to a purchase.
 */
const ROUTES = [
  ['/', 'home'],
  ['/products', 'catalogue'],
  ['/category/hot-deals', 'category'],
  ['/cart', 'cart'],
  ['/checkout', 'checkout'],
  ['/account', 'account'],
  ['/faq', 'content page'],
  ['/admin/products', 'admin catalogue'],
]

const sizeCache = new Map()

/** A referenced chunk's bytes on disk, raw and gzipped. */
function chunkSize(src) {
  if (sizeCache.has(src)) return sizeCache.get(src)
  const rel = src.replace(/^\/_next\//, '').split('?')[0]
  const path = join(NEXT_DIR, rel)
  const result = existsSync(path)
    ? (() => {
        const bytes = readFileSync(path)
        return { raw: bytes.length, gzip: gzipSync(bytes).length }
      })()
    : { raw: 0, gzip: 0 }
  sizeCache.set(src, result)
  return result
}

async function measure(path) {
  // `manual`, NOT `follow`. Following a redirect measures the page it lands on
  // and reports it under the name of the one that was asked for: `/account` and
  // `/admin/products` both 307 to `/login`, and with `follow` they came back
  // identical at 290.2 kB - which is the login page's number twice, wearing two
  // other routes' labels.
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    return {
      status: response.status,
      redirect: response.headers.get('location') ?? '?',
      chunks: 0,
      missing: 0,
      raw: 0,
      gzip: 0,
      html: 0,
    }
  }
  const html = await response.text()

  const scripts = [...html.matchAll(/<script[^>]+src="(\/_next\/[^"]+)"/g)].map((m) => m[1])
  const unique = [...new Set(scripts)]

  let raw = 0
  let gzip = 0
  let missing = 0
  for (const src of unique) {
    const size = chunkSize(src)
    if (size.raw === 0) missing += 1
    raw += size.raw
    gzip += size.gzip
  }

  return {
    status: response.status,
    redirect: null,
    chunks: unique.length,
    missing,
    raw,
    gzip,
    html: html.length,
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

async function main() {
  console.log(`first-load JS per route, from ${BASE}\n`)
  console.log('  route                status  chunks       raw      gzip      html')
  console.log('  -------------------  ------  ------  --------  --------  --------')

  const rows = []
  for (const [path, label] of ROUTES) {
    try {
      const result = await measure(path)
      rows.push([path, label, result])
      if (result.redirect) {
        console.log(
          `  ${path.padEnd(19)}  ${String(result.status).padEnd(6)}  redirects to ${result.redirect} — not measured`,
        )
        continue
      }
      const flag = result.missing > 0 ? ` (${result.missing} chunks not on disk)` : ''
      console.log(
        `  ${path.padEnd(19)}  ${String(result.status).padEnd(6)}  ${String(result.chunks).padStart(6)}  ${kb(result.raw).padStart(8)}  ${kb(result.gzip).padStart(8)}  ${kb(result.html).padStart(8)}${flag}`,
      )
    } catch (error) {
      console.log(`  ${path.padEnd(17)}  FAILED  ${error.message}`)
    }
  }

  const measured = rows.filter(([, , r]) => r.status === 200)
  if (measured.length > 0) {
    const worst = measured.reduce((a, b) => (a[2].gzip >= b[2].gzip ? a : b))
    console.log(`\n  heaviest: ${worst[0]} (${worst[1]}) at ${kb(worst[2].gzip)} gzipped`)
  }
  const shared = [...sizeCache.values()].reduce((sum, s) => sum + s.gzip, 0)
  console.log(`  ${sizeCache.size} distinct chunks referenced, ${kb(shared)} gzipped in total`)

  // The largest offenders, which is what [62] asks to find. Named by file so
  // the next step - split it, or lazy-load whatever pulls it in - has something
  // to grep for.
  const biggest = [...sizeCache.entries()].sort((a, b) => b[1].gzip - a[1].gzip).slice(0, 10)
  console.log('\n  largest chunks, gzipped:')
  for (const [src, size] of biggest) {
    console.log(`    ${kb(size.gzip).padStart(8)}  ${src}`)
  }
}

main()
