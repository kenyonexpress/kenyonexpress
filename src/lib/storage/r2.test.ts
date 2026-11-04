// The S3 client is mocked at `send`, so nothing here talks to Cloudflare. The
// image is real: sharp encodes it, so the AVIF and WebP bytes are the ones the
// action would upload.

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createR2PresignedPutUrl,
  isR2Configured,
  putR2Object,
  r2BucketFromEnv,
  r2PublicUrl,
  uploadImageVariants,
} from './r2'

const FAKE_ENV = {
  R2_ACCOUNT_ID: 'testaccount1234567890abcdef',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'test-secret-not-real',
  R2_BUCKET_NAME: 'kenyonexpress-media',
  R2_BUCKET: '',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.test/',
}

let send: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v)
  send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function sentCommands(): PutObjectCommand[] {
  return send.mock.calls.map((call: unknown[]) => call[0] as PutObjectCommand)
}

describe('configuration', () => {
  it('is configured with all four credentials and a public base', () => {
    expect(isR2Configured()).toBe(true)
  })

  it('reads R2_BUCKET_NAME first and falls back to R2_BUCKET', () => {
    expect(r2BucketFromEnv()).toBe('kenyonexpress-media')
    vi.stubEnv('R2_BUCKET_NAME', '')
    vi.stubEnv('R2_BUCKET', 'legacy-bucket')
    expect(r2BucketFromEnv()).toBe('legacy-bucket')
  })

  it('is not configured without a bucket under either name', () => {
    vi.stubEnv('R2_BUCKET_NAME', '')
    expect(isR2Configured()).toBe(false)
  })

  it('is not configured when a key half is missing', () => {
    vi.stubEnv('R2_ACCESS_KEY_ID', '')
    expect(isR2Configured()).toBe(false)
  })

  it('builds public URLs without a double slash', () => {
    expect(r2PublicUrl('products/a/w800.webp')).toBe(
      'https://cdn.example.test/products/a/w800.webp',
    )
  })
})

describe('putR2Object', () => {
  it('sends one PutObject to the env bucket with type and immutable cache', async () => {
    const url = await putR2Object('smoke/a.webp', Buffer.from('x'), 'image/webp')
    expect(url).toBe('https://cdn.example.test/smoke/a.webp')
    const [cmd] = sentCommands()
    expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd?.input).toMatchObject({
      Bucket: 'kenyonexpress-media',
      Key: 'smoke/a.webp',
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  })

  it('refuses a path-traversal key before calling the client', async () => {
    await expect(putR2Object('a/../b.webp', 'x', 'image/webp')).rejects.toThrow(/relative/)
    expect(send).not.toHaveBeenCalled()
  })

  it('throws instead of sending when credentials are absent', async () => {
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    await expect(putR2Object('smoke/a.webp', 'x', 'image/webp')).rejects.toThrow(/not configured/)
  })
})

describe('createR2PresignedPutUrl', () => {
  it('signs a PUT on the account endpoint, bucket and key, host only', async () => {
    const { uploadUrl, publicUrl } = await createR2PresignedPutUrl('products/x.jpg', 300)
    const u = new URL(uploadUrl)
    expect(u.host).toBe('kenyonexpress-media.testaccount1234567890abcdef.r2.cloudflarestorage.com')
    expect(u.pathname).toBe('/products/x.jpg')
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(publicUrl).toBe('https://cdn.example.test/products/x.jpg')
    expect(send).not.toHaveBeenCalled()
  })
})

describe('uploadImageVariants', () => {
  it('uploads AVIF and WebP variants with matching content types', async () => {
    const original = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 254, g: 215, b: 0 } },
    })
      .png()
      .toBuffer()

    const result = await uploadImageVariants('products/abc', original)

    expect(result.width).toBe(1200)
    expect(result.height).toBe(900)
    expect(result.blurDataURL).toMatch(/^data:image\/webp;base64,/)
    expect(result.variants.map((v) => `${v.format}:${v.width}`)).toEqual([
      'webp:1200',
      'webp:800',
      'webp:400',
      'avif:1200',
    ])

    const inputs = sentCommands().map((c) => c.input)
    expect(inputs.map((i) => [i.Key, i.ContentType])).toEqual([
      ['products/abc/w1200.webp', 'image/webp'],
      ['products/abc/w800.webp', 'image/webp'],
      ['products/abc/w400.webp', 'image/webp'],
      ['products/abc/w1200.avif', 'image/avif'],
    ])

    // The bytes sent are the encoded formats, not the PNG original.
    const avifBody = inputs[3]?.Body as Buffer
    expect(avifBody.subarray(4, 12).toString('latin1')).toBe('ftypavif')
    const webpBody = inputs[0]?.Body as Buffer
    expect(webpBody.subarray(8, 12).toString('latin1')).toBe('WEBP')
    expect(result.variants[3]?.url).toBe('https://cdn.example.test/products/abc/w1200.avif')
  })

  it('stops at the first failed write', async () => {
    send.mockRejectedValueOnce(new Error('AccessDenied'))
    const original = await sharp({
      create: { width: 900, height: 900, channels: 3, background: { r: 51, g: 51, b: 51 } },
    })
      .jpeg()
      .toBuffer()
    await expect(uploadImageVariants('products/fail', original)).rejects.toThrow('AccessDenied')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
