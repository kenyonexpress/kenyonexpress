import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_WIDTH,
  fittedSize,
  optimizeImage,
  orientedSize,
  outputFamilyFor,
  prepareWatermark,
  watermarkPosition,
} from './optimize.mjs'

async function photo(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg') {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 254, g: 215, b: 0 } },
  })
  if (format === 'png') return base.png().toBuffer()
  if (format === 'webp') return base.webp().toBuffer()
  return base.jpeg({ quality: 100 }).toBuffer()
}

async function mark(): Promise<Buffer> {
  return sharp({
    create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer()
}

async function pixelAt(buffer: Buffer, fromRight: number, fromBottom: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const x = info.width - fromRight
  const y = info.height - fromBottom
  const i = (y * info.width + x) * info.channels
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }
}

describe('optimizeImage', () => {
  it('compresses in the input family, keeps the extension, and never enlarges', async () => {
    const input = await photo(1000, 600)
    const out = await optimizeImage(input)

    expect(out.format).toBe('jpeg')
    expect(out.extension).toBe('jpg')
    expect(out.width).toBe(1000)
    expect(out.height).toBe(600)
    expect(out.bytesIn).toBe(input.length)
    expect(out.bytesOut).toBe(out.buffer.length)
    expect(out.bytesOut).toBeLessThan(out.bytesIn)
    expect(out.watermarked).toBe(false)
  })

  it('caps the width at the ceiling and scales the height with it', async () => {
    const out = await optimizeImage(await photo(3200, 1600))
    expect(out.width).toBe(DEFAULT_MAX_WIDTH)
    expect(out.height).toBe(800)

    const small = await optimizeImage(await photo(900, 300), { maxWidth: 600 })
    expect([small.width, small.height]).toEqual([600, 200])
  })

  it('strips EXIF, XMP and the orientation tag, and bakes the orientation into the pixels', async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'secret', Software: 'phone' } })
      .toBuffer()
    const before = await sharp(input).metadata()
    expect(before.exif).toBeDefined()
    expect(before.orientation).toBe(6)

    const out = await optimizeImage(input)
    const after = await sharp(out.buffer).metadata()
    expect(after.exif).toBeUndefined()
    expect(after.xmp).toBeUndefined()
    expect(after.orientation).toBeUndefined()
    // Orientation 6 is a quarter turn: 1200x800 displays as 800x1200, and
    // that is the stored size now that the tag is gone.
    expect([out.width, out.height]).toEqual([800, 1200])
    expect([after.width, after.height]).toEqual([800, 1200])
  })

  it('converts when a format is named', async () => {
    const out = await optimizeImage(await photo(800, 800, 'png'), { format: 'webp' })
    expect(out.format).toBe('webp')
    expect(out.extension).toBe('webp')
    const png = await optimizeImage(await photo(800, 800, 'png'))
    expect(png.format).toBe('png')
  })

  it('composites the watermark at the bottom-end corner, scaled to the output, at the given opacity', async () => {
    const input = await photo(1000, 500)
    const full = await optimizeImage(input, { watermark: { image: await mark(), opacity: 1 } })
    const half = await optimizeImage(input, { watermark: { image: await mark(), opacity: 0.5 } })
    const none = await optimizeImage(input)

    expect(full.watermarked).toBe(true)
    expect([full.width, full.height]).toEqual([1000, 500])

    // Default scale 0.18 of 1000 = 180px wide, 60px tall, 16px margin: the
    // pixel 30px in from each edge is inside the mark; 300px in is not.
    const inside = await pixelAt(full.buffer, 30, 30)
    const outside = await pixelAt(full.buffer, 300, 30)
    const untouched = await pixelAt(none.buffer, 30, 30)
    expect(inside.b).toBeGreaterThan(200)
    expect(inside.r).toBeLessThan(60)
    expect(outside.r).toBeGreaterThan(200)
    expect(untouched.b).toBeLessThan(60)

    const blended = await pixelAt(half.buffer, 30, 30)
    expect(blended.b).toBeGreaterThan(80)
    expect(blended.b).toBeLessThan(inside.b)
    expect(blended.r).toBeGreaterThan(inside.r)
  })

  it('refuses bytes that are not an image', async () => {
    await expect(optimizeImage(Buffer.from('not an image'))).rejects.toThrow()
  })
})

describe('pure helpers', () => {
  it('outputFamilyFor maps sharp input formats onto the encoders', () => {
    expect(outputFamilyFor('jpeg')).toBe('jpeg')
    expect(outputFamilyFor('jpg')).toBe('jpeg')
    expect(outputFamilyFor('png')).toBe('png')
    expect(outputFamilyFor('heif')).toBe('avif')
    expect(outputFamilyFor('avif')).toBe('avif')
    expect(outputFamilyFor('gif')).toBe('gif')
    expect(outputFamilyFor('svg')).toBe('webp')
    expect(outputFamilyFor(undefined)).toBe('webp')
  })

  it('orientedSize swaps the axes for the transposing orientations only', () => {
    const meta = { width: 300, height: 100 } as Parameters<typeof orientedSize>[0]
    expect(orientedSize(meta)).toEqual({ width: 300, height: 100 })
    expect(orientedSize({ ...meta, orientation: 3 })).toEqual({ width: 300, height: 100 })
    expect(orientedSize({ ...meta, orientation: 6 })).toEqual({ width: 100, height: 300 })
    expect(orientedSize({ ...meta, orientation: 8 })).toEqual({ width: 100, height: 300 })
  })

  it('fittedSize rounds the height and never enlarges', () => {
    expect(fittedSize({ width: 1000, height: 333 }, 600)).toEqual({ width: 600, height: 200 })
    expect(fittedSize({ width: 500, height: 333 }, 600)).toEqual({ width: 500, height: 333 })
  })

  it('watermarkPosition respects gravity and margin and stays in frame', () => {
    const out = { width: 1000, height: 500 }
    const m = { width: 180, height: 60 }
    expect(watermarkPosition(out, m, 'southeast', 16)).toEqual({ left: 804, top: 424 })
    expect(watermarkPosition(out, m, 'northwest', 16)).toEqual({ left: 16, top: 16 })
    expect(watermarkPosition(out, m, 'centre', 16)).toEqual({ left: 410, top: 220 })
    expect(watermarkPosition({ width: 100, height: 40 }, m, 'southeast', 16)).toEqual({
      left: 0,
      top: 0,
    })
  })

  it('prepareWatermark scales to the output width and keeps alpha', async () => {
    const prepared = await prepareWatermark({ image: await mark(), scale: 0.1 }, 2000)
    expect(prepared.width).toBe(200)
    const meta = await sharp(prepared.input).metadata()
    expect(meta.hasAlpha).toBe(true)
    expect(meta.format).toBe('png')
  })
})
