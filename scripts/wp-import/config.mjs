// Central config + CLI parsing for the WordPress import pipeline.
// Companion doc: docs/ARCHITECTURE-WP-DATA-MIGRATION.md
//
// The single most important rule in this file: DRY RUN IS THE DEFAULT.
// Writing to a database requires BOTH the --apply flag AND the
// WP_IMPORT_ALLOW_WRITES=1 environment variable. One lock is a typo away from
// a live import; two locks cannot both be tripped by accident.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '../..')

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const OPTIONS = {
  apply: { type: 'boolean', default: false },
  stage: { type: 'string' },
  source: { type: 'string', default: 'rest' }, // rest | dump | xml | csv
  file: { type: 'string' }, // WXR .xml or WooCommerce .csv, for --source xml|csv
  entity: { type: 'string' }, // restrict to one entity, for spot re-runs
  limit: { type: 'string' }, // cap rows per entity; debugging aid
  batch: { type: 'string' }, // resume into an existing import_batches id
  resume: { type: 'boolean', default: false },
  verbose: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
}

function parse(argv) {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch (err) {
    console.error(`argument error: ${err.message}`)
    process.exit(2)
  }
}

const { values: argv, positionals } = parse(process.argv.slice(2))

// ---------------------------------------------------------------------------
// The write gate
// ---------------------------------------------------------------------------

const ALLOW_WRITES_ENV = process.env.WP_IMPORT_ALLOW_WRITES === '1'

/** true unless BOTH locks are open. Every writer checks this, not the flag. */
export const DRY_RUN = !(argv.apply && ALLOW_WRITES_ENV)

/**
 * Explains why the run is dry, so a confused operator gets the missing half
 * rather than a silent no-op.
 */
export function dryRunReason() {
  if (!DRY_RUN) return null
  if (!argv.apply && !ALLOW_WRITES_ENV) return 'no --apply flag and WP_IMPORT_ALLOW_WRITES is not 1'
  if (!argv.apply) return 'no --apply flag (WP_IMPORT_ALLOW_WRITES is set)'
  return 'WP_IMPORT_ALLOW_WRITES is not 1 (--apply was passed)'
}

// ---------------------------------------------------------------------------
// Paths: every artifact of a run lands under wp_import/ at the repo root
// ---------------------------------------------------------------------------

export const PATHS = {
  root: resolve(REPO_ROOT, 'wp_import'),
  raw: resolve(REPO_ROOT, 'wp_import/raw'), // verbatim source payloads
  normalized: resolve(REPO_ROOT, 'wp_import/normalized'), // post-transform rows
  reports: resolve(REPO_ROOT, 'wp_import/reports'), // validation output
  media: resolve(REPO_ROOT, 'wp_import/media'), // downloaded/converted bytes
  logs: resolve(REPO_ROOT, 'wp_import/logs'), // migration_log jsonl mirror
}

export function ensureDirs() {
  for (const dir of Object.values(PATHS)) mkdirSync(dir, { recursive: true })
}

// ---------------------------------------------------------------------------
// Source credentials
// ---------------------------------------------------------------------------

export const WC = {
  base: (process.env.WC_BASE || 'https://kenyonexpress.co.il').replace(/\/+$/, ''),
  key: process.env.WC_KEY || '',
  secret: process.env.WC_SECRET || '',
  perPage: 100, // WooCommerce hard maximum
}

export const SUPABASE = {
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
}

// ---------------------------------------------------------------------------
// Throttle: we are hitting a live production store. Be a polite client.
// ---------------------------------------------------------------------------

export const THROTTLE = {
  concurrency: 2,
  minIntervalMs: 250, // ~4 req/s
  backoffIntervalMs: 1000, // drop to ~1 req/s after a 429/5xx
  maxAttempts: 5,
  backoffMs: [500, 1000, 2000, 4000],
  timeoutMs: 30_000,
}

// ---------------------------------------------------------------------------
// Business defaults: values WooCommerce has no column for.
//
// These are the new commerce economics. They are config, reviewed before a run
// and committed with it, so every derived value stays auditable. They are NOT
// invented per row and NOT silently zero.
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  // product_cat slugs whose products become type = 'coupon'
  couponCategorySlugs: [],
  // product_cat slugs whose products become type = 'service'
  serviceCategorySlugs: [],
  platformPercent: 10,
  commissionPercent: 15,
  cashbackPercent: 0,
  couponExpiryDays: 365,
  currency: 'ILS',
  // every imported product hangs off this supplier unless vendor_map.csv says otherwise
  legacySupplierName: 'Kenyon Express (legacy WP)',
  // imported people are never opted in. Non-negotiable, see doc 5.5.
  marketingOptIn: false,
  imageBucket: 'product-images',
  batchSize: 200,
  // Products a WooCommerce plugin creates for its own bookkeeping. They are not
  // catalogue rows and must never become drafts in the new store. Dokan's
  // reverse-withdrawal product has price 0, no product_cat and no image, which
  // is why one row tripped three separate gates in the 2026-07-29 dry run.
  // Listed by slug here rather than sniffed for in transform logic, so the
  // exclusion is a reviewable decision in one place.
  excludeProductSlugs: ['reverse-withdrawal-payment'],
}

/**
 * The route shapes this app actually serves. Every redirect target is built
 * from here, and from nowhere else.
 *
 * These were `/p/` and `/c/` until 2026-07-29, which no route in the app has
 * ever answered: src/app/(store)/product/[slug] and (store)/category/[slug]
 * are the live ones, and src/app/sitemap.ts has been emitting /product/ and
 * /category/ to Google the whole time. Every redirect the pipeline computed
 * pointed at a 404. A prefix is one string in one file precisely so that a
 * route rename is a config edit rather than a silent catalogue-wide 404.
 */
export const ROUTES = {
  product: '/product',
  category: '/category',
  productList: '/products',
  couponList: '/coupons',
}

/**
 * Where each old WordPress `page` lands. Products and categories derive their
 * targets from a slug rule; pages cannot, because a page is a hand-made thing
 * whose replacement is a product decision.
 *
 * Until 2026-08-01 `url_inventory` held products and categories only, so
 * `redirect_coverage` reported 76/76 while 27 published pages were not in the
 * set being scored at all. A gate that passes by omitting rows is worse than a
 * gate that fails: it reports the site is safe to cut over while
 * /privacy-policy/ and /terms-and-conditions/ are about to start 404ing.
 *
 * Keys are normalized paths (see `normalizePath` in 02-transform): lowercased,
 * percent-decoded, NFC, no trailing slash. A page absent from this table gets an
 * inventory row with no target, which fails `redirect_coverage` by name. That is
 * deliberate: an unmapped page is an open decision, not a default.
 *
 * `gone: true` means an explicit 410. It is for features the new store does not
 * have and is not going to grow back (Dokan vendor dashboards, the YITH
 * compare/wishlist plugins, a dead PayPlus error page). 410 rather than a 301 to
 * the homepage, because redirecting a missing feature to the front page is a
 * soft 404: Google keeps the old URL indexed and the customer lands somewhere
 * that does not answer their question.
 */
export const PAGE_REDIRECTS = {
  // Storefront plumbing: the same job, on a route that exists today.
  '/shop': { to: ROUTES.productList },
  '/store-directory': { to: ROUTES.productList },
  '/cart': { to: '/cart' },
  '/checkout': { to: '/checkout' },
  '/my-account': { to: '/account' },
  '/my-orders': { to: '/account/orders' },
  '/track-your-order': { to: '/account/orders' },
  '/coupon-scanner': { to: '/scan' },

  // Three homepage builds that were all live at once on the old site.
  '/home-v7-el': { to: '/' },
  '/דף-בית-טסט': { to: '/' },
  '/דף-הבית-7': { to: '/' },
  '/קניון-אקספרס-דף-הבית-מסדרים-לך-בילוי': { to: '/' },

  // Plugin features the new store does not carry.
  '/blog': { gone: true },
  '/affiliate-area': { gone: true },
  '/dashboard': { gone: true },
  '/store-listing': { gone: true },
  '/compare': { gone: true },
  '/yith-compare': { gone: true },
  '/recently-viewed': { gone: true },
  '/wishlist': { gone: true },
  '/my-wishlist': { gone: true },
  '/wishlist-archive': { gone: true },
  '/error-payment-payplus': { gone: true },

  // NOT mapped, deliberately: /about, /contact, /privacy-policy,
  // /terms-and-conditions, /refund_returns. The new app has no route for any of
  // them (`find src/app -name page.tsx` confirms it), and these are the five old
  // paths where a wrong answer costs the most: two are legal documents customers
  // and card processors expect to find, and all five are indexed. Inventing a
  // target here would turn a missing page into a silent redirect to the wrong
  // content. They stay unmapped so `redirect_coverage` names them on every run
  // until the pages exist.
}

/** Optional operator-supplied overrides, loaded by whoever needs them. */
export const OVERRIDE_FILES = {
  vendorMap: resolve(PATHS.root, 'vendor_map.csv'), // wp_vendor_id,supplier_id
  slugOverrides: resolve(PATHS.root, 'slug_overrides.csv'), // wp_id,new_slug
  categoryMap: resolve(PATHS.root, 'category_map.csv'), // wp_term_id,target_slug,create_new
}

// ---------------------------------------------------------------------------
// Derived run config
// ---------------------------------------------------------------------------

const SOURCES = ['rest', 'dump', 'xml', 'csv']
if (!SOURCES.includes(argv.source)) {
  console.error(`unknown --source ${argv.source} (expected one of: ${SOURCES.join(', ')})`)
  process.exit(2)
}
// A file source with no file is a run that would silently extract nothing and
// report success, which is the failure mode this pipeline exists to avoid.
if ((argv.source === 'xml' || argv.source === 'csv') && !argv.file) {
  console.error(`--source ${argv.source} requires --file <path>`)
  process.exit(2)
}

export const RUN = {
  stage: argv.stage || positionals[0] || 'all',
  source: argv.source,
  file: argv.file ? resolve(process.cwd(), argv.file) : null,
  entity: argv.entity || null,
  limit: argv.limit ? Number.parseInt(argv.limit, 10) : null,
  batchId: argv.batch || null,
  resume: argv.resume,
  verbose: argv.verbose,
  help: argv.help,
}

export const HELP = `
wp-import - WordPress/WooCommerce to Supabase migration pipeline

  node scripts/wp-import/run.mjs [stage] [options]

Stages (default: all)
  extract     read WooCommerce (REST or dump) into wp_import/raw/
  transform   raw payloads into normalized rows in wp_import/normalized/
  load        upsert normalized rows into the wp_import.* staging schema
  media       download, dedupe by sha256, convert to webp, upload to storage
  project     project staging into public.* through wp_import.id_map
  validate    run the gates and write a report to wp_import/reports/
  all         extract -> transform -> load -> media -> project -> validate

Options
  --apply             actually write. Requires WP_IMPORT_ALLOW_WRITES=1 too.
  --source <src>      rest | dump | xml | csv   (default: rest)
                        rest  live WooCommerce REST API
                        dump  JSON exported from a restored mysqldump
                        xml   a WordPress WXR export (Tools > Export)
                        csv   a WooCommerce product CSV export
  --file <path>       the .xml or .csv file. Required by --source xml|csv.
  --entity <name>     restrict to one entity (product, category, media, ...)
  --limit <n>         cap rows per entity (debugging)
  --batch <uuid>      attach to an existing import_batches row
  --resume            skip source pages already checkpointed in wp_import/raw/
  --verbose           per-row logging
  --help              this text

Safety
  Dry run is the DEFAULT. Nothing is written unless BOTH --apply is passed
  and WP_IMPORT_ALLOW_WRITES=1 is exported. A dry run still does all the
  reading, transforming, and validating, and prints the exact plan.
`

export { argv, positionals }
