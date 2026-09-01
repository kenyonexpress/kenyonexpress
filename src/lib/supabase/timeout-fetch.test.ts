import {
  SupabaseTimeoutError,
  createTimeoutFetch,
  supabaseTimeoutMs,
} from '@/lib/supabase/timeout-fetch'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const env = (v?: string) => ({ SUPABASE_TIMEOUT_MS: v }) as unknown as NodeJS.ProcessEnv

describe('the deadline itself', () => {
  it('defaults to 10s', () => {
    expect(supabaseTimeoutMs(env(undefined))).toBe(10_000)
  })

  it('takes a positive integer from the environment', () => {
    expect(supabaseTimeoutMs(env('2500'))).toBe(2500)
  })

  // A malformed value must not become a zero or negative timeout, which would
  // abort every request instantly and read as "Supabase is down".
  it('ignores anything that is not a positive integer', () => {
    for (const raw of ['0', '-1', 'abc', '1.5', '']) {
      expect(supabaseTimeoutMs(env(raw))).toBe(10_000)
    }
  })
})

describe('a slow Supabase is aborted rather than waited on', () => {
  it('throws SupabaseTimeoutError when the deadline passes', async () => {
    const hang = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
        }),
    ) as unknown as typeof fetch

    const wrapped = createTimeoutFetch(hang, env('20'))
    await expect(wrapped('https://db.test/rest/v1/products')).rejects.toBeInstanceOf(
      SupabaseTimeoutError,
    )
  })

  it('passes an abort signal to the underlying fetch', async () => {
    const ok = vi.fn().mockResolvedValue(new Response('{}'))
    const wrapped = createTimeoutFetch(ok as unknown as typeof fetch, env('5000'))
    await wrapped('https://db.test/rest/v1/products')
    expect(ok.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns the response untouched when the call is fast', async () => {
    const ok = vi.fn().mockResolvedValue(new Response('{"ok":true}'))
    const wrapped = createTimeoutFetch(ok as unknown as typeof fetch, env('5000'))
    const response = await wrapped('https://db.test/rest/v1/products')
    expect(await response.text()).toBe('{"ok":true}')
  })

  // A network error is not a timeout, and reporting it as one would send an
  // incident in the wrong direction.
  it('rethrows a non-timeout failure as itself', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const wrapped = createTimeoutFetch(boom as unknown as typeof fetch, env('5000'))
    await expect(wrapped('https://db.test/rest/v1/products')).rejects.toThrow('ECONNREFUSED')
  })
})

describe("the caller's own signal keeps working", () => {
  // supabase-js passes its own signal for .abortSignal() queries and realtime
  // teardown. Overwriting it would silently break cancellation.
  it('aborts when the caller aborts, before the deadline', async () => {
    const hang = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
        }),
    ) as unknown as typeof fetch

    const caller = new AbortController()
    const wrapped = createTimeoutFetch(hang, env('60000'))
    const inFlight = wrapped('https://db.test/rest/v1/products', { signal: caller.signal })
    caller.abort()

    // Not a SupabaseTimeoutError: the deadline never fired, the caller did.
    await expect(inFlight).rejects.not.toBeInstanceOf(SupabaseTimeoutError)
  })

  it('aborts immediately when handed an already-aborted signal', async () => {
    const hang = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) reject(new Error('AbortError'))
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
        }),
    ) as unknown as typeof fetch

    const caller = AbortSignal.abort()
    const wrapped = createTimeoutFetch(hang, env('60000'))
    await expect(
      wrapped('https://db.test/rest/v1/products', { signal: caller }),
    ).rejects.toBeTruthy()
  })
})
