import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Upstash JSON cache. Proven at the command level: what `SET`/`GET`/`DEL`
 * leave for the transport, how the envelope decides fresh vs stale, and that
 * every failure is a miss rather than a throw.
 */

const upstashConfig = vi.fn()
const tryCommand = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/rate-limit/upstash', () => ({
  upstashConfig: () => upstashConfig(),
  tryCommand: (...args: unknown[]) => tryCommand(...args),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { del, get, set, withCache } = await import('./redis')

const CONFIG = { url: 'https://r.upstash.test', token: 't', timeoutMs: 1000 }

function envelope(value: unknown, storedAt: number): string {
  return JSON.stringify({ value, storedAt })
}

beforeEach(() => {
  upstashConfig.mockReset()
  upstashConfig.mockReturnValue(CONFIG)
  tryCommand.mockReset()
  logError.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-17T10:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('unconfigured', () => {
  it('get misses, set and del report false, nothing is sent', async () => {
    upstashConfig.mockReturnValue(null)
    expect(await get('k')).toBeNull()
    expect(await set('k', 1)).toBe(false)
    expect(await del('k')).toBe(false)
    expect(tryCommand).not.toHaveBeenCalled()
  })

  it('withCache runs the loader every time and stores nothing', async () => {
    upstashConfig.mockReturnValue(null)
    const loader = vi.fn(async (n: number) => n * 2)
    const cached = withCache((n: number) => `double:${n}`, loader, { ttlSeconds: 60 })
    expect(await cached(2)).toBe(4)
    expect(await cached(2)).toBe(4)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(tryCommand).not.toHaveBeenCalled()
  })
})

describe('set', () => {
  it('writes the envelope with EX when a ttl is given, rounding up', async () => {
    tryCommand.mockResolvedValue('OK')
    expect(await set('k', { a: 1 }, 1.2)).toBe(true)
    expect(tryCommand).toHaveBeenCalledWith(
      CONFIG,
      ['SET', 'k', envelope({ a: 1 }, Date.now()), 'EX', '2'],
      'cache.set_failed',
    )
  })

  it('writes without expiry when the ttl is omitted or zero', async () => {
    tryCommand.mockResolvedValue('OK')
    await set('k', 'v')
    await set('k', 'v', 0)
    for (const call of tryCommand.mock.calls) {
      expect((call[1] as string[]).length).toBe(3)
    }
  })

  it('reports false when the transport failed', async () => {
    tryCommand.mockResolvedValue(null)
    expect(await set('k', 'v', 10)).toBe(false)
  })
})

describe('del', () => {
  it('sends DEL and reports the outcome', async () => {
    tryCommand.mockResolvedValue(1)
    expect(await del('k')).toBe(true)
    expect(tryCommand).toHaveBeenCalledWith(CONFIG, ['DEL', 'k'], 'cache.del_failed')
    tryCommand.mockResolvedValue(null)
    expect(await del('k')).toBe(false)
  })
})

describe('get', () => {
  it('returns the stored value out of its envelope', async () => {
    tryCommand.mockResolvedValue(envelope({ n: 7 }, Date.now()))
    expect(await get<{ n: number }>('k')).toEqual({ n: 7 })
    expect(tryCommand).toHaveBeenCalledWith(CONFIG, ['GET', 'k'], 'cache.get_failed')
  })

  it('treats a missing key, a foreign payload and a bad envelope as a miss', async () => {
    for (const raw of [
      null,
      42,
      'not json',
      'null',
      '"str"',
      JSON.stringify({ value: 1 }),
      JSON.stringify({ storedAt: 1 }),
      JSON.stringify({ storedAt: 'x', value: 1 }),
    ]) {
      tryCommand.mockResolvedValue(raw)
      expect(await get('k'), String(raw)).toBeNull()
    }
  })
})

describe('withCache', () => {
  const key = (id: string) => `item:${id}`

  it('loads, stores with ttl + swr as the Redis expiry, and returns on a miss', async () => {
    tryCommand.mockResolvedValue(null)
    const loader = vi.fn(async (id: string) => ({ id }))
    const cached = withCache(key, loader, { ttlSeconds: 60, staleWhileRevalidateSeconds: 30 })

    expect(await cached('a')).toEqual({ id: 'a' })
    expect(loader).toHaveBeenCalledWith('a')
    expect(tryCommand).toHaveBeenNthCalledWith(1, CONFIG, ['GET', 'item:a'], 'cache.get_failed')
    expect(tryCommand).toHaveBeenNthCalledWith(
      2,
      CONFIG,
      ['SET', 'item:a', envelope({ id: 'a' }, Date.now()), 'EX', '90'],
      'cache.set_failed',
    )
  })

  it('serves a fresh hit without touching the loader', async () => {
    tryCommand.mockResolvedValue(envelope('cached', Date.now() - 59_000))
    const loader = vi.fn(async () => 'fresh')
    const cached = withCache(key, loader, { ttlSeconds: 60 })
    expect(await cached('a')).toBe('cached')
    expect(loader).not.toHaveBeenCalled()
  })

  it('serves a stale hit immediately and refreshes once in the background', async () => {
    tryCommand.mockImplementation(async (_c: unknown, args: string[]) =>
      args[0] === 'GET' ? envelope('stale', Date.now() - 70_000) : 'OK',
    )
    let release: () => void = () => {}
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('fresh')
        }),
    )
    const cached = withCache(key, loader, { ttlSeconds: 60, staleWhileRevalidateSeconds: 30 })

    // Two concurrent stale hits share one refresh.
    expect(await cached('a')).toBe('stale')
    expect(await cached('a')).toBe('stale')
    expect(loader).toHaveBeenCalledTimes(1)

    release()
    await vi.runAllTimersAsync()
    const setCalls = tryCommand.mock.calls.filter((c) => (c[1] as string[])[0] === 'SET')
    expect(setCalls).toHaveLength(1)
    expect((setCalls[0]?.[1] as string[])[2]).toBe(envelope('fresh', Date.now()))

    // The refresh finished, so the next stale hit may start another.
    expect(await cached('a')).toBe('stale')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('logs a failed background refresh and keeps serving the stale value', async () => {
    tryCommand.mockResolvedValue(envelope('stale', Date.now() - 70_000))
    const loader = vi.fn(async () => {
      throw new Error('upstream down')
    })
    const cached = withCache(key, loader, { ttlSeconds: 60, staleWhileRevalidateSeconds: 30 })

    expect(await cached('b')).toBe('stale')
    await vi.runAllTimersAsync()
    expect(logError).toHaveBeenCalledWith('cache.revalidate_failed', {
      key: 'item:b',
      reason: 'upstream down',
    })
  })

  it('treats an entry past ttl + swr as a miss and reloads inline', async () => {
    tryCommand.mockImplementation(async (_c: unknown, args: string[]) =>
      args[0] === 'GET' ? envelope('ancient', Date.now() - 100_000) : 'OK',
    )
    const loader = vi.fn(async () => 'fresh')
    const cached = withCache(key, loader, { ttlSeconds: 60, staleWhileRevalidateSeconds: 30 })
    expect(await cached('c')).toBe('fresh')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('with no swr window, an expired entry is recomputed inline', async () => {
    tryCommand.mockImplementation(async (_c: unknown, args: string[]) =>
      args[0] === 'GET' ? envelope('old', Date.now() - 61_000) : 'OK',
    )
    const loader = vi.fn(async () => 'fresh')
    const cached = withCache(key, loader, { ttlSeconds: 60 })
    expect(await cached('d')).toBe('fresh')
    const setCall = tryCommand.mock.calls.find((c) => (c[1] as string[])[0] === 'SET')
    expect((setCall?.[1] as string[]).slice(3)).toEqual(['EX', '60'])
  })
})
