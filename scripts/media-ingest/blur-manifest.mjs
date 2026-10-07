/**
 * BUILD-TIME BLUR PLACEHOLDERS FOR THE CATALOGUE'S OWN FILES.
 *
 * WHAT WAS MEASURED BEFORE THIS EXISTED (2026-10-07, production). The product
 * gallery has carried a `placeholder="blur"` path since the media pipeline
 * landed: `media_assets.blur_data_url`, computed by sharp on upload
 * (`src/lib/images/process.ts`). Counted on production: `media_assets` holds
 * ZERO rows. 43 of the 46 active products take their first image from
 * `/images/products/*` under `public/`, which the upload pipeline never saw,
 * so no card and no gallery on the live site has ever painted a blur. The
 * slot was grey until the bytes arrived, on every page.
 *
 * WHY A MANIFEST AND NOT A QUERY. The architecture rule (ARCHITECTURE-
 * PERFORMANCE.md 3.4) is "never compute blur on the request path". These
 * files are static, checked in, and addressed by path, so their placeholders
 * are a build artefact like the files themselves: this script walks the
 * folders the storefront reads from, encodes one tiny WebP per raster, and
 * writes `src/lib/images/blur-manifest.json`, which is committed. Server
 * components read it through `src/lib/images/blur.ts`; client components get
 * one string per image as a prop and never import the JSON (it would be a
 * first-load cost on every route, and the route-JS gate would say so).
 *
 * THE PLACEHOLDER IS 10px WIDE AND NOTHING MORE. next/image wraps a
 * `blurDataURL` in an inline SVG with a 20px Gaussian blur (`getImageBlurSvg`),
 * so the source only has to carry the colour layout; detail is thrown away by
 * the filter. 10px at WebP quality 40 lands at ~120-250 bytes of base64 per
 * image, and that is inline in the HTML of every card that paints it, so the
 * size is a budget, not a taste: `MAX_BLUR_BYTES` below is asserted by the
 * test and by `--check`.
 *
 * `--check` is the lint-time guard. It does not decode anything; it compares
 * the file set on disk with the manifest's keys and fails on a photo that was
 * added without regenerating, or an entry whose file is gone. Encoding runs
 * only on an explicit `pnpm images:blur`.
 *
 * Width and height of the original are recorded next to the blur. They cost
 * nothing to carry and they are the one thing a `fill`-less card needs to
 * reserve the real box instead of a guessed square.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Under `public/`. Recursive. Everything the storefront paints above the fold reads from one of these. */
export const SCANNED_FOLDERS = ['images/products', 'images/categories', 'images/hero']

/** Rasters only; an SVG has no pixels to average and is passed through by the optimizer anyway. */
export const RASTER_EXTENSIONS = new Set(['.avif', '.webp', '.jpg', '.jpeg', '.png'])

/** Pixels across. See the header: the SVG filter supplies the blur, this supplies colour. */
export const BLUR_WIDTH = 10

/** Hard ceiling on one data URL, in bytes of the string. Inline HTML cost per card. */
export const MAX_BLUR_BYTES = 400

export const MANIFEST_RELATIVE = 'src/lib/images/blur-manifest.json'

/**
 * @typedef {{ blur: string, w: number, h: number }} BlurEntry
 * @typedef {Record<string, BlurEntry>} BlurManifest
 */

function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/**
 * Every raster under the scanned folders, as the public URL path it is served
 * at (`/images/products/x.avif`), sorted so the manifest is diff-stable.
 *
 * @param {string} publicDir absolute path of `public/`
 * @returns {string[]}
 */
export function listRasters(publicDir, folders = SCANNED_FOLDERS) {
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && RASTER_EXTENSIONS.has(extensionOf(entry.name))) {
        out.push(`/${relative(publicDir, full).split(sep).join('/')}`)
      }
    }
  }
  for (const folder of folders) walk(join(publicDir, folder))
  return out.sort()
}

/**
 * One raster to its manifest entry. Pure: buffer in, entry out.
 *
 * `.rotate()` with no argument bakes the EXIF orientation into the pixels
 * before the resize, same as the upload pipeline, so a phone photo stored
 * sideways blurs the way it is displayed and `w`/`h` are the displayed axes.
 *
 * @param {Buffer} buffer
 * @returns {Promise<BlurEntry>}
 */
export async function blurEntryFromBuffer(buffer) {
  const base = sharp(buffer).rotate()
  const meta = await base.metadata()
  // `metadata()` reports the stored axes; after `.rotate()` an orientation of
  // 5-8 swaps them. sharp exposes the oriented pair when it knows it.
  const w = meta.autoOrient?.width ?? meta.width ?? 0
  const h = meta.autoOrient?.height ?? meta.height ?? 0
  const blur = await base
    .clone()
    .resize({ width: BLUR_WIDTH, withoutEnlargement: true })
    .webp({ quality: 40, effort: 6 })
    .toBuffer()
  return { blur: `data:image/webp;base64,${blur.toString('base64')}`, w, h }
}

/**
 * @param {string} publicDir
 * @returns {Promise<BlurManifest>}
 */
export async function buildManifest(publicDir, folders = SCANNED_FOLDERS) {
  /** @type {BlurManifest} */
  const manifest = {}
  for (const path of listRasters(publicDir, folders)) {
    const entry = await blurEntryFromBuffer(readFileSync(join(publicDir, path)))
    if (entry.blur.length > MAX_BLUR_BYTES) {
      throw new Error(
        `blur-manifest: ${path} encodes to ${entry.blur.length} bytes, over the ${MAX_BLUR_BYTES} ceiling`,
      )
    }
    manifest[path] = entry
  }
  return manifest
}

/**
 * The lint-time comparison. No decoding: the file set on disk against the
 * keys in the manifest, plus the per-entry byte ceiling.
 *
 * @param {BlurManifest} manifest
 * @param {string[]} rasters output of listRasters
 * @returns {{ missing: string[], stale: string[], oversized: string[] }}
 */
export function diffManifest(manifest, rasters) {
  const keys = new Set(Object.keys(manifest))
  const onDisk = new Set(rasters)
  return {
    missing: rasters.filter((p) => !keys.has(p)),
    stale: [...keys].filter((p) => !onDisk.has(p)),
    oversized: [...keys].filter((p) => (manifest[p]?.blur?.length ?? 0) > MAX_BLUR_BYTES),
  }
}

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

async function main() {
  const root = repoRoot()
  const publicDir = join(root, 'public')
  const manifestPath = join(root, MANIFEST_RELATIVE)
  const check = process.argv.includes('--check')

  if (check) {
    let manifest = {}
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      console.error(
        `blur-manifest: ${MANIFEST_RELATIVE} is missing or unreadable; run pnpm images:blur`,
      )
      process.exit(1)
    }
    const diff = diffManifest(manifest, listRasters(publicDir))
    const problems = diff.missing.length + diff.stale.length + diff.oversized.length
    if (problems > 0) {
      for (const p of diff.missing) console.error(`blur-manifest: no entry for ${p}`)
      for (const p of diff.stale)
        console.error(`blur-manifest: entry for a file that is gone: ${p}`)
      for (const p of diff.oversized)
        console.error(`blur-manifest: entry over ${MAX_BLUR_BYTES} bytes: ${p}`)
      console.error('blur-manifest: run pnpm images:blur and commit the result')
      process.exit(1)
    }
    console.log(`blur-manifest: ${Object.keys(manifest).length} entries match the files on disk`)
    return
  }

  const manifest = await buildManifest(publicDir)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`)
  const bytes = statSync(manifestPath).size
  const longest = Math.max(0, ...Object.values(manifest).map((e) => e.blur.length))
  console.log(
    `blur-manifest: wrote ${Object.keys(manifest).length} entries to ${MANIFEST_RELATIVE} (${bytes} bytes, longest data URL ${longest})`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
