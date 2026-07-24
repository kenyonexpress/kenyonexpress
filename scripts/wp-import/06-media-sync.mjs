// Stage 6: media sync. Download, dedupe, convert and upload every attachment.
//
// This is the slowest stage and the one most likely to be interrupted, so it
// is content-addressed end to end: the storage key embeds the sha256 of the
// original bytes. A crashed run recomputes the same keys and overwrites the
// same objects. Re-running is always safe and mostly free.
//
// In a dry run everything except the upload and the DB write still happens:
// bytes are fetched, hashed and converted locally. That is deliberate. It is
// how you find out that 300 attachments 404 on the old site BEFORE cutover
// day rather than during it.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULTS, DRY_RUN, PATHS, RUN, dryRunReason } from './config.mjs'
import { readNormalized } from './02-transform.mjs'
import { fetchBytes } from './lib/http.mjs'
import { getDb } from './lib/db.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'

// Derivatives we generate per image. `og` is the social card: fixed 1200x630
// because that is what every scraper crops to anyway, and letting them crop
// produces worse results than cropping ourselves.
const DERIVATIVES = [
  { suffix: '', width: 1600, height: null, fit: 'inside', quality: 80 },
  { suffix: '.og', width: 1200, height: 630, fit: 'cover', quality: 80 },
]

let sharp
async function getSharp() {
  if (sharp !== undefined) return sharp
  try {
    sharp = (await import('sharp')).default
  } catch (err) {
    warn(`sharp unavailable (${err.message}) - images will be uploaded unconverted`)
    sharp = null
  }
  return sharp
}

function cachePath(hash, suffix) {
  return resolve(PATHS.media, `${hash}${suffix}.webp`)
}

/**
 * Content-addressed, and deliberately NOT prefixed by the product id.
 *
 * A per-product prefix would store the same bytes once per product that uses
 * them: the sha256 dedup would save conversion work and save nothing at all on
 * upload time or storage. Keying purely on the hash means an image shared by
 * forty products is uploaded once. The two-character shard keeps the bucket
 * from becoming one directory with 40k entries.
 *
 * The consequence is that an object can be referenced by several products, so
 * deleting one product must never delete its objects. Storage GC is a separate
 * sweep over hashes no live row references (see 052 fn_rollback_batch).
 */
function storageKey(hash, suffix) {
  return `wp/${hash.slice(0, 2)}/${hash}${suffix}.webp`
}

function publicUrl(bucket, key) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  if (!base) return null
  return `${base}/storage/v1/object/public/${bucket}/${key}`
}

async function convert(buffer, derivative) {
  const lib = await getSharp()
  if (!lib) return { buffer, width: null, height: null }
  const pipeline = lib(buffer).rotate() // honour EXIF orientation before stripping it
  if (derivative.height) {
    pipeline.resize(derivative.width, derivative.height, { fit: derivative.fit, withoutEnlargement: true })
  } else {
    pipeline.resize({ width: derivative.width, fit: derivative.fit, withoutEnlargement: true })
  }
  const out = await pipeline.webp({ quality: derivative.quality }).toBuffer({ resolveWithObject: true })
  return { buffer: out.data, width: out.info.width, height: out.info.height }
}

async function upload(db, bucket, key, buffer) {
  const { error } = await db.storage.from(bucket).upload(key, buffer, {
    contentType: 'image/webp',
    // content-addressed keys mean an overwrite is always byte-identical
    upsert: true,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`storage upload ${key} failed: ${error.message}`)
}

export async function mediaSync(run) {
  const db = await getDb()
  if (DRY_RUN) warn(`dry run: bytes will be fetched and converted, nothing uploaded (${dryRunReason()})`)
  mkdirSync(PATHS.media, { recursive: true })

  const media = readNormalized('media')
  if (media.length === 0) {
    info('  no media inventory: run transform first')
    return []
  }

  // hash -> converted derivatives, and the set already pushed to storage this
  // run. Shared images across products convert once and upload once.
  const byHash = new Map()
  const uploaded = new Set()
  const results = []
  const limited = RUN.limit ? media.slice(0, RUN.limit) : media

  for (const item of limited) {
    const started = Date.now()
    try {
      if (!item.source_url) {
        run.op({
          stage: 'media_sync', entity: 'media', wpId: item.wp_attachment_id, action: 'skip',
          errorCode: 'no_source_url',
        })
        results.push({ ...item, status: 'skipped', error: 'no source url' })
        continue
      }

      const { buffer, byteSize, contentType } = await fetchBytes(item.source_url)
      const hash = createHash('sha256').update(buffer).digest('hex')

      let derived = byHash.get(hash)
      if (!derived) {
        derived = {}
        for (const derivative of DERIVATIVES) {
          const cache = cachePath(hash, derivative.suffix)
          let converted
          if (existsSync(cache)) {
            // a previous run already produced these exact bytes
            converted = { buffer: readFileSync(cache), width: null, height: null }
          } else {
            converted = await convert(buffer, derivative)
            writeFileSync(cache, converted.buffer)
          }
          derived[derivative.suffix || 'main'] = converted
        }
        byHash.set(hash, derived)
      } else {
        run.count('media_sync.dedup_hit')
      }

      const key = storageKey(hash, '')
      const ogKey = storageKey(hash, '.og')

      if (!DRY_RUN && db && !uploaded.has(hash)) {
        await upload(db, item.bucket || DEFAULTS.imageBucket, key, derived.main.buffer)
        await upload(db, item.bucket || DEFAULTS.imageBucket, ogKey, derived['.og'].buffer)
        uploaded.add(hash)
      }

      const row = {
        ...item,
        sha256: hash,
        byte_size: byteSize,
        mime_type: item.mime_type || contentType || null,
        width: derived.main.width ?? item.width,
        height: derived.main.height ?? item.height,
        status: DRY_RUN ? 'downloaded' : 'uploaded',
        storage_path: key,
        og_storage_path: ogKey,
        new_url: publicUrl(item.bucket || DEFAULTS.imageBucket, key),
        error: null,
      }
      results.push(row)
      run.op({
        stage: 'media_sync', entity: 'media', wpId: item.wp_attachment_id,
        action: DRY_RUN ? 'noop' : 'update',
        targetTable: 'wp_import.media', after: { sha256: hash, storage_path: key },
        durationMs: Date.now() - started,
      })
    } catch (err) {
      results.push({ ...item, status: 'failed', error: err.message })
      run.fail('media_sync', 'media', item.wp_attachment_id, 'media_failed', err)
    }
  }

  // The media inventory is rewritten in place so the projection stage picks up
  // new_url and sha256 on its next run without a separate handoff file.
  writeFileSync(
    resolve(PATHS.normalized, 'media.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  )

  if (!DRY_RUN && db) {
    const columns = ['wp_attachment_id', 'sha256', 'byte_size', 'mime_type', 'width', 'height',
      'status', 'bucket', 'storage_path', 'og_storage_path', 'new_url', 'error']
    const rows = results.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: err } = await db
        .schema('wp_import')
        .from('media')
        .upsert(rows.slice(i, i + 500), { onConflict: 'wp_attachment_id' })
      if (err) warn(`media upsert failed: ${err.message}`)
    }
  }

  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const done = results.length - failed - skipped
  info(`  media         ${String(done).padStart(6)} ${DRY_RUN ? 'fetched + converted' : 'uploaded'}, ${failed} failed, ${skipped} skipped`)
  if (byHash.size < done) {
    info(`  dedup         ${done - byHash.size} duplicate images collapsed by sha256 (${byHash.size} distinct objects)`)
  }

  await run.flush(db)
  ok(`media sync ${DRY_RUN ? 'planned' : 'applied'}`)
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'media_sync' })
  await mediaSync(run)
  process.stdout.write(run.summary())
}
