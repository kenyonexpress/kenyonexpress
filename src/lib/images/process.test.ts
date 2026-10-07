import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { RENDITION_WIDTHS, processImage } from './process'
import { isValidHebrewAlt, validateImageFile } from './validate'

async function makeTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 254, g: 215, b: 0 },
    },
  })
    .jpeg()
    .toBuffer()
}

async function makeMark(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 80, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer()
}

async function cornerPixel(buffer: Buffer): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  // 20px in from the bottom-right corner, inside the default 16px margin + mark.
  const x = info.width - 24
  const y = info.height - 24
  const i = (y * info.width + x) * info.channels
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
}

describe('processImage: EXIF and watermark', () => {
  it('strips EXIF from every rendition and bakes the orientation in first', async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 254, g: 215, b: 0 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'strip me' } })
      .toBuffer()
    const inputMeta = await sharp(input).metadata()
    expect(inputMeta.exif).toBeDefined()
    expect(inputMeta.orientation).toBe(6)

    const result = await processImage(input)
    // Orientation 6 is a 90 degree turn: the 1200x800 original displays as 800x1200.
    expect(result.width).toBe(800)
    expect(result.height).toBe(1200)
    for (const r of result.renditions) {
      const meta = await sharp(r.buffer).metadata()
      expect(meta.exif, `${r.format} w${r.width}`).toBeUndefined()
      expect(meta.orientation, `${r.format} w${r.width}`).toBeUndefined()
      expect(meta.width, `${r.format} w${r.width}`).toBe(r.width)
    }
  }, 30000)

  it('leaves the pixels alone without a watermark and marks every rendition with one', async () => {
    const input = await makeTestImage(1600, 1200)
    const plain = await processImage(input)
    const marked = await processImage(input, { watermark: { image: await makeMark(), opacity: 1 } })

    expect(marked.renditions.map((r) => [r.format, r.width])).toEqual(
      plain.renditions.map((r) => [r.format, r.width]),
    )
    for (const [i, r] of marked.renditions.entries()) {
      const before = await cornerPixel(plain.renditions[i]?.buffer ?? Buffer.alloc(0))
      const after = await cornerPixel(r.buffer)
      expect(before[2], 'unmarked corner is the yellow background').toBeLessThan(60)
      expect(after[2], `${r.format} w${r.width} corner carries the blue mark`).toBeGreaterThan(150)
    }
    // The blur placeholder is never marked.
    expect(marked.blurDataURL).toBe(plain.blurDataURL)
  }, 30000)
})

describe('processImage', () => {
  it('produces webp renditions for every width below the original + one avif', async () => {
    const input = await makeTestImage(2000, 1500)
    const result = await processImage(input)

    const webp = result.renditions.filter((r) => r.format === 'webp')
    const avif = result.renditions.filter((r) => r.format === 'avif')

    expect(webp.map((r) => r.width)).toEqual([...RENDITION_WIDTHS])
    expect(avif).toHaveLength(1)
    expect(avif[0]?.width).toBe(RENDITION_WIDTHS[0])
    expect(result.width).toBe(1600)
    expect(result.height).toBe(1200)
  }, 30000)

  it('never upscales small originals, and never throws their pixels away either', async () => {
    // THIS TEST USED TO ASSERT `[400]`, i.e. it confirmed the defect.
    //
    // The rule was `RENDITION_WIDTHS.filter(w => w <= original)`, so a 600px
    // upload failed both `1600 <= 600` and `800 <= 600` and was stored at a
    // maximum of 400px. Two thirds of what the admin uploaded was discarded,
    // silently, and the gallery then served 400px to a phone asking for over a
    // thousand. "Never upscale" was the intent; "round down to the next tier"
    // was the behaviour.
    const input = await makeTestImage(600, 400)
    const result = await processImage(input)

    const webp = result.renditions.filter((r) => r.format === 'webp')
    expect(webp.map((r) => r.width)).toEqual([600, 400])
    expect(result.width).toBe(600)
    // Still no upscaling: nothing wider than the original was produced.
    expect(Math.max(...result.renditions.map((r) => r.width))).toBe(600)
  }, 30000)

  it('caps at the top tier and keeps the tiers below it', async () => {
    // The measured case: 1200x900 in, 800x600 out, before the fix.
    const input = await makeTestImage(1200, 900)
    const result = await processImage(input)
    const webp = result.renditions.filter((r) => r.format === 'webp')
    expect(webp.map((r) => r.width)).toEqual([1200, 800, 400])
    expect(result.width).toBe(1200)
  }, 30000)

  it('does not emit the same width twice when the original sits on a tier', async () => {
    const input = await makeTestImage(800, 600)
    const result = await processImage(input)
    const webp = result.renditions.filter((r) => r.format === 'webp')
    expect(webp.map((r) => r.width)).toEqual([800, 400])
  }, 30000)

  it('emits a base64 webp blur placeholder', async () => {
    const input = await makeTestImage(800, 800)
    const result = await processImage(input)
    expect(result.blurDataURL).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/)
    // A blur stub must be tiny
    expect(result.blurDataURL.length).toBeLessThan(2000)
  }, 30000)

  it('rejects non-image buffers', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toThrow()
  })

  it('actually compresses: webp rendition is smaller than a same-size jpeg original', async () => {
    const input = await makeTestImage(1600, 1200)
    const result = await processImage(input)
    const main = result.renditions.find((r) => r.format === 'webp' && r.width === 1600)
    expect(main).toBeDefined()
    expect(main!.buffer.length).toBeLessThan(input.length)
  }, 30000)
})

describe('isValidHebrewAlt', () => {
  it('accepts Hebrew alt text', () => {
    expect(isValidHebrewAlt('אוזניות אלחוטיות שחורות')).toBe(true)
    expect(isValidHebrewAlt('כסא')).toBe(true)
  })

  it('rejects empty, short and non-Hebrew alt text', () => {
    expect(isValidHebrewAlt('')).toBe(false)
    expect(isValidHebrewAlt(null)).toBe(false)
    expect(isValidHebrewAlt('  ')).toBe(false)
    expect(isValidHebrewAlt('אב')).toBe(false)
    expect(isValidHebrewAlt('headphones black')).toBe(false)
    expect(isValidHebrewAlt('123456')).toBe(false)
  })

  it('accepts mixed Hebrew + Latin', () => {
    expect(isValidHebrewAlt('אוזניות AirPods 3')).toBe(true)
  })
})

describe('validateImageFile', () => {
  it('rejects unsupported types and oversized files', () => {
    const pdf = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' })
    expect(validateImageFile(pdf)).not.toBeNull()

    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'a.jpg', { type: 'image/jpeg' })
    expect(validateImageFile(big)).not.toBeNull()

    const ok = new File([new Uint8Array(1024)], 'a.jpg', { type: 'image/jpeg' })
    expect(validateImageFile(ok)).toBeNull()
  })
})
