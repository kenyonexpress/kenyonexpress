import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isForbiddenR2Error, localPathForKey, localUrlForKey, makeStore } from './store.mjs'

describe('isForbiddenR2Error', () => {
  it('recognises every shape a refused R2 takes', () => {
    for (const message of [
      'R2 PUT wp/ab/x.webp failed: 403 <Error><Code>AccessDenied</Code></Error>',
      'Please enable R2 through the Cloudflare Dashboard (10042)',
      'R2 is not configured (R2_ACCOUNT_ID / ...)',
      'SignatureDoesNotMatch',
      'InvalidAccessKeyId',
    ]) {
      expect(isForbiddenR2Error(new Error(message)), message).toBe(true)
    }
  })

  it('does not treat transient failures as refusals', () => {
    for (const message of [
      'R2 PUT x failed: 500 internal error',
      'R2 PUT x failed: 503 slow down',
      'fetch failed',
      'The operation was aborted due to timeout',
    ]) {
      expect(isForbiddenR2Error(new Error(message)), message).toBe(false)
    }
  })
})

describe('local key mapping', () => {
  it('keeps the R2 key verbatim under the local root and the public prefix', () => {
    const key = 'wp/ab/abc123.card.webp'
    expect(localPathForKey('/tmp/root', key)).toBe('/tmp/root/wp/ab/abc123.card.webp')
    expect(localUrlForKey(key)).toBe('/images/cdn/wp/ab/abc123.card.webp')
  })
})

describe('makeStore', () => {
  let root
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'media-ingest-store-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const bytes = Buffer.from('not really an image')

  it('starts local when R2 is not configured, and writes real files', async () => {
    const r2Put = vi.fn()
    const store = makeStore({ r2: { isR2Configured: () => false, r2Put }, localRoot: root })

    const result = await store.put('wp/ab/hash.webp', bytes, 'image/webp')

    expect(result).toEqual({
      storage: 'local',
      key: 'wp/ab/hash.webp',
      url: '/images/cdn/wp/ab/hash.webp',
    })
    expect(readFileSync(join(root, 'wp/ab/hash.webp'))).toEqual(bytes)
    expect(r2Put).not.toHaveBeenCalled()
    expect(store.mode).toBe('local')
  })

  it('uses R2 while it answers', async () => {
    const r2Put = vi.fn(async (key) => ({ key, url: `https://cdn.test/${key}`, skipped: false }))
    const store = makeStore({ r2: { isR2Configured: () => true, r2Put }, localRoot: root })

    const result = await store.put('wp/ab/hash.webp', bytes, 'image/webp')

    expect(result.storage).toBe('r2')
    expect(result.url).toBe('https://cdn.test/wp/ab/hash.webp')
    expect(store.mode).toBe('r2')
    expect(existsSync(join(root, 'wp/ab/hash.webp'))).toBe(false)
  })

  it('falls back on the first 403 and never asks R2 again', async () => {
    const r2Put = vi.fn(async () => {
      throw new Error('R2 PUT wp/ab/hash.webp failed: 403 AccessDenied')
    })
    const store = makeStore({ r2: { isR2Configured: () => true, r2Put }, localRoot: root })

    const first = await store.put('wp/ab/one.webp', bytes, 'image/webp')
    const second = await store.put('wp/ab/two.webp', bytes, 'image/webp')

    expect(first.storage).toBe('local')
    expect(second.storage).toBe('local')
    expect(r2Put).toHaveBeenCalledTimes(1)
    expect(store.mode).toBe('local')
    expect(store.fallbackReason).toMatch(/403/)
    expect(existsSync(join(root, 'wp/ab/one.webp'))).toBe(true)
    expect(existsSync(join(root, 'wp/ab/two.webp'))).toBe(true)
  })

  it('lets a non-403 error escape instead of silently going local', async () => {
    const r2Put = vi.fn(async () => {
      throw new Error('R2 PUT x failed: 503 slow down')
    })
    const store = makeStore({ r2: { isR2Configured: () => true, r2Put }, localRoot: root })

    await expect(store.put('wp/ab/hash.webp', bytes, 'image/webp')).rejects.toThrow(/503/)
    expect(store.mode).toBe('r2')
  })
})
