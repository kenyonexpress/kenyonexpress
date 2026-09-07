import { describe, expect, it } from 'vitest'
import {
  CLIENT_MAX_DIMENSION,
  COMPRESS_THRESHOLD_BYTES,
  MAX_COMPRESSIBLE_ORIGINAL_BYTES,
  compressImageFile,
  shouldClientCompress,
  targetDimensions,
  validateStagedFile,
} from './client-compress'
import { MAX_ORIGINAL_BYTES } from './validate'

function fileOf(bytes: number, type: string, name = 'photo.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('targetDimensions', () => {
  it('never upscales an image already inside the cap', () => {
    expect(targetDimensions(1200, 900)).toEqual({ width: 1200, height: 900 })
    expect(targetDimensions(CLIENT_MAX_DIMENSION, CLIENT_MAX_DIMENSION)).toEqual({
      width: CLIENT_MAX_DIMENSION,
      height: CLIENT_MAX_DIMENSION,
    })
  })

  it('contains landscape and portrait to the long edge, preserving aspect', () => {
    expect(targetDimensions(3200, 2400)).toEqual({ width: 1600, height: 1200 })
    expect(targetDimensions(2400, 3200)).toEqual({ width: 1200, height: 1600 })
  })

  it('caps a single oversized edge even when the other is tiny', () => {
    const { width, height } = targetDimensions(16000, 10)
    expect(width).toBe(1600)
    expect(height).toBe(1)
  })
})

describe('shouldClientCompress', () => {
  it('compresses large jpeg/png/webp', () => {
    expect(shouldClientCompress(fileOf(COMPRESS_THRESHOLD_BYTES + 1, 'image/jpeg'))).toBe(true)
    expect(shouldClientCompress(fileOf(COMPRESS_THRESHOLD_BYTES + 1, 'image/png'))).toBe(true)
    expect(shouldClientCompress(fileOf(COMPRESS_THRESHOLD_BYTES + 1, 'image/webp'))).toBe(true)
  })

  it('skips files already below the threshold', () => {
    expect(shouldClientCompress(fileOf(COMPRESS_THRESHOLD_BYTES, 'image/jpeg'))).toBe(false)
  })

  it('never re-encodes gif (animation) or avif', () => {
    expect(shouldClientCompress(fileOf(5_000_000, 'image/gif'))).toBe(false)
    expect(shouldClientCompress(fileOf(5_000_000, 'image/avif'))).toBe(false)
  })
})

describe('validateStagedFile', () => {
  it('admits compressible originals above the server cap, up to 25MB', () => {
    expect(validateStagedFile(fileOf(MAX_ORIGINAL_BYTES + 1, 'image/jpeg'))).toBeNull()
    expect(validateStagedFile(fileOf(MAX_COMPRESSIBLE_ORIGINAL_BYTES, 'image/png'))).toBeNull()
  })

  it('rejects compressible originals above 25MB in Hebrew', () => {
    const err = validateStagedFile(fileOf(MAX_COMPRESSIBLE_ORIGINAL_BYTES + 1, 'image/jpeg'))
    expect(err).toContain('25MB')
  })

  it('holds gif/avif to the server cap since they upload as-is', () => {
    expect(validateStagedFile(fileOf(MAX_ORIGINAL_BYTES, 'image/gif', 'a.gif'))).toBeNull()
    expect(validateStagedFile(fileOf(MAX_ORIGINAL_BYTES + 1, 'image/gif', 'a.gif'))).toContain(
      '8MB',
    )
    expect(validateStagedFile(fileOf(MAX_ORIGINAL_BYTES + 1, 'image/avif', 'a.avif'))).toContain(
      '8MB',
    )
  })

  it('rejects non-image types', () => {
    expect(validateStagedFile(fileOf(100, 'application/pdf', 'a.pdf'))).toContain('לא נתמך')
  })
})

describe('compressImageFile fallback', () => {
  it('returns the original file untouched when the browser cannot compress', async () => {
    // jsdom has no createImageBitmap, which is exactly the degraded-browser
    // path: the upload must proceed with the original bytes.
    const original = fileOf(COMPRESS_THRESHOLD_BYTES + 1, 'image/jpeg')
    const result = await compressImageFile(original)
    expect(result).toBe(original)
  })

  it('returns small files untouched without attempting a decode', async () => {
    const original = fileOf(1024, 'image/jpeg')
    expect(await compressImageFile(original)).toBe(original)
  })
})
