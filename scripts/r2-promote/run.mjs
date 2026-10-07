#!/usr/bin/env node
/**
 * PROMOTES THE LOCALLY STORED IMAGES TO CLOUDFLARE R2.
 *
 * Three sets are waiting (lib/inventory.mjs): the content-addressed
 * derivatives media-ingest wrote under public/images/cdn/ when R2 refused
 * (keys kept verbatim), the files products.images points at under
 * public/images/products/ (keyed products/<file>), and whatever is left of
 * the live-site crawl in refs/live-assets/ (nothing on this branch: the
 * WordPress origin is gone, so that set cannot be rebuilt and is reported
 * as absent rather than invented).
 *
 * The run is a dry run unless `--apply` is given AND real credentials are
 * present. "Real" is checked, not assumed: the Vercel project's four R2_*
 * values were the literal `[SENSITIVE]` placeholder on 2026-10-06, and a
 * guard that only tests `if (!env.X)` waves that through to a
 * SignatureDoesNotMatch twenty minutes later.
 *
 * What a run writes, dry or not:
 *   wp_import/normalized/r2-promote-ledger.json   every object, its key,
 *                                                 bytes, and what happened
 *   wp_import/normalized/r2-promote-rewrite.sql   the idempotent UPDATEs that
 *                                                 move the database pointers
 *
 * The SQL is NOT a migration and is NOT applied here. It is data (one
 * statement per promoted product file) and it points the catalogue at the
 * bucket, so it runs only after every key has been verified with a signed
 * HEAD (`--verify`, on by default under --apply) and only through the
 * approved production path (RUNBOOK). Until then the app can already serve
 * from the bucket without a rewrite: NEXT_PUBLIC_R2_IMAGES=1 makes the image
 * loader (src/lib/images/loader.ts) send the same paths through the signed
 * proxy route, and unsetting it rolls back.
 *
 * Usage:
 *   node scripts/r2-promote/run.mjs                      # dry run, all sets
 *   node scripts/r2-promote/run.mjs --sets=products      # one set
 *   node scripts/r2-promote/run.mjs --apply              # upload + verify
 *   node scripts/r2-promote/run.mjs --apply --no-verify  # upload only
 *   node scripts/r2-promote/run.mjs --apply --limit=20   # first 20 objects
 *
 * Exit: 0 clean (dry run, or every object uploaded and verified); 1 at least
 * one object failed; 2 --apply asked for but credentials missing or
 * placeholders.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { bucketName, r2Head, r2Put } from '../wp-import/lib/r2.mjs'
import { loadEnv } from './lib/env.mjs'
import {
  credentialState,
  dedupe,
  ledgerObjects,
  liveAssetObjects,
  productImageObjects,
  publicBaseFor,
  rewriteSql,
  summarize,
} from './lib/inventory.mjs'

const { values: argv } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    verify: { type: 'boolean', default: true },
    'no-verify': { type: 'boolean', default: false },
    sets: { type: 'string', default: 'cdn,products,live-assets' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '6' },
    ledger: { type: 'string', default: 'wp_import/normalized/media-ingest-results.json' },
    'cdn-root': { type: 'string', default: 'public/images/cdn' },
    'products-dir': { type: 'string', default: 'public/images/products' },
    manifest: { type: 'string', default: 'refs/live-assets/manifest.json' },
    'live-root': { type: 'string', default: 'refs/live-assets' },
    out: { type: 'string', default: 'wp_import/normalized/r2-promote-ledger.json' },
    'sql-out': { type: 'string', default: 'wp_import/normalized/r2-promote-rewrite.sql' },
    env: { type: 'string', default: '.env.local' },
  },
})

const log = (line) => process.stdout.write(`${line}\n`)
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

const env = loadEnv({ file: resolve(argv.env) })
for (const name of [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
]) {
  if (env[name] !== undefined && process.env[name] === undefined) process.env[name] = env[name]
}
const creds = credentialState(env)
const APPLY = argv.apply && creds.ok
const VERIFY = argv.verify && !argv['no-verify']

if (argv.apply && !creds.ok) {
  log('r2-promote: --apply refused, credentials are not usable:')
  for (const m of creds.missing) log(`  missing      ${m}`)
  for (const p of creds.placeholders) log(`  placeholder  ${p} = [SENSITIVE]`)
  log('  (set the real values in .env.local or the shell; nothing was uploaded)')
}

// ---------------------------------------------------------------------------
// The pending set
// ---------------------------------------------------------------------------

const wanted = new Set(argv.sets.split(',').map((s) => s.trim()))
const notes = []
let objects = []

if (wanted.has('cdn')) {
  const ledgerPath = resolve(argv.ledger)
  if (existsSync(ledgerPath)) {
    const rows = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    const r = ledgerObjects({ rows, localRoot: resolve(argv['cdn-root']) })
    objects.push(...r.objects)
    notes.push(
      `cdn: ${r.localRows} ledger rows stored locally, ${r.objects.length} distinct objects`,
    )
    if (r.missing.length) notes.push(`cdn: ${r.missing.length} ledger keys have no file on disk`)
  } else {
    notes.push(`cdn: ledger ${argv.ledger} not found, set skipped`)
  }
}

if (wanted.has('products')) {
  const r = productImageObjects({ dir: resolve(argv['products-dir']) })
  objects.push(...r.objects)
  notes.push(`products: ${r.objects.length} files under ${argv['products-dir']}`)
}

if (wanted.has('live-assets')) {
  const manifestPath = resolve(argv.manifest)
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const r = liveAssetObjects({ manifest, root: resolve(argv['live-root']) })
    objects.push(...r.objects)
    notes.push(
      `live-assets: ${r.objects.length} objects, ${r.missing.length} listed but absent, ${r.quarantined} quarantined`,
    )
  } else {
    notes.push(
      `live-assets: ${argv.manifest} not found (the WordPress origin is gone; the crawl cannot be rebuilt), set skipped`,
    )
  }
}

objects = dedupe(objects)
if (argv.limit) objects = objects.slice(0, Number(argv.limit))

const summary = summarize(objects)
log(`r2-promote: ${APPLY ? 'APPLY' : 'DRY RUN'}${VERIFY && APPLY ? ' + verify' : ''}`)
log(`  bucket ${bucketName() || '(unset)'}  base ${publicBaseFor(env)}`)
for (const n of notes) log(`  ${n}`)
for (const [source, s] of Object.entries(summary.bySource)) {
  log(`  ${source.padEnd(12)} ${String(s.count).padStart(5)} objects  ${mb(s.bytes)}`)
}
log(`  total        ${String(summary.count).padStart(5)} objects  ${mb(summary.bytes)}`)

// ---------------------------------------------------------------------------
// Upload, verify
// ---------------------------------------------------------------------------

const results = []
let failed = 0

async function promote(o) {
  const entry = { source: o.source, key: o.key, bytes: o.bytes, contentType: o.contentType }
  if (!APPLY) {
    entry.status = 'planned'
    return entry
  }
  try {
    const body = readFileSync(o.file)
    const put = await r2Put(o.key, body, { contentType: o.contentType, ifNoneMatch: true })
    entry.status = put.skipped ? 'existed' : 'uploaded'
    if (VERIFY) {
      const head = await r2Head(o.key)
      if (!head.exists) throw new Error('HEAD after PUT: object not found')
      if (head.contentLength !== o.bytes)
        throw new Error(`HEAD after PUT: ${head.contentLength} bytes stored, ${o.bytes} local`)
      entry.verified = true
      entry.etag = head.etag
    }
  } catch (err) {
    failed += 1
    entry.status = 'failed'
    entry.error = String(err?.message ?? err).slice(0, 300)
  }
  return entry
}

async function pool(items, size, fn) {
  let i = 0
  let done = 0
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      results.push(await fn(item))
      done += 1
      if (APPLY && (done % 50 === 0 || done === items.length))
        log(`  ${done}/${items.length} (${failed} failed)`)
    }
  })
  await Promise.all(workers)
}

await pool(objects, Number(argv.concurrency), promote)

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

const promotedProductKeys = results
  .filter((r) => r.source === 'products' && (APPLY ? r.status !== 'failed' : true))
  .map((r) => r.key)

const ledger = {
  generated_at: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'dry-run',
  verify: APPLY ? VERIFY : false,
  bucket: bucketName() || null,
  base: publicBaseFor(env),
  credentials: creds,
  notes,
  summary,
  failed,
  objects: results.sort((a, b) => a.key.localeCompare(b.key)),
}
mkdirSync(dirname(resolve(argv.out)), { recursive: true })
writeFileSync(resolve(argv.out), `${JSON.stringify(ledger, null, 2)}\n`)

const sql = rewriteSql({
  base: publicBaseFor(env),
  bucket: bucketName() || 'R2_BUCKET',
  productKeys: promotedProductKeys,
})
mkdirSync(dirname(resolve(argv['sql-out'])), { recursive: true })
writeFileSync(
  resolve(argv['sql-out']),
  `${APPLY ? '' : '-- DRY RUN: generated without an upload; do not apply.\n'}${sql}`,
)

log(`  ledger  ${argv.out}`)
log(`  sql     ${argv['sql-out']} (${promotedProductKeys.length} product rewrites, not applied)`)

if (argv.apply && !creds.ok) process.exit(2)
if (failed > 0) {
  log(`r2-promote: ${failed} object(s) failed; re-run is safe (If-None-Match skips what landed)`)
  process.exit(1)
}
log(APPLY ? 'r2-promote: done' : 'r2-promote: dry run clean')
