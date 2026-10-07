import { describe, expect, it } from 'vitest'
import { MAX_PURGE_KEYS, keyFromPath, keysFromBody } from './purge-request'

describe('keyFromPath', () => {
  it('reduces every stored spelling and the absolute URL to the bucket key', () => {
    expect(keyFromPath('/images/r2/products/b7.avif')).toBe('products/b7.avif')
    expect(keyFromPath('/images/products/b7.avif')).toBe('products/b7.avif')
    expect(keyFromPath('/images/cdn/wp/ab/abc.card.webp')).toBe('wp/ab/abc.card.webp')
    expect(keyFromPath('https://kenyonexpress.co.il/images/r2/products/b7.avif')).toBe(
      'products/b7.avif',
    )
    expect(keyFromPath('/images/products/a%20b.webp')).toBe('products/a b.webp')
  })

  it('refuses what the proxy would refuse', () => {
    expect(keyFromPath('/images/products/logo.svg')).toBeNull()
    expect(keyFromPath('/images/r2/secrets/x.webp')).toBeNull()
    expect(keyFromPath('/images/r2/products/../wp/a.webp')).toBeNull()
    expect(keyFromPath('/other/path.webp')).toBeNull()
    expect(keyFromPath('/images/products/%E0%A4%A.webp')).toBeNull()
    expect(keyFromPath('http://[bad')).toBeNull()
  })
})

describe('keysFromBody', () => {
  it('takes keys and paths, deduplicates, and lists what it rejected', () => {
    expect(
      keysFromBody({
        keys: ['products/a.webp', 'nope/a.webp'],
        paths: ['/images/products/a.webp', '/images/products/b.avif', '/x.webp'],
      }),
    ).toEqual({
      keys: ['products/a.webp', 'products/b.avif'],
      all: false,
      rejected: ['nope/a.webp', '/x.webp'],
    })
  })

  it('`all` alone is a valid request', () => {
    expect(keysFromBody({ all: true })).toEqual({ keys: [], all: true, rejected: [] })
    expect(keysFromBody({ all: false })).toEqual({ keys: [], all: false, rejected: [] })
  })

  it('caps the list', () => {
    const keys = Array.from({ length: MAX_PURGE_KEYS + 1 }, (_, i) => `products/${i}.webp`)
    expect(keysFromBody({ keys })).toBeNull()
  })

  it('reads a Supabase change on media_assets off both record and old_record', () => {
    expect(
      keysFromBody({
        type: 'UPDATE',
        table: 'media_assets',
        record: { id: 1, url: '/images/r2/products/new.webp' },
        old_record: { id: 1, url: 'https://kenyonexpress.co.il/images/products/old.webp' },
      }),
    ).toEqual({ keys: ['products/new.webp', 'products/old.webp'], all: false, rejected: [] })
    expect(
      keysFromBody({
        type: 'DELETE',
        table: 'media_assets',
        record: null,
        old_record: { url: '/images/products/x.webp' },
      }),
    ).toEqual({ keys: ['products/x.webp'], all: false, rejected: [] })
  })

  it('acknowledges another table with nothing to purge, and rejects anything else', () => {
    expect(keysFromBody({ type: 'INSERT', table: 'products', record: { id: 1 } })).toEqual({
      keys: [],
      all: false,
      rejected: [],
    })
    expect(keysFromBody({})).toBeNull()
    expect(keysFromBody({ keys: 'products/a.webp' })).toBeNull()
    expect(keysFromBody('x')).toBeNull()
  })
})
