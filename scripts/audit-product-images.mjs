#!/usr/bin/env node
/**
 * AUDITS EVERY IMAGE URL THE CATALOGUE POINTS AT.
 *
 * WHY. On 2026-09-08 thirty-six product image URLs in production still pointed
 * at `https://kenyonexpress.co.il/wp-content/uploads/...`. That domain no
 * longer serves WordPress — the DNS was cut over to Vercel and it now serves
 * THIS app, which answers those paths with 403. Every one of those thirty-six
 * was a broken image on a live product page, and nothing in the repo noticed,
 * because a dead absolute URL is indistinguishable from a live one to
 * type-check, lint and the test suite.
 *
 * This is the thing that notices. It reads `products.images` (plus the other
 * four image-bearing columns) straight from the database and sorts every URL
 * into one of three verdicts:
 *
 *   relative  -> must exist under `public/`. Checked on disk, and decoded with
 *                sharp, because `/_next/image` serves an undecodable file
 *                byte-for-byte with a 200 and no log entry.
 *   absolute  -> must be on the remote-image allowlist AND answer 2xx.
 *   dead      -> anything else. Exit 1.
 *
 * `--offline` skips the network probe and checks only the relative half, which
 * is the part that can be settled from the repo alone.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/audit-product-images.mjs [--offline] [--json]
 *
 * Exit: 0 every reference resolves, 1 at least one does not, 2 could not run.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const flag = (n) => process.argv.includes(`--${n}`)
const OFFLINE = flag('offline')
const JSON_OUT = flag('json')

const PUBLIC_DIR = resolve('public')

/** Columns that hold a single URL, as `table.column`. */
const SINGLE_URL_COLUMNS = [
  ['categories', 'image_url'],
  ['banners', 'image_url'],
  ['coupon_deals', 'image_url'],
  ['product_variants', 'image_url'],
]

const fail = (msg) => {
  console.error(`audit-product-images: ${msg}`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')

/**
 * PostgREST rather than a pg client: this script has to run in CI, where the
 * only database credential that exists is the REST one.
 */
const rest = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) fail(`${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Allowlisted remote hosts, read from the single place `next.config.ts` reads.
 *
 * Parsed out of the TypeScript source rather than imported, because node cannot
 * import a `.ts` module here and a failed dynamic import would leave this
 * script with an EMPTY allowlist that silently passes every host. An allowlist
 * check that cannot load its allowlist must be an error, not a pass.
 */
const allowedHosts = () => {
  const src = readFileSync(resolve('src/lib/images/remote-hosts.ts'), 'utf8')
  const block = src.match(/REMOTE_IMAGE_PATTERNS[^=]*=\s*\[([\s\S]*?)\n\] as const/)
  if (!block) fail('could not parse REMOTE_IMAGE_PATTERNS out of src/lib/images/remote-hosts.ts')
  const hosts = [...block[1].matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1])
  if (hosts.length === 0) fail('REMOTE_IMAGE_PATTERNS parsed as empty')
  return hosts
}

/**
 * next's rule, not a glob: `*` matches EXACTLY ONE label. A deliberate
 * duplicate of `hostnameMatches` in remote-hosts.ts, which this script cannot
 * import (TypeScript). Getting it wrong in the permissive direction would let
 * this audit pass a URL that `next/image` then throws on, so the copy is kept
 * literal rather than paraphrased.
 */
const hostMatches = (hostname, pattern) => {
  if (!pattern.includes('*')) return hostname === pattern
  const rest = pattern.split('*.', 2)[1]
  if (!rest || !hostname.endsWith(`.${rest}`)) return false
  const label = hostname.slice(0, hostname.length - rest.length - 1)
  return label.length > 0 && !label.includes('.')
}

const collect = async () => {
  const refs = []
  const products = await rest('products?select=id,slug,images')
  for (const p of products) {
    if (!Array.isArray(p.images)) continue
    p.images.forEach((u, i) => refs.push({ source: `products.${p.slug}[${i}]`, url: u }))
  }
  for (const [table, column] of SINGLE_URL_COLUMNS) {
    const rows = await rest(`${table}?select=id,${column}`)
    for (const r of rows) {
      if (r[column]) refs.push({ source: `${table}.${r.id}`, url: r[column] })
    }
  }
  return refs
}

/**
 * A file that exists but cannot be decoded is worse than a missing one: the
 * image optimizer passes it through with a 200 and the page shows nothing.
 */
const decodes = async (diskPath) => {
  try {
    const { default: sharp } = await import('sharp')
    const md = await sharp(diskPath).metadata()
    return Boolean(md.width && md.height)
  } catch {
    return false
  }
}

const main = async () => {
  const hosts = allowedHosts()
  const refs = await collect()
  const problems = []
  const seenRelative = new Map()

  for (const ref of refs) {
    const u = ref.url
    if (!u.startsWith('http')) {
      const diskPath = resolve(PUBLIC_DIR, decodeURIComponent(u).replace(/^\//, ''))
      if (!existsSync(diskPath)) {
        problems.push({ ...ref, verdict: 'missing on disk' })
        continue
      }
      if (!seenRelative.has(diskPath)) seenRelative.set(diskPath, await decodes(diskPath))
      if (!seenRelative.get(diskPath)) {
        problems.push({ ...ref, verdict: 'on disk but does not decode' })
      }
      continue
    }

    let host
    try {
      host = new URL(u).hostname
    } catch {
      problems.push({ ...ref, verdict: 'not a URL' })
      continue
    }

    if (!hosts.some((p) => hostMatches(host, p))) {
      problems.push({ ...ref, verdict: `host not on the next/image allowlist: ${host}` })
      continue
    }

    if (OFFLINE) continue
    try {
      const res = await fetch(u, { method: 'GET', headers: { range: 'bytes=0-0' } })
      if (!res.ok && res.status !== 206) {
        problems.push({ ...ref, verdict: `remote answered ${res.status}` })
      }
    } catch (e) {
      problems.push({ ...ref, verdict: `unreachable: ${e.message}` })
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ checked: refs.length, problems }, null, 2))
  } else {
    console.log(
      `audit-product-images: ${refs.length} references checked${OFFLINE ? ' (offline: relative half only)' : ''}`,
    )
    if (problems.length === 0) console.log('  all resolve')
    for (const p of problems) console.error(`  ${p.verdict.padEnd(40)} ${p.source}  ${p.url}`)
  }
  process.exit(problems.length === 0 ? 0 : 1)
}

main().catch((e) => fail(e.stack ?? String(e)))
