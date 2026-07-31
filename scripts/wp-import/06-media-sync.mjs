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
import { readNormalized } from './02-transform.mjs'
import { DEFAULTS, DRY_RUN, PATHS, RUN, dryRunReason } from './config.mjs'
import { getDb } from './lib/db.mjs'
import { fetchBytes } from './lib/http.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'
import { isR2Configured, r2Key, r2PublicUrl, r2Put } from './lib/r2.mjs'

// Derivatives per source image.
//
// The three webp sizes exist so `next/image` has real candidates to put in a
// srcset. With only a 1600px original, a 320px-wide cart thumbnail downloads
// the full image and scales it in the browser: the layout looks right and the
// page weight is wrong, which is the failure mode nobody notices until Core
// Web Vitals are already red.
//
// `og` is the social card at a fixed 1200x630, because that is what every
// scraper crops to and cropping it ourselves beats letting them do it.
//
// `og.jpg` is not redundant with `og.webp`. WhatsApp is where a deal actually
// gets shared in this market, and some versions of its link preview do not
// render webp: the share silently loses its image. A jpeg costs a few KB of
// storage per image and removes the doubt.
const DERIVATIVES = [
  { suffix: '', width: 1600, height: null, fit: 'inside', quality: 80, format: 'webp' },
  { suffix: '.card', width: 800, height: null, fit: 'inside', quality: 80, format: 'webp' },
  { suffix: '.thumb', width: 320, height: null, fit: 'inside', quality: 75, format: 'webp' },
  { suffix: '.og', width: 1200, height: 630, fit: 'cover', quality: 80, format: 'webp' },
  { suffix: '.og', width: 1200, height: 630, fit: 'cover', quality: 82, format: 'jpeg' },
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

const extOf = (d) => (d.format === 'jpeg' ? 'jpg' : 'webp')
const mimeOf = (d) => (d.format === 'jpeg' ? 'image/jpeg' : 'image/webp')
/** Stable identity of a derivative: suffix alone collides between og.webp and og.jpg. */
const idOf = (d) => `${d.suffix || 'main'}.${extOf(d)}`

function cachePath(hash, derivative) {
  return resolve(PATHS.media, `${hash}${derivative.suffix}.${extOf(derivative)}`)
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
function storageKey(hash, derivative) {
  return r2Key(hash, derivative.suffix, extOf(derivative))
}

function publicUrl(bucket, key) {
  // R2 wins when it is configured. It is the target of record: no egress
  // charge, and R2_PUBLIC_BASE_URL puts the images on cdn.kenyonexpress.co.il
  // rather than on a Supabase project ref, so replacing the Supabase project
  // (which ARCHITECTURE-OPS plans for) does not break every image URL already
  // written into products.images.
  if (isR2Configured()) return r2PublicUrl(key)
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  if (!base) return null
  return `${base}/storage/v1/object/public/${bucket}/${key}`
}

async function convert(buffer, derivative) {
  const lib = await getSharp()
  if (!lib) return { buffer, width: null, height: null }
  const pipeline = lib(buffer).rotate() // honour EXIF orientation before stripping it
  if (derivative.height) {
    pipeline.resize(derivative.width, derivative.height, {
      fit: derivative.fit,
      withoutEnlargement: true,
    })
  } else {
    pipeline.resize({ width: derivative.width, fit: derivative.fit, withoutEnlargement: true })
  }
  const encoded =
    derivative.format === 'jpeg'
      ? pipeline.jpeg({ quality: derivative.quality, mozjpeg: true })
      : pipeline.webp({ quality: derivative.quality })
  const out = await encoded.toBuffer({ resolveWithObject: true })
  return { buffer: out.data, width: out.info.width, height: out.info.height }
}

/**
 * One object to whichever backend is configured.
 *
 * R2 first. Supabase Storage stays as the fallback so a run without R2 env
 * still works end to end, which is what keeps local development from needing
 * Cloudflare credentials.
 */
async function upload(db, bucket, key, buffer, contentType) {
  if (isR2Configured()) {
    const { skipped } = await r2Put(key, buffer, { contentType })
    return skipped ? 'exists' : 'uploaded'
  }
  const { error } = await db.storage.from(bucket).upload(key, buffer, {
    contentType,
    // content-addressed keys mean an overwrite is always byte-identical
    upsert: true,
    cacheControl: '31536000',
  })
  if (error) throw new Error(`storage upload ${key} failed: ${error.message}`)
  return 'uploaded'
}

export async function mediaSync(run) {
  const db = await getDb()
  if (DRY_RUN)
    warn(`dry run: bytes will be fetched and converted, nothing uploaded (${dryRunReason()})`)
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
          stage: 'media_sync',
          entity: 'media',
          wpId: item.wp_attachment_id,
          action: 'skip',
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
          const cache = cachePath(hash, derivative)
          let converted
          if (existsSync(cache)) {
            // a previous run already produced these exact bytes
            converted = { buffer: readFileSync(cache), width: null, height: null }
          } else {
            converted = await convert(buffer, derivative)
            writeFileSync(cache, converted.buffer)
          }
          derived[idOf(derivative)] = converted
        }
        byHash.set(hash, derived)
      } else {
        run.count('media_sync.dedup_hit')
      }

      const keys = Object.fromEntries(DERIVATIVES.map((d) => [idOf(d), storageKey(hash, d)]))

      if (!DRY_RUN && (db || isR2Configured()) && !uploaded.has(hash)) {
        for (const d of DERIVATIVES) {
          const id = idOf(d)
          const outcome = await upload(
            db,
            item.bucket || DEFAULTS.imageBucket,
            keys[id],
            derived[id].buffer,
            mimeOf(d),
          )
          if (outcome === 'exists') run.count('media_sync.already_in_storage')
        }
        uploaded.add(hash)
      }

      const main = derived[idOf(DERIVATIVES[0])]

      const bucket = item.bucket || DEFAULTS.imageBucket
      const url = (id) => publicUrl(bucket, keys[id])

      const row = {
        ...item,
        sha256: hash,
        byte_size: byteSize,
        mime_type: item.mime_type || contentType || null,
        width: main.width ?? item.width,
        height: main.height ?? item.height,
        status: DRY_RUN ? 'downloaded' : 'uploaded',
        storage_path: keys['main.webp'],
        og_storage_path: keys['.og.webp'],
        new_url: url('main.webp'),
        // The next/image-ready set. 04-project-public writes these straight
        // into products.images, so a card renders an 800px file and a cart
        // thumbnail a 320px one instead of every slot pulling the 1600px
        // original and scaling it in the browser.
        card_url: url('.card.webp'),
        thumb_url: url('.thumb.webp'),
        og_url: url('.og.webp'),
        og_jpg_url: url('.og.jpg'),
        error: null,
      }
      results.push(row)
      run.op({
        stage: 'media_sync',
        entity: 'media',
        wpId: item.wp_attachment_id,
        action: DRY_RUN ? 'noop' : 'update',
        targetTable: 'wp_import.media',
        after: { sha256: hash, storage_path: keys['main.webp'] },
        durationMs: Date.now() - started,
      })
    } catch (err) {
      results.push({ ...item, status: 'failed', error: err.message })
      run.fail('media_sync', 'media', item.wp_attachment_id, 'media_failed', err)
    }
  }

  // The media inventory is rewritten in place so the projection stage picks up
  // new_url and sha256 on its next run without a separate handoff file.
  writeFileSync(resolve(PATHS.normalized, 'media.json'), `${JSON.stringify(results, null, 2)}\n`)

  if (!DRY_RUN && db) {
    const columns = [
      'wp_attachment_id',
      'sha256',
      'byte_size',
      'mime_type',
      'width',
      'height',
      'status',
      'bucket',
      'storage_path',
      'og_storage_path',
      'new_url',
      'error',
    ]
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
  info(
    `  media         ${String(done).padStart(6)} ${DRY_RUN ? 'fetched + converted' : 'uploaded'}, ${failed} failed, ${skipped} skipped`,
  )
  if (byHash.size < done) {
    info(
      `  dedup         ${done - byHash.size} duplicate images collapsed by sha256 (${byHash.size} distinct objects)`,
    )
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
