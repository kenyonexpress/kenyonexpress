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

  it('never upscales small originals', async () => {
    const input = await makeTestImage(600, 400)
    const result = await processImage(input)

    const webp = result.renditions.filter((r) => r.format === 'webp')
    expect(webp.map((r) => r.width)).toEqual([400])
    expect(result.width).toBe(400)
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
