import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BLUR_WIDTH,
  MAX_BLUR_BYTES,
  blurEntryFromBuffer,
  buildManifest,
  diffManifest,
  listRasters,
} from './blur-manifest.mjs'

/**
 * The encoder is pinned on what a card consumes: a `data:image/webp;base64,`
 * string small enough to inline on every card, with the ORIENTED width and
 * height beside it. The walker is pinned on the two things that make the
 * manifest diff-stable and complete: a sorted, slash-separated public path
 * per raster, and nothing for an SVG or a folder outside the scan list.
 */
describe('blurEntryFromBuffer', () => {
  it('encodes a photo to a small WebP data URL with its dimensions', async () => {
    const src = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .toBuffer()
    const entry = await blurEntryFromBuffer(src)
    expect(entry.blur.startsWith('data:image/webp;base64,')).toBe(true)
    expect(entry.blur.length).toBeLessThanOrEqual(MAX_BLUR_BYTES)
    expect(entry).toMatchObject({ w: 600, h: 400 })

    const decoded = sharp(Buffer.from(entry.blur.split(',')[1], 'base64'))
    const meta = await decoded.metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(BLUR_WIDTH)
    // 600x400 at 10 across is 7 down (rounded), never a square.
    expect(meta.height).toBe(7)
  })

  it('bakes EXIF orientation in, so w/h are the displayed axes', async () => {
    const src = await sharp({
      create: { width: 300, height: 100, channels: 3, background: { r: 10, g: 10, b: 200 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const entry = await blurEntryFromBuffer(src)
    expect(entry).toMatchObject({ w: 100, h: 300 })
  })

  it('does not enlarge an image narrower than the blur width', async () => {
    const src = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()
    const entry = await blurEntryFromBuffer(src)
    const meta = await sharp(Buffer.from(entry.blur.split(',')[1], 'base64')).metadata()
    expect(meta.width).toBe(4)
  })
})

describe('listRasters and buildManifest', () => {
  let publicDir

  beforeAll(async () => {
    publicDir = mkdtempSync(join(tmpdir(), 'blur-manifest-'))
    mkdirSync(join(publicDir, 'images/products'), { recursive: true })
    mkdirSync(join(publicDir, 'images/hero/category'), { recursive: true })
    mkdirSync(join(publicDir, 'images/cdn'), { recursive: true })
    const png = await sharp({
      create: { width: 20, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer()
    writeFileSync(join(publicDir, 'images/products/zeta.png'), png)
    writeFileSync(join(publicDir, 'images/products/alpha.PNG'), png)
    writeFileSync(join(publicDir, 'images/products/mark.svg'), '<svg/>')
    writeFileSync(join(publicDir, 'images/hero/category/kids.png'), png)
    writeFileSync(join(publicDir, 'images/cdn/outside.png'), png)
  })

  afterAll(() => {
    rmSync(publicDir, { recursive: true, force: true })
  })

  it('lists rasters as sorted public paths, recursing, skipping SVG and unscanned folders', () => {
    expect(listRasters(publicDir)).toEqual([
      '/images/hero/category/kids.png',
      '/images/products/alpha.PNG',
      '/images/products/zeta.png',
    ])
  })

  it('builds one entry per raster, keyed by public path', async () => {
    const manifest = await buildManifest(publicDir)
    expect(Object.keys(manifest)).toEqual([
      '/images/hero/category/kids.png',
      '/images/products/alpha.PNG',
      '/images/products/zeta.png',
    ])
    expect(manifest['/images/products/zeta.png']).toMatchObject({ w: 20, h: 10 })
  })

  it('diffs the manifest against the disk without decoding', () => {
    const manifest = {
      '/images/products/zeta.png': { blur: 'data:image/webp;base64,AA', w: 1, h: 1 },
      '/images/products/gone.png': { blur: 'data:image/webp;base64,AA', w: 1, h: 1 },
      '/images/hero/category/kids.png': { blur: `data:${'x'.repeat(MAX_BLUR_BYTES)}`, w: 1, h: 1 },
    }
    expect(diffManifest(manifest, listRasters(publicDir))).toEqual({
      missing: ['/images/products/alpha.PNG'],
      stale: ['/images/products/gone.png'],
      oversized: ['/images/hero/category/kids.png'],
    })
  })
})
