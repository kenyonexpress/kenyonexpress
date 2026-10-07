// The pending set of the R2 promotion, and the SQL that follows it.
//
// Three local sets wait to be re-homed to R2, each with its own origin story
// and its own key layout, and none of them has moved because R2 has never
// answered from this machine (403 code 10042 on 2026-09-06, placeholder
// credentials in the Vercel project on 2026-10-06). This module enumerates
// them, pure and testable, so `run.mjs` is only the network.
//
//   live-assets   refs/live-assets/<manifest>: the crawl of the live WordPress
//                 site. Kept assets plus their _derived/ renditions, keyed
//                 under `live-assets/<wp path>` exactly as upload-r2.mjs did.
//   cdn           public/images/cdn/: what media-ingest stored locally when R2
//                 refused. Keys are content-addressed (`wp/<aa>/<sha256>...`)
//                 and are kept VERBATIM, which is the whole point of the local
//                 fallback: promotion changes the host and nothing else.
//   products      public/images/products/: the files `products.images` points
//                 at in production today (same-origin `/images/products/X`).
//                 Keyed under `products/X` so the rewrite is a prefix swap.
//
// Every object is uploaded once (If-None-Match) and the rewrite SQL is
// idempotent, so a crashed run is re-run, not repaired.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export const CONTENT_TYPE = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

export function contentTypeFor(file) {
  return CONTENT_TYPE[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Where media-ingest's local fallback mounts its keys (lib/store.mjs). */
export const LOCAL_CDN_PREFIX = '/images/cdn/'
export const LOCAL_PRODUCTS_PREFIX = '/images/products/'

// ---------------------------------------------------------------------------
// Credentials: present, absent, or the harness placeholder
// ---------------------------------------------------------------------------

/**
 * The literal the agent harness substitutes for a redacted secret. On
 * 2026-10-06 `vercel env pull` of the production project returned this exact
 * string for all four R2_* variables (and 28 others), because they were added
 * from a shell that had the placeholders exported. A value that is "set" and
 * useless has to be named, or every `if (!env.X)` guard waves it through and
 * the failure surfaces as SignatureDoesNotMatch twenty minutes later.
 */
export const PLACEHOLDER_SECRET = '[SENSITIVE]'

export const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']

export function bucketFromEnv(env) {
  return env.R2_BUCKET || env.R2_BUCKET_NAME || ''
}

/** The same-origin route that signs a GET against the bucket (src/app/images/r2). */
export const PROXY_BASE = '/images/r2'

/**
 * Where a promoted key is addressed from. `R2_PUBLIC_BASE_URL` when the bucket
 * has a public domain; otherwise the signed proxy route, NEVER the r2.dev
 * guess: a bucket with no public access answers nothing on r2.dev, and a
 * rewrite to it would move every product image from "served" to "404" in one
 * statement. The proxy works with API credentials alone, which is the only
 * thing a bucket is guaranteed to have.
 */
export function publicBaseFor(env) {
  const base = (env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  if (base && base !== PLACEHOLDER_SECRET) return base
  return PROXY_BASE
}

export function credentialState(env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name])
  if (!bucketFromEnv(env)) missing.push('R2_BUCKET (or R2_BUCKET_NAME)')
  const placeholders = [...REQUIRED_ENV, 'R2_BUCKET', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL']
    .filter((name) => env[name] === PLACEHOLDER_SECRET)
    .sort()
  return { ok: missing.length === 0 && placeholders.length === 0, missing, placeholders }
}

// ---------------------------------------------------------------------------
// The three sets
// ---------------------------------------------------------------------------

function object(source, key, file) {
  return { source, key, file, bytes: statSync(file).size, contentType: contentTypeFor(file) }
}

/**
 * Kept live assets and the derivatives that exist on disk. Quarantined
 * assets (the Electro demo kit) are never uploaded; a derivative the manifest
 * lists but the crawl did not write (268 listed, 226 on disk on 2026-10-06)
 * is reported in `missing` rather than silently dropped.
 */
export function liveAssetObjects({ manifest, root, prefix = 'live-assets/' }) {
  const objects = []
  const missing = []
  let quarantined = 0
  for (const asset of manifest.assets ?? []) {
    if (asset.quarantined) {
      quarantined += 1
      continue
    }
    if (asset.error) continue
    const source = join(root, asset.path)
    if (existsSync(source)) objects.push(object('live-assets', prefix + asset.path, source))
    else missing.push(asset.path)
    for (const d of asset.derivatives ?? []) {
      const rel = `${asset.path.replace(/\.[^.]+$/, '')}.${d.width}.${d.format}`
      const derived = join(root, '_derived', rel)
      if (existsSync(derived)) objects.push(object('live-assets', prefix + rel, derived))
      else missing.push(`_derived/${rel}`)
    }
  }
  return { objects, missing, quarantined }
}

const URL_COLUMNS = ['public_url', 'card_url', 'thumb_url', 'og_url', 'og_jpg_url']

/**
 * The locally stored derivatives of every ingested ledger row. One object per
 * distinct key: the ledger is per source URL and several source URLs share a
 * sha256, so the same five files are named more than once.
 */
export function ledgerObjects({ rows, localRoot }) {
  const objects = []
  const missing = []
  const seen = new Set()
  let localRows = 0
  for (const row of rows) {
    if (row.status !== 'ingested' || row.storage !== 'local') continue
    localRows += 1
    for (const column of URL_COLUMNS) {
      const url = row[column]
      if (typeof url !== 'string' || !url.startsWith(LOCAL_CDN_PREFIX)) continue
      const key = url.slice(LOCAL_CDN_PREFIX.length)
      if (seen.has(key)) continue
      seen.add(key)
      const file = resolve(localRoot, key)
      if (existsSync(file)) objects.push(object('cdn', key, file))
      else missing.push(key)
    }
  }
  return { objects, missing, localRows }
}

export function listFilesRecursive(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFilesRecursive(full))
    else if (entry.isFile() && !entry.name.startsWith('.')) out.push(full)
  }
  return out.sort()
}

/** Every file under public/images/products, keyed `products/<relative path>`. */
export function productImageObjects({ dir, prefix = 'products/' }) {
  const objects = listFilesRecursive(dir).map((file) =>
    object('products', prefix + relative(dir, file).split('\\').join('/'), file),
  )
  return { objects }
}

/** First key wins; the sets are disjoint by prefix, so this only guards a bad flag. */
export function dedupe(objects) {
  const seen = new Set()
  return objects.filter((o) => {
    if (seen.has(o.key)) return false
    seen.add(o.key)
    return true
  })
}

export function summarize(objects) {
  const bySource = {}
  let bytes = 0
  for (const o of objects) {
    bySource[o.source] = bySource[o.source] ?? { count: 0, bytes: 0 }
    bySource[o.source].count += 1
    bySource[o.source].bytes += o.bytes
    bytes += o.bytes
  }
  return { count: objects.length, bytes, bySource }
}

// ---------------------------------------------------------------------------
// The rewrite: same-origin paths become CDN URLs
// ---------------------------------------------------------------------------

const q = (v) => `'${String(v).replace(/'/g, "''")}'`

/**
 * SQL that moves the database's pointers after the bytes have moved. No
 * BEGIN/COMMIT on purpose: the management API runs the whole text in one
 * session and an inner COMMIT would defeat a BEGIN/ROLLBACK rehearsal wrapped
 * around it (docs/RUNBOOK.md, production-sql recipe). Every statement is a
 * no-op the second time, so applying twice is safe.
 *
 * `base` is the public origin of the bucket (R2_PUBLIC_BASE_URL or the r2.dev
 * fallback), without a trailing slash. `productKeys` are the `products/...`
 * keys that were uploaded; only those paths are rewritten, so a file that was
 * never promoted keeps pointing at the same-origin copy.
 */
export function rewriteSql({ base, bucket, productKeys = [], productsPrefix = 'products/' }) {
  const origin = base.replace(/\/$/, '')
  const lines = [
    '-- r2-promote rewrite: same-origin image paths -> R2 public URLs.',
    `-- base ${origin}, bucket ${bucket}. Idempotent; no transaction wrapper by design.`,
    '',
  ]

  // products.images: one statement per promoted file. jsonb has no replace,
  // so the array is round-tripped through text with the quotes included in
  // the needle, which pins the match to a whole array element.
  for (const key of [...productKeys].sort()) {
    if (!key.startsWith(productsPrefix)) continue
    const local = LOCAL_PRODUCTS_PREFIX + key.slice(productsPrefix.length)
    const remote = `${origin}/${key}`
    lines.push(
      `update public.products set images = replace(images::text, ${q(`"${local}"`)}, ${q(`"${remote}"`)})::jsonb`,
      `  where images::text like ${q(`%"${local}"%`)};`,
    )
  }

  // The ingest ledger and anything that copied its local URLs: a prefix swap,
  // because the keys under /images/cdn/ are the R2 keys verbatim.
  lines.push(
    '',
    'update public.media_ingest_queue set',
    `  storage = 'r2', bucket = ${q(bucket)},`,
    ...URL_COLUMNS.map(
      (c, i) =>
        `  ${c} = replace(${c}, ${q(LOCAL_CDN_PREFIX)}, ${q(`${origin}/`)})${i === URL_COLUMNS.length - 1 ? '' : ','}`,
    ),
    `  where storage = 'local' and public_url like ${q(`${LOCAL_CDN_PREFIX}%`)};`,
    '',
    `update public.products set images = replace(images::text, ${q(`"${LOCAL_CDN_PREFIX}`)}, ${q(`"${origin}/`)})::jsonb`,
    `  where images::text like ${q(`%"${LOCAL_CDN_PREFIX}%`)};`,
    '',
    `update public.media_assets set url = replace(url, ${q(LOCAL_CDN_PREFIX)}, ${q(`${origin}/`)}), provider = 'r2', bucket = ${q(bucket)}`,
    `  where url like ${q(`${LOCAL_CDN_PREFIX}%`)};`,
    '',
  )
  return lines.join('\n')
}
