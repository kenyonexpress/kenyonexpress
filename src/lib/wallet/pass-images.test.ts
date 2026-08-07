import { afterEach, describe, expect, it } from 'vitest'
import { __resetPassImageCache, passImages } from './pass-images'

/**
 * Runs sharp for real against the icon that is actually in the repo. Mocking it
 * would assert that four names come back, which is the one thing that cannot go
 * wrong: what CAN is a resize that throws on a source that moved or changed
 * format, and this project has already been bitten once by a sharp failure that
 * was swallowed and served as the untouched source with a 200.
 */

afterEach(() => {
  __resetPassImageCache()
})

describe('passImages', () => {
  it('produces the four files a pass needs, as real PNGs', async () => {
    const images = await passImages()
    expect(images.map((i) => i.name)).toEqual([
      'icon.png',
      'icon@2x.png',
      'logo.png',
      'logo@2x.png',
    ])
    for (const image of images) {
      expect(image.data.length).toBeGreaterThan(0)
      // PNG magic. The measured trap here is a pipeline that returns the SOURCE
      // bytes on failure, so the assertion is on the dimensions below, not on
      // this alone.
      expect(image.data.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    }
  })

  it('actually resizes: icon.png is 29x29 and not the 512px source', async () => {
    // The whole point. A 512x512 PNG named `icon.png` is a pass iOS rejects,
    // and every byte of it is in a download made on mobile data at a counter.
    const icon = (await passImages()).find((i) => i.name === 'icon.png')?.data as Buffer
    expect(readPngSize(icon)).toEqual({ width: 29, height: 29 })
  })

  it('gives the logo Apple’s aspect rather than cropping the mark to a stripe', async () => {
    const logo = (await passImages()).find((i) => i.name === 'logo.png')?.data as Buffer
    expect(readPngSize(logo)).toEqual({ width: 160, height: 50 })
  })

  it('is cached: a second call returns the same buffers', async () => {
    const first = await passImages()
    expect((await passImages())[0]).toBe(first[0])
  })
})

/** IHDR is always the first chunk: 8 bytes of signature, then length+type. */
function readPngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}
