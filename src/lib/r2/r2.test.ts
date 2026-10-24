import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { convertToVariants } from './convert'
import { assertSafeKey, presignR2Url } from './presign'
import { pickVariantWidth, variantKey, variantSrcSet } from './variants'

const credentials = {
  accountId: 'acc',
  accessKeyId: 'AKID',
  secretAccessKey: 'secret',
  bucket: 'b',
}
const now = new Date('2026-01-02T03:04:05Z')

describe('presignR2Url', () => {
  it('signs GET deterministically and differs from PUT', async () => {
    const get = await presignR2Url({ method: 'GET', key: 'a/b.pdf', credentials, now })
    const again = await presignR2Url({ method: 'GET', key: 'a/b.pdf', credentials, now })
    const put = await presignR2Url({ method: 'PUT', key: 'a/b.pdf', credentials, now })
    expect(get).toBe(again)
    expect(get).not.toBe(put)
    expect(get).toContain('https://acc.r2.cloudflarestorage.com/b/a/b.pdf?')
    expect(get).toContain('X-Amz-Date=20260102T030405Z')
    expect(get).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/)
  })
  it('clamps expiry to 1s..7d', async () => {
    const big = await presignR2Url({
      method: 'GET',
      key: 'k',
      credentials,
      now,
      expiresSeconds: 9e9,
    })
    const zero = await presignR2Url({
      method: 'GET',
      key: 'k',
      credentials,
      now,
      expiresSeconds: 0,
    })
    expect(big).toContain('X-Amz-Expires=604800')
    expect(zero).toContain('X-Amz-Expires=1')
  })
  it('rejects traversal keys', () => {
    for (const k of ['', '/x', '../x', 'a/../b', 'a\\b']) expect(() => assertSafeKey(k)).toThrow()
  })
})

describe('variants', () => {
  it('names and picks widths', () => {
    expect(variantKey('p/x/', 640, 'avif')).toBe('p/x/640.avif')
    expect(pickVariantWidth(500)).toBe(640)
    expect(pickVariantWidth(5000)).toBe(1920)
    expect(variantSrcSet('https://c/', 'p/x', 'webp', [320, 640])).toBe(
      'https://c/p/x/320.webp 320w, https://c/p/x/640.webp 640w',
    )
  })
})

describe('convertToVariants', () => {
  it('emits avif + webp and never upscales', async () => {
    const src = await sharp({
      create: { width: 700, height: 400, channels: 3, background: '#c00' },
    })
      .jpeg()
      .toBuffer()
    const out = await convertToVariants(src, 'p/u', [320, 960, 1920])
    expect(out.map((v) => v.key).sort()).toEqual(
      ['p/u/320.avif', 'p/u/320.webp', 'p/u/700.avif', 'p/u/700.webp'].sort(),
    )
    const avif = out.find((v) => v.key === 'p/u/700.avif')
    expect((await sharp(avif?.body).metadata()).format).toBe('heif')
  })
})
