import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } from './r2'

/**
 * SigV4 presigning without the SDK. The signature is recomputed here with
 * node:crypto from the URL the module produced, so a drift in the canonical
 * request (a header added, a key encoded differently) fails as a signature
 * mismatch rather than as a 403 from Cloudflare in production.
 */

const FAKE_ENV = {
  R2_ACCOUNT_ID: 'acct1234567890abcdef',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'test-secret-not-real',
  R2_BUCKET: 'kenyon-media',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.test/',
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

/** The reference SigV4 for a presigned PUT with only `host` signed. */
function expectedSignature(url: URL, amzDate: string): string {
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const canonicalQuery = [...url.searchParams.entries()]
    .filter(([k]) => k !== 'X-Amz-Signature')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const canonicalRequest = [
    'PUT',
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')
  const kDate = hmac(`AWS4${FAKE_ENV.R2_SECRET_ACCESS_KEY}`, dateStamp)
  const kRegion = hmac(kDate, 'auto')
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  return hmac(kSigning, stringToSign).toString('hex')
}

beforeEach(() => {
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T10:20:30.456Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('isR2Configured', () => {
  it('is true only when all five variables are set', () => {
    expect(isR2Configured()).toBe(true)
    for (const key of Object.keys(FAKE_ENV)) {
      vi.stubEnv(key, '')
      expect(isR2Configured(), key).toBe(false)
      vi.stubEnv(key, FAKE_ENV[key as keyof typeof FAKE_ENV])
    }
  })
})

describe('r2PublicUrl', () => {
  it('joins the CDN base and the key without a double slash', () => {
    expect(r2PublicUrl('products/a.webp')).toBe('https://cdn.example.test/products/a.webp')
  })

  it('degrades to a root-relative path when the base is unset', () => {
    vi.stubEnv('R2_PUBLIC_BASE_URL', '')
    expect(r2PublicUrl('products/a.webp')).toBe('/products/a.webp')
  })
})

describe('createR2PresignedPutUrl', () => {
  it('signs a PUT against the account host, bucket and encoded key', async () => {
    const { uploadUrl, publicUrl } = await createR2PresignedPutUrl("products/a b(1)'*!.webp")
    const url = new URL(uploadUrl)

    expect(url.protocol).toBe('https:')
    expect(url.host).toBe('acct1234567890abcdef.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/kenyon-media/products/a%20b%281%29%27%2A%21.webp')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'AKIATESTKEY/20260917/auto/s3/aws4_request',
    )
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260917T102030Z')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(publicUrl).toBe("https://cdn.example.test/products/a b(1)'*!.webp")
  })

  it('produces the SigV4 signature a reference implementation computes', async () => {
    const { uploadUrl } = await createR2PresignedPutUrl('products/שלום/a.webp', 300)
    const url = new URL(uploadUrl)

    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.pathname).toBe('/kenyon-media/products/%D7%A9%D7%9C%D7%95%D7%9D/a.webp')
    const signature = url.searchParams.get('X-Amz-Signature')
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
    expect(signature).toBe(expectedSignature(url, '20260917T102030Z'))
    // The signature is the last parameter, after the sorted canonical query.
    expect(uploadUrl.endsWith(`&X-Amz-Signature=${signature}`)).toBe(true)
  })

  it('changes the signature when the key, the secret or the clock changes', async () => {
    const base = new URL((await createR2PresignedPutUrl('k.webp')).uploadUrl)
    const otherKey = new URL((await createR2PresignedPutUrl('k2.webp')).uploadUrl)
    expect(otherKey.searchParams.get('X-Amz-Signature')).not.toBe(
      base.searchParams.get('X-Amz-Signature'),
    )

    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'rotated')
    const otherSecret = new URL((await createR2PresignedPutUrl('k.webp')).uploadUrl)
    expect(otherSecret.searchParams.get('X-Amz-Signature')).not.toBe(
      base.searchParams.get('X-Amz-Signature'),
    )
    vi.stubEnv('R2_SECRET_ACCESS_KEY', FAKE_ENV.R2_SECRET_ACCESS_KEY)

    vi.setSystemTime(new Date('2026-09-18T10:20:30.456Z'))
    const nextDay = new URL((await createR2PresignedPutUrl('k.webp')).uploadUrl)
    expect(nextDay.searchParams.get('X-Amz-Date')).toBe('20260918T102030Z')
    expect(nextDay.searchParams.get('X-Amz-Signature')).not.toBe(
      base.searchParams.get('X-Amz-Signature'),
    )
  })
})
