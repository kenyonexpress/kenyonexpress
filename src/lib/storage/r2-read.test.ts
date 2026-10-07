import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('./r2-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./r2-service')>()),
  getR2Client: () => ({ send }),
}))

const { getR2ImageObject, imageBucketName, isR2ReadConfigured, isServableImageKey } = await import(
  './r2-read'
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('R2_ACCOUNT_ID', 'acc')
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
  vi.stubEnv('R2_BUCKET', '')
  vi.stubEnv('R2_BUCKET_NAME', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const s3Error = (name: string, httpStatusCode: number) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode } })

describe('imageBucketName', () => {
  it('prefers R2_BUCKET, then the Vercel spelling, then the product-images constant', () => {
    expect(imageBucketName()).toBe('kenyonexpress-product-images')
    vi.stubEnv('R2_BUCKET_NAME', 'from-vercel')
    expect(imageBucketName()).toBe('from-vercel')
    vi.stubEnv('R2_BUCKET', 'explicit')
    expect(imageBucketName()).toBe('explicit')
  })

  it('isR2ReadConfigured needs the three credentials', () => {
    expect(isR2ReadConfigured()).toBe(true)
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    expect(isR2ReadConfigured()).toBe(false)
  })
})

describe('isServableImageKey', () => {
  it('accepts the three promoted prefixes with raster extensions only', () => {
    expect(isServableImageKey('wp/ab/abcdef.webp')).toBe(true)
    expect(isServableImageKey('products/b7.avif')).toBe(true)
    expect(isServableImageKey('live-assets/wp-content/uploads/a.JPG')).toBe(true)
    for (const bad of [
      '',
      '/products/a.webp',
      'products/',
      'products/../wp/a.webp',
      'products/./a.webp',
      'other/a.webp',
      'products/a.svg',
      'products/a.json',
      'products/a',
      'products/a\u0000.webp',
      `products/${'x'.repeat(1100)}.webp`,
    ]) {
      expect(isServableImageKey(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('getR2ImageObject', () => {
  it('GETs from the image bucket and returns a web stream with the object metadata', async () => {
    vi.stubEnv('R2_BUCKET', 'kenyon-media')
    const stream = new ReadableStream()
    send.mockResolvedValue({
      Body: { transformToWebStream: () => stream },
      ContentType: 'image/webp',
      ContentLength: 42,
      ETag: '"e"',
    })
    const got = await getR2ImageObject('wp/ab/x.webp')

    expect(got).toEqual({
      status: 200,
      body: stream,
      contentType: 'image/webp',
      contentLength: 42,
      etag: '"e"',
    })
    const command = send.mock.calls[0]?.[0] as {
      input: Record<string, unknown>
      constructor: { name: string }
    }
    expect(command.constructor.name).toBe('GetObjectCommand')
    expect(command.input).toEqual({ Bucket: 'kenyon-media', Key: 'wp/ab/x.webp' })
  })

  it('forwards If-None-Match and maps the 304 the SDK throws', async () => {
    send.mockRejectedValue(s3Error('NotModified', 304))
    const got = await getR2ImageObject('products/a.webp', { ifNoneMatch: '"e"' })
    expect(got).toEqual({ status: 304, etag: '"e"' })
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> }
    expect(command.input.IfNoneMatch).toBe('"e"')
  })

  it('maps NoSuchKey and NotFound to 404 and rethrows everything else', async () => {
    send.mockRejectedValueOnce(s3Error('NoSuchKey', 404))
    await expect(getR2ImageObject('products/a.webp')).resolves.toEqual({ status: 404 })
    send.mockRejectedValueOnce(Object.assign(new Error('NotFound'), { name: 'NotFound' }))
    await expect(getR2ImageObject('products/a.webp', { method: 'HEAD' })).resolves.toEqual({
      status: 404,
    })
    send.mockRejectedValueOnce(s3Error('AccessDenied', 403))
    await expect(getR2ImageObject('products/a.webp')).rejects.toThrow('AccessDenied')
  })

  it('HEAD uses HeadObject, carries no body, and infers a content type from the key', async () => {
    send.mockResolvedValue({ ContentLength: 7 })
    const got = await getR2ImageObject('products/a.avif', { method: 'HEAD' })
    expect(got).toEqual({
      status: 200,
      body: null,
      contentType: 'image/avif',
      contentLength: 7,
      etag: null,
    })
    const command = send.mock.calls[0]?.[0] as { constructor: { name: string } }
    expect(command.constructor.name).toBe('HeadObjectCommand')
  })
})
