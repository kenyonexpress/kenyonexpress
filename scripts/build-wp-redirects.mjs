#!/usr/bin/env node
// S31. WordPress permalinks -> slug map -> the 301 list next.config.ts serves.
//
// WHAT THIS ADDS TO scripts/build-legacy-redirects.mjs
//
// That script already answers the hard question -- for every URL the retired
// site served, is the source dead and the target live, measured against
// production -- and writes the answer to data/legacy/redirect-map.json. It
// feeds `public.seo_redirects`, which src/proxy.ts looks up per request.
//
// Two things were still missing:
//
//   1. A SLUG MAP. redirect-map.json is keyed by path and only lists the rows
//      that became redirects. Nothing said, per WordPress entity, "wp id 273,
//      slug `תינוקות-וילדים`, now lives at `/category/baby-kids`", and nothing
//      proved that every permalink in the crawl is accounted for.
//   2. REDIRECTS THAT DO NOT NEED THE DATABASE. The proxy lookup sits BEHIND
//      the maintenance gate and behind a Supabase read. `redirects()` in
//      next.config.ts is answered by the router before the proxy runs, so a
//      retired URL gets its 301 with no query, during maintenance, and when
//      Supabase is down.
//
// This script decides NOTHING about liveness. It joins the crawl's permalinks
// (products, categories, pages) onto the dispositions redirect-map.json already
// measured, and fails if a permalink has no disposition. Liveness has exactly
// one author; a second one here is how the two would come to disagree.
//
// POSTS: the WXR export holds 0 items of post_type `post` (28 pages, 48
// products, no blog posts), so there is no post permalink to map. The count is
// recorded in the artefact rather than left for someone to wonder about.
//
// 410s ARE NOT EMITTED. `redirects()` can only redirect; "gone" stays with the
// proxy and the table.
//
// USAGE
//
//   node scripts/build-wp-redirects.mjs           # write both artefacts
//   node scripts/build-wp-redirects.mjs --check   # fail on drift, write nothing

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEGACY = join(ROOT, 'data/legacy')
const SLUG_MAP_OUT = join(LEGACY, 'wp-slug-map.json')
const TS_OUT = join(ROOT, 'src/lib/seo/wp-redirects.generated.ts')

const CHECK = process.argv.includes('--check')

const readRows = (name) => {
  const body = JSON.parse(readFileSync(join(LEGACY, name), 'utf8'))
  return Array.isArray(body) ? body : body.rows
}

// Byte-identical to src/lib/seo/normalize-path.ts, for the reason given in
// build-legacy-redirects.mjs: a .mjs script cannot import the TypeScript one.
function normalizePath(pathname) {
  if (!pathname) return '/'
  const noFragment = pathname.split('#', 1).join('')
  let out = noFragment.split('?', 1).join('')
  try {
    out = decodeURIComponent(out)
  } catch {
    /* a malformed percent sequence still gets a chance to match */
  }
  out = out.normalize('NFC').toLowerCase().replace(/\/+$/, '')
  return out || '/'
}

const lastSegment = (path) => path.slice(path.lastIndexOf('/') + 1)

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

const products = readRows('products.json')
const categories = readRows('categories.json')
const inventory = readRows('url-inventory.json')
const measured = JSON.parse(readFileSync(join(LEGACY, 'redirect-map.json'), 'utf8'))

const redirectOf = new Map(measured.redirects.map((r) => [r.source, r]))
const excludedOf = new Map(measured.excluded.map((e) => [e.source, e]))

/**
 * The hand-written aliases in next.config.ts, read from the file.
 *
 * ONE case needs them. The crawl maps the WordPress page `/coupon-scanner` to
 * `/scan`. `/scan` is not a page here, it is an alias: next.config.ts sends it
 * on to `/supplier/scan`. The liveness check in build-legacy-redirects.mjs
 * asks "is `/scan` a route", correctly answers no, and drops the row as
 * `target_not_live` -- so the map calls a URL lost that is one alias away from
 * a live screen.
 *
 * Following the alias is not a second opinion on liveness. The destination is
 * still only accepted if it is in the static routes that script measured; all
 * this adds is the hop, and it adds it so the visitor gets ONE 301 to the real
 * page instead of a 301 onto a 308.
 *
 * Read from the file, not listed here: a second copy of the alias table is a
 * list that is right until someone edits the first one.
 */
const configAliases = new Map(
  [
    ...readFileSync(join(ROOT, 'next.config.ts'), 'utf8').matchAll(
      /\{ source: '([^']+)', destination: '([^']+)', permanent: true \}/g,
    ),
  ].map((m) => [normalizePath(m[1]), normalizePath(m[2])]),
)
const staticRoutes = new Set(measured.$targets.static_routes)
const inventoryTarget = new Map(
  inventory.map((r) => [normalizePath(r.old_path), r.mapped_new_path]),
)

/** The live page behind a dropped row's target, if an alias leads to one. */
function viaAlias(oldPath) {
  const mapped = inventoryTarget.get(oldPath)
  if (!mapped) return null
  const alias = normalizePath(mapped)
  const destination = configAliases.get(alias)
  return destination && staticRoutes.has(destination) ? { alias, destination } : null
}

const productByPath = new Map(products.map((p) => [normalizePath(p.permalink), p]))
const categoryByPath = new Map(categories.map((c) => [normalizePath(c.permalink), c]))

/* ------------------------------------------------------------------ *
 * Slug map
 * ------------------------------------------------------------------ */

const DISPOSITION_OF_EXCLUSION = {
  same_path_live: 'unchanged',
  source_is_live: 'unchanged',
  same_path_dead: 'lost_404',
  target_not_live: 'lost_404',
  category_unresolved: 'lost_404',
  no_target: 'lost_404',
}

const entries = []
const unaccounted = []

for (const row of inventory) {
  const oldPath = normalizePath(row.old_path)
  const redirect = redirectOf.get(oldPath)
  const exclusion = excludedOf.get(oldPath)

  let disposition
  let newPath = null
  let note = exclusion?.note ?? redirect?.evidence ?? null
  if (redirect) {
    disposition = redirect.status === 410 ? 'gone_410' : 'redirect_301'
    newPath = redirect.status === 410 ? null : redirect.target
  } else if (exclusion?.reason === 'target_not_live' && viaAlias(oldPath)) {
    const hop = viaAlias(oldPath)
    disposition = 'redirect_301'
    newPath = hop.destination
    note = `inventory target ${hop.alias} is a next.config.ts alias of ${hop.destination} (static route)`
  } else if (exclusion) {
    disposition = DISPOSITION_OF_EXCLUSION[exclusion.reason]
    if (!disposition) throw new Error(`unknown exclusion reason ${exclusion.reason} on ${oldPath}`)
    if (disposition === 'unchanged') newPath = oldPath
  } else {
    unaccounted.push(oldPath)
    continue
  }

  const product = productByPath.get(oldPath)
  const category = categoryByPath.get(oldPath)

  entries.push({
    type: row.entity,
    wp_id: row.entity_wp_id ?? product?.wp_post_id ?? category?.wp_term_id ?? null,
    old_slug: product?.slug_decoded ?? category?.slug_decoded ?? lastSegment(oldPath),
    old_path: oldPath,
    // As the crawl recorded it: WordPress percent-encodes Hebrew in LOWERCASE
    // hex, and that is the form sitting in Google's index and in old links.
    old_path_as_crawled: row.old_path,
    new_path: newPath,
    new_slug: newPath && newPath !== '/' ? lastSegment(newPath) : null,
    disposition,
    rule: row.mapping_rule,
    note,
  })
}

if (unaccounted.length) {
  throw new Error(
    `${unaccounted.length} inventory URL(s) have no disposition in redirect-map.json. ` +
      `Re-run scripts/build-legacy-redirects.mjs first:\n  ${unaccounted.join('\n  ')}`,
  )
}

// Every permalink in the entity files must have been seen. The inventory is
// supposed to be their union; this is the line that proves it rather than
// assuming it.
const seen = new Set(entries.map((e) => e.old_path))
const missing = [...productByPath.keys(), ...categoryByPath.keys()].filter((p) => !seen.has(p))
if (missing.length) {
  throw new Error(`permalink(s) absent from url-inventory.json:\n  ${missing.join('\n  ')}`)
}

entries.sort((a, b) => a.type.localeCompare(b.type) || (a.old_path < b.old_path ? -1 : 1))

const count = (pred) => entries.filter(pred).length
const byType = (type) => ({
  total: count((e) => e.type === type),
  redirect_301: count((e) => e.type === type && e.disposition === 'redirect_301'),
  gone_410: count((e) => e.type === type && e.disposition === 'gone_410'),
  unchanged: count((e) => e.type === type && e.disposition === 'unchanged'),
  lost_404: count((e) => e.type === type && e.disposition === 'lost_404'),
})

const slugMap = {
  $what:
    'Every WordPress permalink from the crawl (products, categories, pages), the slug it ' +
    'had, and where it lives on this site.',
  $generated_by: 'scripts/build-wp-redirects.mjs',
  $inputs: [
    'data/legacy/products.json',
    'data/legacy/categories.json',
    'data/legacy/url-inventory.json',
    'data/legacy/redirect-map.json',
  ],
  $liveness_measured_at: measured.$measured_at,
  $dispositions: {
    redirect_301: 'moved; next.config.ts answers 301 (and public.seo_redirects carries the row)',
    gone_410: 'retired on purpose; the proxy answers 410 from public.seo_redirects',
    unchanged: 'same path on both sites and served today; nothing to do',
    lost_404: 'nothing behind it and no live target to send it to; 404 today',
  },
  $counts: {
    permalinks: entries.length,
    product: byType('product'),
    category: byType('category'),
    page: byType('page'),
    post: { total: 0, $note: 'the WXR export contains no post_type=post items' },
  },
  entries,
}

/* ------------------------------------------------------------------ *
 * The list next.config.ts serves
 * ------------------------------------------------------------------ */

const wpRedirects = entries
  .filter((e) => e.disposition === 'redirect_301')
  .map((e) => ({ source: e.old_path, destination: e.new_path, type: e.type, wpId: e.wp_id }))
  .sort((a, b) => (a.source < b.source ? -1 : 1))

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const ts = `// GENERATED by scripts/build-wp-redirects.mjs. Do not edit by hand:
// \`node scripts/build-wp-redirects.mjs --check\` fails if you do.
//
// The retired WordPress URLs that MOVED, decoded and normalised, with the live
// path each one now resolves to. Source of truth: data/legacy/wp-slug-map.json.
// src/lib/seo/wp-redirects.ts turns these into next.config.ts redirects.

export type WpRedirect = {
  /** Decoded, lower-cased, no trailing slash. */
  readonly source: string
  readonly destination: string
  readonly type: 'product' | 'category' | 'page'
  readonly wpId: number | null
}

export const WP_REDIRECTS: readonly WpRedirect[] = [
${wpRedirects
  .map(
    (r) =>
      // One property per line, always. The formatter keeps an object expanded
      // once its first key is on its own line, so this output is already in
      // the shape `biome check --write` leaves it and `--check` stays quiet.
      `  {\n    source: ${quote(r.source)},\n    destination: ${quote(r.destination)},\n` +
      `    type: ${quote(r.type)},\n    wpId: ${r.wpId === null ? 'null' : r.wpId},\n  },`,
  )
  .join('\n')}
]
`

const slugMapJson = `${JSON.stringify(slugMap, null, 2)}\n`

/* ------------------------------------------------------------------ */

if (CHECK) {
  let failed = false
  for (const [path, next] of [
    [SLUG_MAP_OUT, slugMapJson],
    [TS_OUT, ts],
  ]) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (current !== next) {
      console.error(`DRIFT ${path}`)
      failed = true
    }
  }
  if (failed) {
    console.error('\nRe-run without --check to regenerate.')
    process.exit(1)
  }
  console.log(`OK ${entries.length} permalinks, ${wpRedirects.length} x 301, no drift.`)
} else {
  writeFileSync(SLUG_MAP_OUT, slugMapJson)
  writeFileSync(TS_OUT, ts)
  console.log(`wrote ${SLUG_MAP_OUT}`)
  console.log(`wrote ${TS_OUT}`)
  for (const type of ['product', 'category', 'page']) {
    console.log(`  ${type}: ${JSON.stringify(slugMap.$counts[type])}`)
  }
  console.log(`${entries.length} permalinks, ${wpRedirects.length} x 301 for next.config.ts`)
}
