import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` is hoisted above every import and every `const`, so the fake store
// has to be hoisted with it or the factory runs before the map exists.
const { store, redis } = vi.hoisted(() => {
  const store = new Map<string, { value: unknown; ttl?: number }>()
  const redis = {
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key)?.value : null)),
    set: vi.fn(async (key: string, value: unknown, ttl?: number) => {
      store.set(key, { value, ttl })
      return true
    }),
    del: vi.fn(async (key: string) => store.delete(key)),
  }
  return { store, redis }
})
vi.mock('@/lib/cache/redis', () => redis)

import {
  CART_SESSION_TTL_SECONDS,
  cartSessionKey,
  forgetCartRow,
  readCartRowThrough,
  rememberCartRow,
} from './session-cache'

const user = { kind: 'user', id: '11111111-1111-4111-8111-111111111111' } as const
const guest = { kind: 'guest', id: '22222222-2222-4222-8222-222222222222' } as const

beforeEach(() => {
  store.clear()
  redis.get.mockClear()
  redis.set.mockClear()
  redis.del.mockClear()
})

describe('cartSessionKey', () => {
  it('namespaces by scope kind so a guest id can never read an account cart', () => {
    expect(cartSessionKey(user)).toBe(`sess:cart:v1:user:${user.id}`)
    expect(cartSessionKey(guest)).toBe(`sess:cart:v1:guest:${guest.id}`)
    expect(cartSessionKey({ kind: 'guest', id: user.id })).not.toBe(cartSessionKey(user))
  })
})

describe('readCartRowThrough', () => {
  it('loads from origin on a miss and stores the answer with the session TTL', async () => {
    const row = { id: 'cart-1', items: [{ product_id: 'p', variant_id: null, quantity: 1 }] }
    const load = vi.fn(async () => row)

    const first = await readCartRowThrough(user, load)
    expect(first).toEqual({ row, source: 'origin' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(redis.set).toHaveBeenCalledWith(cartSessionKey(user), { row }, CART_SESSION_TTL_SECONDS)

    const second = await readCartRowThrough(user, load)
    expect(second).toEqual({ row, source: 'cache' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('caches the absence of a cart, which is the read a first visit pays', async () => {
    const load = vi.fn(async () => null)
    expect(await readCartRowThrough(guest, load)).toEqual({ row: null, source: 'origin' })
    expect(await readCartRowThrough(guest, load)).toEqual({ row: null, source: 'cache' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not cache a loader failure', async () => {
    const load = vi.fn(async () => {
      throw new Error('PGRST116')
    })
    await expect(readCartRowThrough(user, load)).rejects.toThrow('PGRST116')
    expect(redis.set).not.toHaveBeenCalled()
  })

  it('treats a foreign payload under the key as a miss', async () => {
    // A value that is not the envelope shape -- something else wrote the key,
    // or an older version of this module did -- must not be returned as a row.
    store.set(cartSessionKey(user), { value: 'not-an-envelope' })
    const load = vi.fn(async () => ({ id: 'fresh', items: [] }))
    expect(await readCartRowThrough(user, load)).toEqual({
      row: { id: 'fresh', items: [] },
      source: 'origin',
    })
  })

  it('falls through to origin when Redis is unavailable', async () => {
    redis.get.mockResolvedValueOnce(null)
    redis.set.mockResolvedValueOnce(false)
    const load = vi.fn(async () => ({ id: 'c', items: [] }))
    expect(await readCartRowThrough(user, load)).toEqual({
      row: { id: 'c', items: [] },
      source: 'origin',
    })
  })
})

describe('write-through and forget', () => {
  it('rememberCartRow replaces the entry so the next read sees the saved row', async () => {
    await readCartRowThrough(user, async () => ({ id: 'c', items: [] }))
    await rememberCartRow(user, {
      id: 'c',
      items: [{ product_id: 'p', variant_id: null, quantity: 2 }],
    })
    const { row, source } = await readCartRowThrough(user, async () => {
      throw new Error('must not reload')
    })
    expect(source).toBe('cache')
    expect(row).toEqual({ id: 'c', items: [{ product_id: 'p', variant_id: null, quantity: 2 }] })
  })

  it('forgetCartRow drops the entry and the next read goes to origin', async () => {
    await readCartRowThrough(guest, async () => ({ id: 'g', items: [] }))
    await forgetCartRow(guest)
    expect(redis.del).toHaveBeenCalledWith(cartSessionKey(guest))
    const load = vi.fn(async () => null)
    expect(await readCartRowThrough(guest, load)).toEqual({ row: null, source: 'origin' })
  })
})
