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

/**
 * ADMIN KEY PREFERRED, ANON ACCEPTED, COVERAGE REPORTED EITHER WAY.
 *
 * This demanded a service key and refused to start without one. Measured
 * 2026-09-08: the only admin key in this checkout answers `401 Invalid API
 * key`, and rotating it is a MANUAL item nobody has done - so the one tool
 * written to notice a broken product image could not be run by anybody here.
 *
 * Most of what it reads is public. `products.images` is anon-readable; it is
 * the catalogue every visitor loads. Refusing to check ANYTHING because it
 * cannot check EVERYTHING is the wrong trade for an audit whose whole subject
 * is "nothing noticed".
 *
 * So anon is accepted, and the cost is stated rather than hidden: a table anon
 * cannot read is reported as UNCHECKED and the run exits non-zero. It never
 * reports clean for a column it could not see - the same rule
 * `audit-role-separation.mjs` states for the same reason.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const key = adminKey || anonKey
const usingAnon = !adminKey && Boolean(anonKey)
if (!url || !key) {
  fail('NEXT_PUBLIC_SUPABASE_URL and one of SUPABASE_SECRET_KEY / SUPABASE_ANON_KEY are required')
}
if (usingAnon) {
  console.warn('audit-product-images: no admin key; running with the ANON key.')
  console.warn('  Tables anon cannot read are reported UNCHECKED, never clean.\n')
}

/** Tables this run could not read, so the summary can refuse to claim them. */
const unchecked = []

/**
 * PostgREST rather than a pg client: this script has to run in CI, where the
 * only database credential that exists is the REST one.
 */
const rest = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    // 401/403 under the anon key means RLS hid the table, which is a coverage
    // gap and not a fault. Anything else, or any failure with an admin key, is
    // still fatal: a broken audit must not look like a passing one.
    if (usingAnon && (res.status === 401 || res.status === 403)) {
      unchecked.push(`${path.split('?')[0]} (${res.status} as anon)`)
      return []
    }
    fail(`${path} -> ${res.status} ${await res.text()}`)
  }
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
    if (problems.length === 0 && unchecked.length === 0) console.log('  all resolve')
    else if (problems.length === 0) console.log('  everything READ resolves')
    for (const p of problems) console.error(`  ${p.verdict.padEnd(40)} ${p.source}  ${p.url}`)
    if (unchecked.length) {
      console.error(`\n  UNCHECKED (${unchecked.length}) - anon could not read these:`)
      for (const t of unchecked) console.error(`    ${t}`)
      console.error('  This run did NOT clear them. Rerun with an admin key.')
    }
  }
  // Non-zero when anything is broken OR when anything went unread. A partial
  // audit that exits 0 is the shape this script exists to catch.
  process.exit(problems.length === 0 && unchecked.length === 0 ? 0 : 1)
}

main().catch((e) => fail(e.stack ?? String(e)))
