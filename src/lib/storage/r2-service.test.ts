// Presigning is pure computation (SigV4 over fake credentials), so these tests
// exercise the real SDK code path offline. Nothing here talks to Cloudflare.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createR2SignedDownloadUrl,
  createR2SignedUploadUrl,
  isR2StorageConfigured,
  r2ObjectPublicUrl,
} from './r2-service'

const FAKE_ENV = {
  R2_ACCOUNT_ID: 'testaccount1234567890abcdef',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'test-secret-not-real',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.test/',
}

beforeEach(() => {
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isR2StorageConfigured', () => {
  it('is true with account id and both key halves', () => {
    expect(isR2StorageConfigured()).toBe(true)
  })

  it('is false when any credential is missing', () => {
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
    expect(isR2StorageConfigured()).toBe(false)
  })
})

describe('r2ObjectPublicUrl', () => {
  it('builds a CDN URL for the public bucket, without a double slash', () => {
    expect(r2ObjectPublicUrl('product-images', 'products/a.webp')).toBe(
      'https://cdn.example.test/products/a.webp',
    )
  })

  it('refuses private buckets', () => {
    expect(() => r2ObjectPublicUrl('coupon-qrcodes', 'qr/a.png')).toThrow(/private/)
    expect(() => r2ObjectPublicUrl('user-uploads', 'u/a.pdf')).toThrow(/private/)
  })

  it('refuses to build a URL when the CDN base is unset', () => {
    vi.stubEnv('R2_PUBLIC_BASE_URL', '')
    expect(() => r2ObjectPublicUrl('product-images', 'products/a.webp')).toThrow(
      /R2_PUBLIC_BASE_URL/,
    )
  })
})

describe('createR2SignedUploadUrl', () => {
  it('signs a PUT against the right account, bucket and key', async () => {
    const { uploadUrl, publicUrl } = await createR2SignedUploadUrl(
      'product-images',
      'products/a.webp',
      'image/webp',
    )
    const url = new URL(uploadUrl)
    // Virtual-hosted addressing: bucket.account.r2.cloudflarestorage.com
    expect(url.hostname).toBe(
      'kenyonexpress-product-images.testaccount1234567890abcdef.r2.cloudflarestorage.com',
    )
    expect(url.pathname).toContain('products/a.webp')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIATESTKEY')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(publicUrl).toBe('https://cdn.example.test/products/a.webp')
  })

  it('returns no public URL for a private bucket', async () => {
    const { publicUrl } = await createR2SignedUploadUrl('coupon-qrcodes', 'qr/a.png', 'image/png')
    expect(publicUrl).toBeNull()
  })

  it('honours a custom expiry', async () => {
    const { uploadUrl } = await createR2SignedUploadUrl(
      'user-uploads',
      'u/a.pdf',
      'application/pdf',
      60,
    )
    expect(new URL(uploadUrl).searchParams.get('X-Amz-Expires')).toBe('60')
  })

  it('rejects a content type the bucket does not allow', async () => {
    await expect(
      createR2SignedUploadUrl('coupon-qrcodes', 'qr/a.gif', 'image/gif'),
    ).rejects.toThrow(/not allowed/)
  })

  it('rejects traversal keys before signing anything', async () => {
    await expect(
      createR2SignedUploadUrl('product-images', '../secrets.env', 'image/png'),
    ).rejects.toThrow()
  })
})

describe('createR2SignedDownloadUrl', () => {
  it('signs a GET for a private bucket with the default one-hour expiry', async () => {
    const url = new URL(await createR2SignedDownloadUrl('coupon-qrcodes', 'qr/order-1.png'))
    expect(url.hostname.startsWith('kenyonexpress-coupon-qrcodes.')).toBe(true)
    expect(url.pathname).toContain('qr/order-1.png')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('throws when credentials are missing instead of signing garbage', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', '')
    await expect(createR2SignedDownloadUrl('user-uploads', 'u/a.pdf')).rejects.toThrow(
      /not configured/,
    )
  })
})
