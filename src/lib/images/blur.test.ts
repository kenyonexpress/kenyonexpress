import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  blurDataUrlFor,
  blurEntryFor,
  blurForProductImages,
  blurManifestSize,
  firstImageOf,
  manifestKeyFor,
} from './blur'
import manifest from './blur-manifest.json'

const root = resolve(__dirname, '../../..')
const PUBLIC = join(root, 'public')
const SCANNED = ['images/products', 'images/categories', 'images/hero']
const RASTER = /\.(avif|webp|jpe?g|png)$/i

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (RASTER.test(name)) out.push(`/${relative(PUBLIC, full).split(sep).join('/')}`)
  }
  return out
}

function walkSrc(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walkSrc(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const FIRST_KEY = Object.keys(manifest).find((k) => k.startsWith('/images/products/')) as string

describe('blur manifest lookup', () => {
  it('finds a product file by its stored path', () => {
    const entry = blurEntryFor(FIRST_KEY)
    expect(entry?.blur.startsWith('data:image/webp;base64,')).toBe(true)
    expect(entry?.w).toBeGreaterThan(0)
    expect(entry?.h).toBeGreaterThan(0)
    expect(blurDataUrlFor(FIRST_KEY)).toBe(entry?.blur)
  })

  it('ignores a query string or fragment on the same file', () => {
    expect(manifestKeyFor(`${FIRST_KEY}?v=2`)).toBe(FIRST_KEY)
    expect(manifestKeyFor(`${FIRST_KEY}#x`)).toBe(FIRST_KEY)
  })

  it('tries the percent-decoded path too', () => {
    const encoded = FIRST_KEY.replace(/\.(\w+)$/, (m) => encodeURIComponent(m))
    expect(manifestKeyFor(encoded)).toBe(FIRST_KEY)
  })

  it('answers nothing for a remote URL, a data URL, an unknown file or garbage', () => {
    expect(blurDataUrlFor('https://r2.example/x.webp')).toBeUndefined()
    expect(blurDataUrlFor('data:image/webp;base64,AA')).toBeUndefined()
    expect(blurDataUrlFor('/images/products/does-not-exist.webp')).toBeUndefined()
    expect(blurDataUrlFor('/images/products/%E0%A4%A')).toBeUndefined()
    expect(blurDataUrlFor(null)).toBeUndefined()
    expect(blurDataUrlFor(undefined)).toBeUndefined()
    expect(blurDataUrlFor('')).toBeUndefined()
  })

  it('reads a product row the way every card does', () => {
    expect(firstImageOf([FIRST_KEY, '/images/products/b.webp'])).toBe(FIRST_KEY)
    expect(firstImageOf([])).toBeNull()
    expect(firstImageOf(null)).toBeNull()
    expect(firstImageOf([{ url: FIRST_KEY }])).toBeNull()
    expect(blurForProductImages([FIRST_KEY])).toBe(blurDataUrlFor(FIRST_KEY))
    expect(blurForProductImages('nope')).toBeUndefined()
  })
})

/**
 * THE COMMITTED MANIFEST MATCHES THE FILES ON DISK. Same comparison as
 * `node scripts/media-ingest/blur-manifest.mjs --check`, run here so the
 * unit suite fails on a photo that was added without `pnpm images:blur`,
 * before lint and before the build.
 */
describe('blur manifest coverage', () => {
  const onDisk = SCANNED.flatMap((folder) => walk(join(PUBLIC, folder))).sort()
  const keys = Object.keys(manifest).sort()

  it('has an entry for every raster the storefront can paint', () => {
    expect(onDisk.filter((p) => !(p in manifest))).toEqual([])
  })

  it('has no entry for a file that is gone', () => {
    expect(keys.filter((k) => !onDisk.includes(k))).toEqual([])
    expect(blurManifestSize()).toBe(onDisk.length)
  })

  it('keeps every placeholder small enough to inline on a card', () => {
    for (const [key, entry] of Object.entries(manifest)) {
      expect(entry.blur.length, key).toBeLessThanOrEqual(400)
      expect(entry.w, key).toBeGreaterThan(0)
      expect(entry.h, key).toBeGreaterThan(0)
    }
  })
})

/**
 * THE MANIFEST NEVER REACHES A CLIENT BUNDLE. `blur.ts` is `server-only`, but
 * that throws at runtime; this says so at test time, by name, for any
 * `'use client'` module that imports it or the JSON directly.
 */
describe('blur manifest stays on the server', () => {
  it('is imported by server modules only', () => {
    const offenders: string[] = []
    for (const file of walkSrc(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8')
      const importsIt =
        /from\s+['"](@\/lib\/images\/blur(-manifest\.json)?|\.{1,2}\/[^'"]*blur(-manifest\.json)?)['"]/.test(
          text,
        )
      if (!importsIt) continue
      if (/^\s*['"]use client['"]/m.test(text)) offenders.push(relative(root, file))
    }
    expect(offenders).toEqual([])
  })
})
