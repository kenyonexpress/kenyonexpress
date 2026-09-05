import { describe, expect, it } from 'vitest'
import { BASE83_ALPHABET, decodeBlurhash, encodeBlurhash } from './blurhash.mjs'

/**
 * A hand-rolled blurhash is only worth having if it is provably a blurhash.
 *
 * These assert the properties that separate a correct DCT-in-linear-light from
 * the two ways this is usually got wrong: averaging in gamma space (which comes
 * out muddy) and mis-sizing the output (which decoders reject outright).
 */

/** A solid field of one colour, as raw RGB. */
function solid(r, g, b, width = 16, height = 16) {
  const px = new Uint8Array(width * height * 3)
  for (let i = 0; i < px.length; i += 3) {
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
  }
  return { px, width, height }
}

describe('encodeBlurhash', () => {
  it('is the length the format specifies', () => {
    // 1 + 1 + 4 + 2 * (numX * numY - 1)
    const { px, width, height } = solid(120, 80, 40)
    expect(encodeBlurhash(px, width, height, 4, 3)).toHaveLength(28)
    expect(encodeBlurhash(px, width, height, 1, 1)).toHaveLength(6)
    expect(encodeBlurhash(px, width, height, 9, 9)).toHaveLength(166)
  })

  it('emits only base83 characters', () => {
    const { px, width, height } = solid(200, 30, 90)
    for (const char of encodeBlurhash(px, width, height)) {
      expect(BASE83_ALPHABET).toContain(char)
    }
  })

  /**
   * BLURHASH DOES NOT RECONSTRUCT A FLAT FIELD EXACTLY, and that is the format,
   * not this implementation.
   *
   * Two earlier versions of this test asserted tighter properties and both were
   * wrong. The cause is in the reference algorithm: the basis is
   * `cos(pi * x * i / width)` with NO half-pixel offset, so it is not orthogonal
   * on the sampled grid. Measured directly at width 16, summing the basis over
   * every sample:
   *
   *   x=0 : 16      x=1 : 1      x=2 : 0      x=3 : 1
   *
   * A true DCT-II uses `(i + 0.5)` and those sums are 0. Blurhash does not, so a
   * CONSTANT field produces AC terms around 12% of DC, and the inverse cannot
   * quite cancel them. Adding the offset would make the transform tidier and
   * every hash undecodable by every other implementation.
   *
   * Measured worst per-channel error over a full round trip, 16x16, 4x3:
   *
   *   black        2      mid grey    19
   *   #dc3545     36      white       43
   *
   * The bound below is 50, set from those numbers with headroom, and it is
   * asserted so that a genuinely broken transform -- which would be wrong by
   * hundreds, or would clamp everything to one value -- still fails.
   */
  it('round-trips within the bound the format actually provides', () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [128, 128, 128],
      [220, 53, 69],
      [255, 255, 255],
      [70, 140, 210],
    ]) {
      const { px, width, height } = solid(r, g, b)
      const out = decodeBlurhash(encodeBlurhash(px, width, height, 4, 3), width, height)
      let worst = 0
      for (let i = 0; i < out.length; i += 3) {
        worst = Math.max(
          worst,
          Math.abs(out[i] - r),
          Math.abs(out[i + 1] - g),
          Math.abs(out[i + 2] - b),
        )
      }
      expect(worst, `solid(${r},${g},${b}) round trip`).toBeLessThanOrEqual(50)
    }
  })

  it('reconstructs the mean, which is what a placeholder is for', () => {
    // The property that actually matters: averaged over the image, the decoded
    // colour is the original. Per-pixel wobble is the format's; the mean is not
    // allowed to drift, and a transform broken in linear-vs-gamma space would
    // move it by tens of levels.
    for (const [r, g, b] of [
      [128, 128, 128],
      [220, 53, 69],
      [70, 140, 210],
    ]) {
      const { px, width, height } = solid(r, g, b)
      const out = decodeBlurhash(encodeBlurhash(px, width, height, 4, 3), width, height)
      const n = width * height
      const mean = [0, 1, 2].map((c) => {
        let sum = 0
        for (let i = 0; i < out.length; i += 3) sum += out[i + c]
        return sum / n
      })
      for (const [i, expected] of [r, g, b].entries()) {
        expect(Math.abs(mean[i] - expected), `mean channel ${i}`).toBeLessThanOrEqual(12)
      }
    }
  })

  it('refuses a hash whose length disagrees with its own size flag', () => {
    const { px, width, height } = solid(10, 20, 30)
    const hash = encodeBlurhash(px, width, height, 4, 3)
    expect(() => decodeBlurhash(`${hash}XX`, 8, 8)).toThrow(/expected 28 characters/)
    expect(() => decodeBlurhash('abc', 8, 8)).toThrow(/too short/)
  })

  it('refuses a buffer that is not the size it was told', () => {
    expect(() => encodeBlurhash(new Uint8Array(10), 16, 16)).toThrow(/expected 768 bytes/)
  })

  it('refuses component counts outside 1..9', () => {
    const { px, width, height } = solid(10, 10, 10)
    expect(() => encodeBlurhash(px, width, height, 0, 3)).toThrow(/between 1 and 9/)
    expect(() => encodeBlurhash(px, width, height, 4, 10)).toThrow(/between 1 and 9/)
  })

  it('distinguishes a gradient from a flat field', () => {
    const width = 16
    const height = 16
    const px = new Uint8Array(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = 3 * (y * width + x)
        px[i] = Math.round((x / (width - 1)) * 255)
        px[i + 1] = 60
        px[i + 2] = Math.round((y / (height - 1)) * 255)
      }
    }
    const gradient = encodeBlurhash(px, width, height)
    const flat = encodeBlurhash(solid(128, 60, 128).px, 16, 16)
    expect(gradient).not.toBe(flat)
    // A gradient has non-trivial AC energy, so its pairs are not all identical.
    expect(new Set(gradient.slice(6).match(/.{2}/g)).size).toBeGreaterThan(1)
  })
})
