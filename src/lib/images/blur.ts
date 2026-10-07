import 'server-only'

import manifest from './blur-manifest.json'

/**
 * BLUR PLACEHOLDERS FOR THE CATALOGUE'S STATIC FILES, READ ON THE SERVER.
 *
 * `blur-manifest.json` is written by `pnpm images:blur`
 * (scripts/media-ingest/blur-manifest.mjs) and committed. One entry per
 * raster under `public/images/{products,categories,hero}`: a ~150-byte WebP
 * data URL and the oriented width and height. `pnpm lint` runs the script's
 * `--check` so a photo added without an entry fails before it ships grey.
 *
 * WHY THIS MODULE IS `server-only`. The manifest is ~20 KB and grows with the
 * catalogue. A client component that imported it would put the whole thing
 * on every route's first load (STEP 34 gates that per route). So the lookup
 * happens where the card is rendered, in a server component, and the card
 * receives ONE string for ONE image as a prop. `blur.test.ts` greps for
 * importers and refuses any file that starts with `'use client'`.
 *
 * WHY THE PRODUCT ROWS STILL MATTER. `media_assets.blur_data_url` is the
 * pipeline's own placeholder for UPLOADED photos and remains the first source
 * in `product-detail.ts`; this is the fallback for the files the pipeline
 * never saw, which on 2026-10-07 was all 43 active products with an image.
 */

export type BlurEntry = { blur: string; w: number; h: number }

const ENTRIES: Record<string, BlurEntry> = manifest

/**
 * The manifest key for a stored image reference, or null when the reference
 * cannot be a public file (a remote URL, an empty string, a data URL).
 *
 * Query strings and fragments are dropped: a cache-busting `?v=2` names the
 * same bytes. A percent-encoded path is tried decoded as well, because the
 * importer stored some slugs encoded and the file system holds them raw.
 */
export function manifestKeyFor(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null
  if (!src.startsWith('/images/')) return null
  const cut = src.search(/[?#]/)
  const path = cut === -1 ? src : src.slice(0, cut)
  if (path in ENTRIES) return path
  try {
    const decoded = decodeURIComponent(path)
    if (decoded in ENTRIES) return decoded
  } catch {
    // malformed escape: not a key either way
  }
  return null
}

/** The manifest entry for a stored image reference, if the file is one of ours. */
export function blurEntryFor(src: string | null | undefined): BlurEntry | undefined {
  const key = manifestKeyFor(src)
  return key ? ENTRIES[key] : undefined
}

/** Just the data URL, for a prop. */
export function blurDataUrlFor(src: string | null | undefined): string | undefined {
  return blurEntryFor(src)?.blur
}

/**
 * The first image of a product row, as stored (`images` is `jsonb` and the
 * importer wrote a plain string array), or null. Every card reads it the
 * same way; this is that read, once.
 */
export function firstImageOf(images: unknown): string | null {
  return Array.isArray(images) && typeof images[0] === 'string' ? images[0] : null
}

/** `blurDataUrlFor(firstImageOf(images))`, the shape every grid needs. */
export function blurForProductImages(images: unknown): string | undefined {
  return blurDataUrlFor(firstImageOf(images))
}

/** How many entries the manifest carries; for the report and the tests. */
export function blurManifestSize(): number {
  return Object.keys(ENTRIES).length
}
