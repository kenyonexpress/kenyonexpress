// Media ingest: every waiting image, into storage the platform controls.
//
//   node scripts/media-ingest/run.mjs [--limit N] [--out <json>]
//
// The waiting set is the union of two lists with different fates:
//
//   1. The WXR export's image attachments (398 distinct URLs). Their origin is
//      dead -- kenyonexpress.co.il serves the Next.js build now and
//      /wp-content/* answers 403 -- so the only ingestable ones are those whose
//      derivatives the 06-media-sync dry run cached under wp_import/media
//      before the cutover (66 URLs, 65 distinct sha256). The rest are recorded
//      `unreachable`, with a small probe (not 332 doomed requests against the
//      production domain, which challenges busy clients) as the evidence.
//
//   2. Catalogue rows whose URL sits on a third-party host
//      (wp_import/normalized/catalogue-images.json, exported from
//      products.images: 45 picsum.photos + 4 images.unsplash.com). Those hosts
//      are alive; the bytes are fetched, hashed and converted here.
//
// Storage is R2 first with the sticky local fallback of lib/store.mjs: the
// run that produced the initial ledger stored everything under
// public/images/cdn/ because R2 is not enabled on the Cloudflare account
// (403, code 10042). Re-running after Ofir enables R2 re-uses every cached
// derivative and merely re-homes the objects.
//
// Output: wp_import/normalized/media-ingest-results.json (the ledger rows)
// and media-ingest-upsert.sql next to it (the same rows as batched upserts
// for media_ingest_queue, applied through Supabase MCP -- this machine holds
// no service key, so the script never talks to the database itself).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isR2Configured, r2Key, r2PublicUrl, r2Put } from '../wp-import/lib/r2.mjs'
import { DERIVATIVES, cacheComplete, deriveAll, extOf, idOf, mimeOf } from './lib/derivatives.mjs'
import { localUrlForKey, makeStore } from './lib/store.mjs'
import { imageAttachmentsFromWxr } from './lib/wxr-images.mjs'

const { values: argv } = parseArgs({
  options: {
    wxr: { type: 'string', default: 'data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml' },
    catalogue: { type: 'string', default: 'wp_import/normalized/catalogue-images.json' },
    prev: { type: 'string', default: 'wp_import/normalized/media.json' },
    cache: { type: 'string', default: 'wp_import/media' },
    'local-root': { type: 'string', default: 'public/images/cdn' },
    out: { type: 'string', default: 'wp_import/normalized/media-ingest-results.json' },
    limit: { type: 'string' },
    'probe-dead': { type: 'string', default: '5' },
  },
})

const log = (line) => process.stdout.write(`${line}\n`)

// ---------------------------------------------------------------------------
// The waiting set
// ---------------------------------------------------------------------------

const wxrItems = imageAttachmentsFromWxr(readFileSync(resolve(argv.wxr), 'utf8'))

const catalogueItems = existsSync(resolve(argv.catalogue))
  ? JSON.parse(readFileSync(resolve(argv.catalogue), 'utf8'))
  : []

// source_url -> {sha256, byte_size, mime_type} from the August dry run. This
// is the bridge to the cached derivatives of images whose origin is gone.
const prev = new Map(
  (existsSync(resolve(argv.prev)) ? JSON.parse(readFileSync(resolve(argv.prev), 'utf8')) : [])
    .filter((r) => r.sha256)
    .map((r) => [r.source_url, r]),
)

let items = [...wxrItems, ...catalogueItems]
if (argv.limit) items = items.slice(0, Number(argv.limit))

// ---------------------------------------------------------------------------
// Fetching. Modest and polite: 4 in flight, 20s timeout, one retry on 5xx.
// ---------------------------------------------------------------------------

async function fetchBytes(url) {
  let lastErr
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'image/*,*/*' },
        signal: AbortSignal.timeout(20_000),
        redirect: 'follow',
      })
      if (!res.ok) {
        const err = new Error(`${res.status} for ${url}`)
        if (res.status >= 500 && attempt === 0) {
          lastErr = err
          continue
        }
        throw err
      }
      const buffer = Buffer.from(await res.arrayBuffer())
      return { buffer, contentType: res.headers.get('content-type') || '' }
    } catch (err) {
      if (attempt === 0 && (err.name === 'TimeoutError' || /fetch failed/.test(err.message))) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// The dead-origin probe: measure, then stop hitting the domain.
// ---------------------------------------------------------------------------

const DEAD_HOST = 'kenyonexpress.co.il'
let deadOriginConfirmed = false

async function probeDeadOrigin(urls) {
  const sample = urls.slice(0, Number(argv['probe-dead']))
  if (sample.length === 0) return
  let refused = 0
  for (const url of sample) {
    try {
      await fetchBytes(url)
      return // one success falsifies the theory; fetch normally
    } catch (err) {
      if (/\b40[34]\b/.test(err.message)) refused += 1
    }
  }
  deadOriginConfirmed = refused === sample.length
  if (deadOriginConfirmed) {
    log(
      `origin probe: ${refused}/${sample.length} wp-content URLs answered 403/404 -- marking uncached WXR attachments unreachable without further requests`,
    )
  }
}

// ---------------------------------------------------------------------------
// One item through the pipe
// ---------------------------------------------------------------------------

const cacheDir = resolve(argv.cache)
mkdirSync(cacheDir, { recursive: true })
const store = makeStore({
  r2: { isR2Configured, r2Put, r2PublicUrl },
  localRoot: resolve(argv['local-root']),
  log,
})

const uploadedHashes = new Set()

async function ingest(item) {
  const known = prev.get(item.source_url)
  let hash = known?.sha256 ?? null
  let buffer = null
  let contentType = known?.mime_type ?? null
  let byteSize = known?.byte_size ?? null

  const cached = hash ? cacheComplete(cacheDir, hash) : false
  if (!cached) {
    const onDeadHost = new URL(item.source_url).hostname.endsWith(DEAD_HOST)
    if (onDeadHost && deadOriginConfirmed) {
      return {
        ...item,
        status: 'unreachable',
        error: 'origin gone: kenyonexpress.co.il serves the new site, /wp-content/* answers 403',
      }
    }
    try {
      const fetched = await fetchBytes(item.source_url)
      buffer = fetched.buffer
      contentType = contentType || fetched.contentType
      byteSize = buffer.byteLength
      hash = createHash('sha256').update(buffer).digest('hex')
    } catch (err) {
      const status = /\b40[34]\b/.test(err.message) ? 'unreachable' : 'failed'
      return { ...item, status, error: err.message }
    }
  }

  try {
    const derived = await deriveAll(cacheDir, hash, buffer)
    const results = {}
    if (uploadedHashes.has(hash)) {
      for (const d of DERIVATIVES) {
        const key = r2Key(hash, d.suffix, extOf(d))
        results[idOf(d)] = {
          storage: store.mode,
          key,
          url: store.mode === 'local' ? localUrlForKey(key) : r2PublicUrl(key),
        }
      }
    } else {
      for (const d of DERIVATIVES) {
        const key = r2Key(hash, d.suffix, extOf(d))
        results[idOf(d)] = await store.put(key, derived[idOf(d)].buffer, mimeOf(d))
      }
      uploadedHashes.add(hash)
    }

    const main = results['main.webp']
    return {
      ...item,
      sha256: hash,
      byte_size: byteSize,
      mime_type: contentType || null,
      width: derived['main.webp'].width,
      height: derived['main.webp'].height,
      status: 'ingested',
      storage: main.storage,
      bucket: main.storage === 'r2' ? process.env.R2_BUCKET || null : null,
      storage_path: main.key,
      public_url: main.url,
      card_url: results['.card.webp'].url,
      thumb_url: results['.thumb.webp'].url,
      og_url: results['.og.webp'].url,
      og_jpg_url: results['.og.jpg'].url,
      error: null,
    }
  } catch (err) {
    return { ...item, sha256: hash, status: 'failed', error: err.message }
  }
}

// ---------------------------------------------------------------------------
// SQL emit: the ledger rows as batched upserts for MCP
// ---------------------------------------------------------------------------

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v))

function upsertSql(rows) {
  const chunks = []
  for (let i = 0; i < rows.length; i += 50) {
    const values = rows
      .slice(i, i + 50)
      .map(
        (r) =>
          `(${q(r.source_url)}, ${q(r.source_kind)}, ${n(r.wp_attachment_id)}, ${q(r.sha256)}, ` +
          `${n(r.byte_size)}, ${q(r.mime_type)}, ${n(r.width)}, ${n(r.height)}, ${q(r.status)}, ` +
          `${q(r.storage)}, ${q(r.bucket)}, ${q(r.storage_path)}, ${q(r.public_url)}, ` +
          `${q(r.card_url)}, ${q(r.thumb_url)}, ${q(r.og_url)}, ${q(r.og_jpg_url)}, ` +
          `${q(r.alt_he)}, ${q(r.error)})`,
      )
      .join(',\n')
    chunks.push(
      `insert into public.media_ingest_queue
  (source_url, source_kind, wp_attachment_id, sha256, byte_size, mime_type, width, height,
   status, storage, bucket, storage_path, public_url, card_url, thumb_url, og_url, og_jpg_url,
   alt_he, error)
values
${values}
on conflict (source_url) do update set
  sha256 = excluded.sha256, byte_size = excluded.byte_size, mime_type = excluded.mime_type,
  width = excluded.width, height = excluded.height, status = excluded.status,
  storage = excluded.storage, bucket = excluded.bucket, storage_path = excluded.storage_path,
  public_url = excluded.public_url, card_url = excluded.card_url, thumb_url = excluded.thumb_url,
  og_url = excluded.og_url, og_jpg_url = excluded.og_jpg_url, alt_he = excluded.alt_he,
  error = excluded.error;`,
    )
  }
  return chunks.join('\n\n')
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

const uncachedDead = items.filter(
  (i) =>
    new URL(i.source_url).hostname.endsWith(DEAD_HOST) &&
    !(prev.get(i.source_url)?.sha256 && cacheComplete(cacheDir, prev.get(i.source_url).sha256)),
)
await probeDeadOrigin(uncachedDead.map((i) => i.source_url))

const results = []
for (const item of items) {
  results.push(await ingest(item))
}

const outPath = resolve(argv.out)
writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`)
writeFileSync(outPath.replace(/\.json$/, '-upsert.sql'), `${upsertSql(results)}\n`)

const by = {}
for (const r of results) by[r.status] = (by[r.status] ?? 0) + 1
const byLine = Object.entries(by)
  .map(([s, c]) => `${s} ${c}`)
  .join(', ')
log(
  `ingest: ${results.length} items -> ${byLine} (storage mode at end: ${store.mode}${store.fallbackReason ? `, reason: ${store.fallbackReason}` : ''})`,
)
