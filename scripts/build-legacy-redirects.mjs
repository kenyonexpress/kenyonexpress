#!/usr/bin/env node
// Build the legacy WordPress -> Next.js redirect map.
//
// WHY THIS EXISTS RATHER THAN wp_import.fn_project_redirects
//
// The projection function in the database is not wrong, it is just blind. It
// copies `url_inventory.mapped_new_path` into `seo_redirects` and its only
// safety checks are structural: the path is non-empty, it starts with a slash,
// and it differs from its own source. Nothing in it asks the question that
// decides whether a redirect helps or hurts:
//
//     does the target exist, and is the source actually dead?
//
// The inventory was crawled on 2026-08-11 and frozen. The site kept moving.
// Running the projection today would write 34 rows, and measured against
// production on 2026-09-09, 13 of them are wrong -- not malformed, wrong:
//
//   - 11 category rows point at Hebrew slugs. Production categories carry
//     ENGLISH slugs (`restaurants-cafes`, not `מסעדות-ובתי-קפה`). Every one of
//     those is a 301 into a 404, which is strictly worse than the 404 the
//     visitor gets today: Search Console reports it as a redirect, so the
//     broken destination never surfaces as a broken page.
//   - `/blog` is marked `page_gone_410`, and `/blog` is a live route in this
//     app with real posts. The proxy answers 410 BEFORE routing, so that row
//     would take an indexed, working page off the internet with a status code
//     that tells Google never to come back.
//   - Two `/product/...₪` rows redirect one live product at another. Both
//     slugs are active in production; they are the `₪`-in-slug duplicates
//     that CLAUDE.md blocker #1 records. Which of a duplicate pair is real is
//     an operator decision, and a 301 makes it silently.
//
// The correction does NOT belong in `wp_import.url_inventory`. That table and
// `data/legacy/url-inventory.json` are the frozen record of what the old site
// served; editing evidence to fix a projection bug destroys the only thing
// that can answer "what did the old site have" later. The correction belongs
// in this layer, where it is reviewable and where the reason for each dropped
// row is written down next to the row.
//
// THE RULE THIS ADDS, IN ONE LINE
//
// A source path that is LIVE gets no row, and a target path that is not live
// gets no row. Both halves are measured, not asserted.
//
// USAGE
//
//   node scripts/build-legacy-redirects.mjs           # measure + write
//   node scripts/build-legacy-redirects.mjs --check   # measure + fail on drift
//
// `--check` is what CI would run: it rebuilds from the same inputs and exits
// non-zero if the checked-in artefacts differ, so an edit by hand is caught.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = join(ROOT, 'src/app')
const INVENTORY = join(ROOT, 'data/legacy/url-inventory.json')
const MAP_OUT = join(ROOT, 'data/legacy/redirect-map.json')
const SQL_OUT = join(ROOT, 'migrations/pending/192_seed_seo_redirects.sql')

const CHECK = process.argv.includes('--check')

/* ------------------------------------------------------------------ *
 * normalizePath, kept byte-identical to src/lib/seo/normalize-path.ts
 * ------------------------------------------------------------------ */

// Duplicated on purpose, not imported: this is a .mjs script and that module is
// TypeScript. The drift risk is real and it is what `normalizedPathMatches` in
// the test guards -- it re-derives every source through the TypeScript version
// and fails if the two disagree on even one row.
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

/* ------------------------------------------------------------------ *
 * What this app actually serves
 * ------------------------------------------------------------------ */

/**
 * Every STATIC route in src/app, read off the filesystem.
 *
 * Read rather than listed, because a hand-kept list is exactly how `/blog`
 * became a 410 in the first place: the route was added after the inventory was
 * frozen and nothing re-asked the question.
 *
 * Route groups `(store)` contribute nothing to the URL and are stripped.
 * Dynamic segments are excluded here and handled by the catalogue instead --
 * `/product/[slug]` exists as a route for every slug and for none of them, so
 * treating it as a static route would mark every legacy product URL live.
 */
function staticRoutes(dir = APP_DIR, prefix = '') {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('_') || name.startsWith('@')) continue
    if (name.startsWith('[')) continue
    const segment = name.startsWith('(') && name.endsWith(')') ? '' : `/${name}`
    const child = join(dir, name)
    if (existsSync(join(child, 'page.tsx')) || existsSync(join(child, 'page.ts'))) {
      out.push(normalizePath(prefix + segment) || '/')
    }
    out.push(...staticRoutes(child, prefix + segment))
  }
  if (prefix === '' && (existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'page.ts')))) {
    out.push('/')
  }
  return [...new Set(out)].sort()
}

/**
 * The live catalogue, from production, through the ANON key.
 *
 * Anon and not the service role for the reason src/lib/seo/redirects.ts gives:
 * which products and categories are public is not a secret, RLS already
 * publishes exactly the visible ones, and `.env.local` carries a service key
 * this project rejects (docs/RUNBOOK.md, "stale local service key"). Through
 * anon it loads; through the admin client every call here throws.
 *
 * The predicate matters and is recorded in the artefact: a DRAFT product has a
 * row and serves a 404, so "exists" is the wrong question and "is active" is
 * the right one.
 */
async function measureCatalogue() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / anon key. This script refuses to guess what is live.',
    )
  }

  const get = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
    return res.json()
  }

  const products = await get('products?select=slug,status&status=eq.active&deleted_at=is.null')
  const categories = await get('categories?select=slug,name_he&is_active=is.true')

  return {
    products: [...new Set(products.map((p) => normalizePath(`/${p.slug}`).slice(1)))].sort(),
    categories: categories
      .map((c) => ({ slug: c.slug, name_he: c.name_he }))
      .sort((a, b) => (a.slug < b.slug ? -1 : 1)),
  }
}

/* ------------------------------------------------------------------ *
 * Category slug resolution
 * ------------------------------------------------------------------ */

/** WooCommerce built its category slugs from the Hebrew name; ours are English. */
function slugifyHebrew(name) {
  return normalizePath(
    `/${name
      // Bidi isolates and the shekel sign are in `name_he` and never in a slug.
      .replace(/[⁦-⁩‎‏₪]/g, '')
      .trim()
      .replace(/\s+/g, '-')}`,
  ).slice(1)
}

/**
 * The four categories whose Hebrew name was changed after the crawl, plus the
 * WooCommerce default bucket.
 *
 * These are DECISIONS, not derivations, which is why they are written out
 * instead of being folded into a cleverer matcher. `יופי-בריאות-וטיפוח` and
 * `טיפוח בריאות ויופי` are the same category with its words reordered; no
 * string rule can know that, and a fuzzy one that guessed right here would
 * guess wrong somewhere nobody checked.
 *
 * `uncategorized` is the odd one: it is WooCommerce's default bucket and has
 * no counterpart, so it goes to the full listing rather than to a 410. It held
 * real products, and a visitor who lands there wants a catalogue, not a
 * tombstone.
 */
const CATEGORY_OVERRIDES = {
  'יופי-בריאות-וטיפוח': 'beauty-health',
  'טלפונים-מחשבים-ואביזרים': 'phones-computers',
  'קורסים-express': 'courses',
  'עד-99': 'under-99',
  uncategorized: '/products',
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

function build(inventory, live, routes) {
  const staticSet = new Set(routes)
  const productSet = new Set(live.products)
  const categorySet = new Set(live.categories.map((c) => c.slug))

  // name_he -> slug, so a legacy Hebrew category slug can be recognised by the
  // name it was built from.
  const byHebrewSlug = new Map()
  for (const c of live.categories) byHebrewSlug.set(slugifyHebrew(c.name_he), c.slug)

  /** Is this path something the site serves a 200 for today? */
  const isLive = (path) => {
    if (staticSet.has(path)) return 'static route'
    const product = path.startsWith('/product/') && path.slice('/product/'.length)
    if (product && productSet.has(product)) return 'active product'
    const category = path.startsWith('/category/') && path.slice('/category/'.length)
    if (category && categorySet.has(category)) return 'active category'
    return null
  }

  const redirects = []
  const excluded = []
  const drop = (source, reason, note) => excluded.push({ source, reason, note })

  for (const row of inventory) {
    const source = normalizePath(row.old_path)

    // 1. The old path already equals the new one. Percent-encoded Hebrew
    //    decodes to the same string, so these need no row -- the request
    //    routes straight through. Checked FIRST, ahead of the liveness rule
    //    that would also catch them, because it is the more informative of the
    //    two answers: "the URL never moved" and "the URL moved somewhere that
    //    happens to be up" are different facts and the report should not
    //    collapse them.
    if (row.mapped_new_path && normalizePath(row.mapped_new_path) === source) {
      // Split by whether the unchanged path is actually SERVED. "The URL did
      // not move" and "the URL did not move and there is nothing at the other
      // end" are different outcomes, and folding them together is how three
      // permanently-404ing product URLs stayed invisible: they are the happiest
      // looking category in the report and the only one that loses traffic.
      const live = isLive(source)
      if (live) {
        drop(source, 'same_path_live', `unchanged URL, served today (${live})`)
      } else {
        drop(source, 'same_path_dead', 'unchanged URL with nothing behind it: 404 today')
      }
      continue
    }

    // 2. The source is live. No row, whatever the inventory says about it.
    //    This is the rule that saves /blog and the two ₪ duplicates.
    const sourceLive = isLive(source)
    if (sourceLive) {
      drop(
        source,
        'source_is_live',
        `serves 200 today (${sourceLive}); a row here would take it down`,
      )
      continue
    }

    // 3. Gone.
    if (row.gone_410) {
      redirects.push({
        source,
        target: '',
        status: 410,
        rule: row.mapping_rule,
        entity: row.entity,
        wp_id: row.entity_wp_id ?? null,
      })
      continue
    }

    if (!row.mapped_new_path) {
      drop(source, 'no_target', `inventory rule ${row.mapping_rule} produced no destination`)
      continue
    }

    let target = normalizePath(row.mapped_new_path)

    // 4. Categories: re-resolve the Hebrew slug against the live English one.
    if (target.startsWith('/category/')) {
      const legacy = target.slice('/category/'.length)
      const override = CATEGORY_OVERRIDES[legacy]
      const resolved =
        override ?? byHebrewSlug.get(legacy) ?? (categorySet.has(legacy) ? legacy : null)
      if (!resolved) {
        drop(source, 'category_unresolved', `no live category answers to "${legacy}"`)
        continue
      }
      target = resolved.startsWith('/') ? resolved : `/category/${resolved}`
    }

    // 5. The target must be live. A 301 into a 404 is worse than the 404 it
    //    replaces, because Search Console files it under "redirect" and the
    //    broken destination never surfaces as a broken page.
    const targetLive = isLive(target)
    if (!targetLive) {
      drop(source, 'target_not_live', `${target} is not served today`)
      continue
    }

    redirects.push({
      source,
      target,
      status: 301,
      rule: row.mapping_rule,
      entity: row.entity,
      wp_id: row.entity_wp_id ?? null,
      evidence: targetLive,
    })
  }

  redirects.sort((a, b) => (a.source < b.source ? -1 : 1))
  excluded.sort((a, b) => (a.source < b.source ? -1 : 1))
  return { redirects, excluded }
}

/**
 * The sitemap diff: every URL the old site served, and what this one does
 * with it.
 *
 * The question it answers is the only one that matters after a cutover -- for
 * each URL Google has already indexed, does a visitor arriving from that
 * result get the page, get sent to a page, or get nothing? Three of those
 * answers are fine. The fourth is `lost`, and `lost` is silent: no error, no
 * log, no row anywhere, just a search result that stopped working.
 *
 * Suppliers (`/s/[id]`) are in the new sitemap and in no legacy URL, because
 * the old site had no supplier pages at all. They are counted under
 * `new_since_migration` rather than being left out, so the two sides add up.
 */
function sitemapDiff(inventory, redirects, excluded, live, routes) {
  const reasonOf = new Map(excluded.map((e) => [e.source, e.reason]))
  const statusOf = new Map(redirects.map((r) => [r.source, r.status]))

  const bucket = { served: [], redirected: [], gone: [], lost: [] }
  for (const row of inventory) {
    const source = normalizePath(row.old_path)
    const status = statusOf.get(source)
    if (status === 301) bucket.redirected.push(source)
    else if (status === 410) bucket.gone.push(source)
    else if (reasonOf.get(source) === 'same_path_dead') bucket.lost.push(source)
    else bucket.served.push(source)
  }

  const sitemapNow = [
    ...routes,
    ...live.products.map((s) => `/product/${s}`),
    ...live.categories.map((c) => `/category/${c.slug}`),
  ]
  const legacy = new Set(inventory.map((r) => normalizePath(r.old_path)))

  return {
    $what: 'Every URL the retired WordPress site served, and what this site does with it.',
    $why:
      'A cutover loses traffic through the one bucket that raises nothing: a URL Google ' +
      'has indexed, with no page behind it and no redirect row pointing anywhere.',
    legacy_urls: inventory.length,
    served_unchanged: bucket.served.length,
    redirected_301: bucket.redirected.length,
    gone_410: bucket.gone.length,
    lost_404: bucket.lost.length,
    lost: bucket.lost,
    new_since_migration: sitemapNow.filter((u) => !legacy.has(u)).length,
  }
}

/* ------------------------------------------------------------------ *
 * Emit
 * ------------------------------------------------------------------ */

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`

function toSql(redirects, stamp) {
  const values = redirects
    .map(
      (r) =>
        `  (${sqlString(r.source)}, ${sqlString(r.target)}, ${r.status}, ` +
        `${sqlString(r.entity)}, ${r.wp_id === null ? 'NULL' : r.wp_id}, ${sqlString(r.rule)})`,
    )
    .join(',\n')

  return `-- 192_seed_seo_redirects.sql
--
-- Seed public.seo_redirects with the legacy WordPress map.
--
-- GENERATED by scripts/build-legacy-redirects.mjs on ${stamp}. Do not edit by
-- hand: \`node scripts/build-legacy-redirects.mjs --check\` fails if you do.
--
-- WHAT THIS FIXES
--
-- The table is EMPTY in production, measured ${stamp.slice(0, 10)}: 0 rows, so
-- every retired WordPress URL 404s today. The 301 machinery around it -- the
-- proxy lookup, the five-minute cache, the RLS policy, the hit counter -- was
-- built, reviewed and never given a single row to serve.
--
-- WHY NOT wp_import.fn_project_redirects
--
-- Because that function would write 34 rows and 13 of them are wrong against
-- production today: 11 categories pointing at Hebrew slugs that no longer
-- exist, a 410 on the live /blog route, and two 301s between live duplicate
-- products. The header of the generator script has the measurement.
--
-- DATA ONLY. No DDL. Re-running it is a no-op on unchanged rows.

BEGIN;

CREATE TEMP TABLE _seed (
  source_path  text PRIMARY KEY,
  target_path  text NOT NULL,
  status_code  smallint NOT NULL,
  entity_type  text,
  wp_id        bigint,
  mapping_rule text
) ON COMMIT DROP;

INSERT INTO _seed (source_path, target_path, status_code, entity_type, wp_id, mapping_rule) VALUES
${values};

INSERT INTO public.seo_redirects
  (source_path, target_path, status_code, entity_type, wp_id, mapping_rule, is_active)
SELECT source_path, target_path, status_code, entity_type, wp_id, mapping_rule, true
FROM _seed
ON CONFLICT (source_path) DO UPDATE
  SET target_path  = EXCLUDED.target_path,
      status_code  = EXCLUDED.status_code,
      entity_type  = EXCLUDED.entity_type,
      wp_id        = EXCLUDED.wp_id,
      mapping_rule = EXCLUDED.mapping_rule,
      is_active    = true,
      updated_at   = now();

-- Rows this file does NOT carry are DEACTIVATED, not deleted.
--
-- Deleting would throw away the hit counter, which is the only evidence of
-- whether a retired URL still gets traffic; \`is_active = false\` stops it being
-- served while keeping the count. The proxy filters on is_active.
UPDATE public.seo_redirects r
   SET is_active = false, updated_at = now()
 WHERE r.is_active
   AND NOT EXISTS (SELECT 1 FROM _seed s WHERE s.source_path = r.source_path);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.seo_redirects WHERE is_active;
  IF n <> ${redirects.length} THEN
    RAISE EXCEPTION 'expected ${redirects.length} active redirects, found %', n;
  END IF;
END $$;

COMMIT;
`
}

/* ------------------------------------------------------------------ */

const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'))
const rows = Array.isArray(inventory) ? inventory : inventory.rows
const live = await measureCatalogue()
const routes = staticRoutes()
const { redirects, excluded } = build(rows, live, routes)
const stamp = new Date().toISOString()

const artefact = {
  $what: 'Every legacy WordPress URL, and what this site does with it today.',
  $why:
    'public.seo_redirects is empty in production, so every retired URL 404s. ' +
    'This is the map that fills it, corrected against what production actually serves.',
  $how:
    'scripts/build-legacy-redirects.mjs reads data/legacy/url-inventory.json (the frozen ' +
    '2026-08-11 crawl), measures the live catalogue through the anon key, reads the static ' +
    'route tree off src/app, and drops every row whose source is live or whose target is not.',
  $generated_by: 'scripts/build-legacy-redirects.mjs',
  $measured_at: stamp,
  $counts: {
    inventory: rows.length,
    redirects: redirects.length,
    redirect_301: redirects.filter((r) => r.status === 301).length,
    redirect_410: redirects.filter((r) => r.status === 410).length,
    excluded: excluded.length,
  },
  $targets: {
    $predicate: {
      products: "status = 'active' AND deleted_at IS NULL",
      categories: 'is_active IS TRUE',
      static_routes: 'a directory under src/app with a page.tsx and no dynamic segment',
    },
    products: live.products,
    categories: live.categories,
    static_routes: routes,
  },
  $sitemap_diff: sitemapDiff(rows, redirects, excluded, live, routes),
  redirects,
  excluded,
}

const mapJson = `${JSON.stringify(artefact, null, 2)}\n`
const sql = toSql(redirects, stamp)

// The timestamp is the one field that legitimately changes on every run, so it
// is excluded from the drift comparison. Everything else must be reproducible.
const stable = (text) => text.replace(/2\d{3}-\d{2}-\d{2}T[\d:.]+Z/g, '<stamp>')
const digest = (text) => createHash('sha256').update(stable(text)).digest('hex').slice(0, 12)

if (CHECK) {
  let failed = false
  for (const [path, next] of [
    [MAP_OUT, mapJson],
    [SQL_OUT, sql],
  ]) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (digest(current) !== digest(next)) {
      console.error(`DRIFT ${path}`)
      failed = true
    }
  }
  if (failed) {
    console.error('\nRe-run without --check to regenerate.')
    process.exit(1)
  }
  console.log(`OK ${redirects.length} redirects, ${excluded.length} excluded, no drift.`)
} else {
  writeFileSync(MAP_OUT, mapJson)
  writeFileSync(SQL_OUT, sql)
  console.log(`wrote ${MAP_OUT}`)
  console.log(`wrote ${SQL_OUT}`)
  console.log(
    `${redirects.length} redirects ` +
      `(${artefact.$counts.redirect_301} x 301, ${artefact.$counts.redirect_410} x 410), ` +
      `${excluded.length} excluded`,
  )
  const byReason = {}
  for (const e of excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1
  for (const [reason, n] of Object.entries(byReason).sort()) console.log(`  ${reason}: ${n}`)
}
