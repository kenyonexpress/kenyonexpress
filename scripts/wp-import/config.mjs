// Central config + CLI parsing for the WordPress import pipeline.
// Companion doc: docs/ARCHITECTURE-WP-DATA-MIGRATION.md
//
// The single most important rule in this file: DRY RUN IS THE DEFAULT.
// Writing to a database requires BOTH the --apply flag AND the
// WP_IMPORT_ALLOW_WRITES=1 environment variable. One lock is a typo away from
// a live import; two locks cannot both be tripped by accident.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '../..')

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const OPTIONS = {
  apply: { type: 'boolean', default: false },
  stage: { type: 'string' },
  source: { type: 'string', default: 'rest' }, // rest | dump
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

export const RUN = {
  stage: argv.stage || positionals[0] || 'all',
  source: argv.source,
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
  project     project staging into public.* through wp_import.id_map
  validate    run the gates and write a report to wp_import/reports/
  all         extract -> transform -> load -> project -> validate

Options
  --apply             actually write. Requires WP_IMPORT_ALLOW_WRITES=1 too.
  --source rest|dump  extraction source (default: rest)
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
