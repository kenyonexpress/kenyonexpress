#!/usr/bin/env node
// S31. Ask a running server what it does with the retired WordPress URLs.
//
// The unit test proves the list is well formed. This proves a request gets
// the answer: the old URL returns 301, the Location is the mapped path, and
// that path is live -- 200, or for `/account/**` the 307 to /login?next= that
// an anonymous request to a signed-in route gets.
//
//   node scripts/test-wp-redirects.mjs --base http://localhost:3000
//   node scripts/test-wp-redirects.mjs --base ... --n 20 --seed 31
//   node scripts/test-wp-redirects.mjs --base ... --all          # every URL form
//   node scripts/test-wp-redirects.mjs --base ... --no-target    # skip the 200 check
//
// THE POOL
//
// Every moved URL in data/legacy/wp-slug-map.json, in each form a client
// sends it: as WordPress wrote it (lower-case percent-encoding, the form in
// Google's index) and as a browser encodes typed Hebrew (upper-case). An ASCII
// path has one form. `--n` draws that many at random from the pool, seeded so
// a run can be repeated.
//
// TRAILING SLASHES are a separate matrix under `--all`, not part of the draw.
// WordPress served `/shop/`; Next answers 308 to `/shop` before any redirect
// rule is consulted, and only then the 301. Two hops, both permanent, same
// final page -- but the first response is not a 301, so it is reported as its
// own line instead of being folded into a claim it does not satisfy.
//
// `--no-target` exists for production under MAINTENANCE_MODE, where the
// redirect is answered (config redirects run ahead of the proxy) and every
// destination is a deliberate 503.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const BASE = option('base', 'http://localhost:3000').replace(/\/$/, '')
const N = Number.parseInt(option('n', '20'), 10)
const SEED = Number.parseInt(option('seed', '31'), 10)
const ALL = flag('all')
const CHECK_TARGET = !flag('no-target')

const slugMap = JSON.parse(readFileSync(join(ROOT, 'data/legacy/wp-slug-map.json'), 'utf8'))
const moved = slugMap.entries.filter((e) => e.disposition === 'redirect_301')

const upper = (path) => encodeURI(path)
const lower = (path) => encodeURI(path).replace(/%[0-9A-F]{2}/g, (h) => h.toLowerCase())

const pool = []
for (const e of moved) {
  const forms = new Map([
    [lower(e.old_path), 'wp'],
    [upper(e.old_path), 'browser'],
  ])
  // The crawl's own string must be one of them, or the pool is testing
  // something the old site never served.
  if (!forms.has(e.old_path_as_crawled)) {
    throw new Error(`crawled form not reproduced: ${e.old_path_as_crawled}`)
  }
  for (const [url, form] of forms) {
    pool.push({ url, form: forms.size === 1 ? 'ascii' : form, expect: e.new_path, type: e.type })
  }
}

// mulberry32: small, seeded, good enough to pick 20 of 30.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample(items, n, seed) {
  const random = rng(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

const head = (url) => fetch(url, { method: 'GET', redirect: 'manual' })

/** The path a Location header points at, decoded, whatever host it names. */
const locationPath = (res, from) => {
  const location = res.headers.get('location')
  if (!location) return null
  const url = new URL(location, from)
  return { path: decodeURI(url.pathname), search: url.search, raw: location }
}

async function probe(item) {
  const first = await head(BASE + item.url)
  const loc = locationPath(first, BASE + item.url)
  const out = {
    url: item.url,
    form: item.form,
    status: first.status,
    location: loc?.raw ?? null,
    expect: item.expect,
    target: null,
    ok: false,
  }
  if (first.status !== 301 || !loc || loc.path !== item.expect) return out
  if (!CHECK_TARGET) {
    out.ok = true
    return out
  }
  const target = await head(BASE + encodeURI(item.expect))
  out.target = target.status
  out.ok = target.status === 200
  // `/account/**` is a live route that an anonymous request cannot see: the
  // proxy answers 307 to /login?next=<the route>. That is the route working,
  // not the redirect failing, so it passes -- but only on that exact shape, and
  // it is printed as what it is. A 307 to anywhere else still fails.
  if (target.status === 307) {
    const login = new URL(target.headers.get('location') ?? '', BASE)
    if (login.pathname === '/login' && login.searchParams.get('next') === item.expect) {
      out.target = '307 login-gated'
      out.ok = true
    }
  }
  return out
}

/** `/shop/`: one 308 to drop the slash, then the 301. */
async function probeSlash(item) {
  const first = await head(`${BASE + item.url}/`)
  const loc = locationPath(first, BASE)
  const out = { url: `${item.url}/`, hop1: first.status, hop2: null, location: null, ok: false }
  if (first.status !== 308 || !loc) return out
  const second = await head(BASE + encodeURI(loc.path))
  const loc2 = locationPath(second, BASE)
  out.hop2 = second.status
  out.location = loc2?.raw ?? null
  out.ok = second.status === 301 && loc2?.path === item.expect
  return out
}

const picked = ALL ? pool : sample(pool, Math.min(N, pool.length), SEED)

const scope = ALL ? 'testing all' : `testing ${picked.length} at random, seed ${SEED}`
const caveat = CHECK_TARGET ? '' : ' (destination status not checked)'
console.log(`base ${BASE}`)
console.log(`pool ${pool.length} URL forms of ${moved.length} moved permalinks; ${scope}${caveat}`)
console.log('')

let failed = 0
for (const item of picked) {
  const r = await probe(item)
  if (!r.ok) failed++
  const verdict = r.ok ? 'PASS' : 'FAIL'
  const location = r.location ? decodeURI(r.location) : '(no Location)'
  const target = CHECK_TARGET ? ` -> ${r.target ?? '-'}` : ''
  const wanted = r.ok ? '' : `   expected 301 -> ${r.expect}${CHECK_TARGET ? ' -> 200' : ''}`
  console.log(
    `${verdict} ${r.status} ${decodeURI(r.url)} [${r.form}] -> ${location}${target}${wanted}`,
  )
}
console.log('')
console.log(
  `${picked.length - failed}/${picked.length} return 301 to ${CHECK_TARGET ? 'a live route' : 'the mapped path'}`,
)

if (ALL) {
  console.log('')
  console.log('trailing-slash forms (308 to drop the slash, then 301):')
  let slashFailed = 0
  for (const item of pool) {
    const r = await probeSlash(item)
    if (!r.ok) slashFailed++
    const location = r.location ? decodeURI(r.location) : '(no Location)'
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'} ${r.hop1} -> ${r.hop2 ?? '-'} ${decodeURI(r.url)} -> ${location}`,
    )
  }
  console.log('')
  console.log(
    `${pool.length - slashFailed}/${pool.length} trailing-slash forms resolve in two hops`,
  )
  failed += slashFailed
}

process.exit(failed ? 1 : 0)
