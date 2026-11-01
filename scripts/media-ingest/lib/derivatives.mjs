// The derivative family and cache layout of 06-media-sync, importable.
//
// Same sizes, same suffixes, same `wp_import/media/<sha256><suffix>.<ext>`
// cache filenames. That compatibility is not cosmetic: the 06 dry run of
// August is the ONLY remaining copy of 66 images whose origin has since died,
// and this module reading that cache byte-for-byte is what makes them
// ingestable at all. (06 keeps its own private copy of this table; the two
// must not drift, and the test pins the filenames.)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const DERIVATIVES = [
  { suffix: '', width: 1600, height: null, fit: 'inside', quality: 80, format: 'webp' },
  { suffix: '.card', width: 800, height: null, fit: 'inside', quality: 80, format: 'webp' },
  { suffix: '.thumb', width: 320, height: null, fit: 'inside', quality: 75, format: 'webp' },
  { suffix: '.og', width: 1200, height: 630, fit: 'cover', quality: 80, format: 'webp' },
  { suffix: '.og', width: 1200, height: 630, fit: 'cover', quality: 82, format: 'jpeg' },
]

export const extOf = (d) => (d.format === 'jpeg' ? 'jpg' : 'webp')
export const mimeOf = (d) => (d.format === 'jpeg' ? 'image/jpeg' : 'image/webp')
/** Stable identity of a derivative: suffix alone collides between og.webp and og.jpg. */
export const idOf = (d) => `${d.suffix || 'main'}.${extOf(d)}`

export function cachePath(cacheDir, hash, derivative) {
  return resolve(cacheDir, `${hash}${derivative.suffix}.${extOf(derivative)}`)
}

/** True when every derivative of `hash` is already sitting in the cache. */
export function cacheComplete(cacheDir, hash) {
  return DERIVATIVES.every((d) => existsSync(cachePath(cacheDir, hash, d)))
}

let sharp
async function getSharp() {
  if (sharp === undefined) sharp = (await import('sharp')).default
  return sharp
}

async function convert(buffer, derivative) {
  const lib = await getSharp()
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
 * All five derivatives of one source image, cache-first.
 *
 * `originalBuffer` may be null when the cache is already complete -- that is
 * the dead-origin path, where there are no original bytes to convert from.
 * Returns a map keyed by idOf, values { buffer, width, height } (dimensions
 * null for cache hits; the cache stores bytes, not metadata).
 */
export async function deriveAll(cacheDir, hash, originalBuffer) {
  const derived = {}
  for (const derivative of DERIVATIVES) {
    const cache = cachePath(cacheDir, hash, derivative)
    if (existsSync(cache)) {
      derived[idOf(derivative)] = { buffer: readFileSync(cache), width: null, height: null }
      continue
    }
    if (!originalBuffer) {
      throw new Error(
        `derivative ${idOf(derivative)} of ${hash} is not cached and there are no original bytes`,
      )
    }
    const converted = await convert(originalBuffer, derivative)
    writeFileSync(cache, converted.buffer)
    derived[idOf(derivative)] = converted
  }
  return derived
}
