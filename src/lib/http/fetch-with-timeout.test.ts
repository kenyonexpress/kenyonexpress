import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FETCH_TIMEOUT_MS, FetchTimeoutError, fetchWithTimeout } from './fetch-with-timeout'

/**
 * A fetch that never answers unless its own signal aborts it. This is the shape
 * the helper exists for: not a host that refuses the connection, which fails
 * fast on its own, but one that accepts it and then goes quiet.
 */
function silentFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  }) as unknown as typeof fetch
}

const originalFetch = globalThis.fetch
const originalTimeoutEnv = process.env.OUTBOUND_FETCH_TIMEOUT_MS

afterEach(() => {
  globalThis.fetch = originalFetch
  // Reflect.deleteProperty rather than `delete` (which biome forbids) and
  // rather than biome's suggested `= undefined` (which would be WRONG): a
  // process.env key assigned undefined holds the STRING 'undefined', so the
  // next test would read a five-character value where it expects absence.
  if (originalTimeoutEnv === undefined) {
    Reflect.deleteProperty(process.env, 'OUTBOUND_FETCH_TIMEOUT_MS')
  } else {
    process.env.OUTBOUND_FETCH_TIMEOUT_MS = originalTimeoutEnv
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('fetchWithTimeout', () => {
  it('returns the response and forwards init, when the host answers', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    globalThis.fetch = spy as unknown as typeof fetch

    const res = await fetchWithTimeout('https://example.test/x', {
      method: 'POST',
      body: 'payload',
    })

    expect(res.status).toBe(200)
    const [, init] = spy.mock.calls[0] as [unknown, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('payload')
    // The caller never sees `timeoutMs` leak into the RequestInit.
    expect('timeoutMs' in init).toBe(false)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws FetchTimeoutError, naming the url and the ceiling, when the host goes quiet', async () => {
    vi.useFakeTimers()
    globalThis.fetch = silentFetch()

    const pending = fetchWithTimeout('https://example.test/slow', { timeoutMs: 50 })
    const settled = pending.then(
      () => ({ rejected: false }) as const,
      (error: unknown) => ({ rejected: true, error }) as const,
    )
    await vi.advanceTimersByTimeAsync(50)

    const outcome = await settled
    expect(outcome.rejected).toBe(true)
    const error = (outcome as { error: unknown }).error
    expect(error).toBeInstanceOf(FetchTimeoutError)
    expect((error as FetchTimeoutError).message).toMatch(/example\.test\/slow exceeded 50ms/)
    expect((error as FetchTimeoutError).url).toBe('https://example.test/slow')
    expect((error as FetchTimeoutError).timeoutMs).toBe(50)
  })

  it('reads OUTBOUND_FETCH_TIMEOUT_MS per call, so a warm instance picks up a change', async () => {
    vi.useFakeTimers()
    globalThis.fetch = silentFetch()
    process.env.OUTBOUND_FETCH_TIMEOUT_MS = '25'

    const pending = fetchWithTimeout('https://example.test/env')
    const assertion = expect(pending).rejects.toMatchObject({ timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it('ignores a non-positive or unparseable OUTBOUND_FETCH_TIMEOUT_MS and uses the default', async () => {
    vi.useFakeTimers()
    globalThis.fetch = silentFetch()

    for (const bad of ['0', '-1', 'soon', '']) {
      process.env.OUTBOUND_FETCH_TIMEOUT_MS = bad
      const pending = fetchWithTimeout('https://example.test/bad')
      const assertion = expect(pending).rejects.toMatchObject({
        timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      })
      await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS)
      await assertion
    }
  })

  /**
   * The reason this cannot be a one-line `AbortSignal.timeout(ms)`. Passing that
   * as `signal` would drop the caller's own cancellation on the floor.
   */
  it("honours the caller's signal as well as the timer", async () => {
    globalThis.fetch = silentFetch()
    const caller = new AbortController()

    const pending = fetchWithTimeout('https://example.test/cancelled', {
      signal: caller.signal,
      timeoutMs: 60_000,
    })
    caller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('aborts immediately when the caller hands in an already-aborted signal', async () => {
    globalThis.fetch = silentFetch()

    await expect(
      fetchWithTimeout('https://example.test/dead', {
        signal: AbortSignal.abort(),
        timeoutMs: 60_000,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not dress a caller abort up as a timeout', async () => {
    globalThis.fetch = silentFetch()
    const caller = new AbortController()

    const pending = fetchWithTimeout('https://example.test/cancelled', {
      signal: caller.signal,
      timeoutMs: 60_000,
    })
    caller.abort()

    await expect(pending).rejects.not.toBeInstanceOf(FetchTimeoutError)
  })

  it('rethrows a transport failure untouched, rather than calling it a timeout', async () => {
    const boom = new TypeError('fetch failed')
    globalThis.fetch = vi.fn().mockRejectedValue(boom) as unknown as typeof fetch

    await expect(fetchWithTimeout('https://example.test/refused')).rejects.toBe(boom)
  })

  /**
   * The `finally` that `cardcom.ts` calls out. An uncleared timer keeps the
   * event loop alive and, worse, aborts a controller nothing is watching.
   */
  it('clears the timer on the success path, not only on the failure path', async () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch

    await fetchWithTimeout('https://example.test/fast', { timeoutMs: 1_000 })

    expect(clear).toHaveBeenCalled()
  })

  it('stops listening to the caller signal once the call settles', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')

    await fetchWithTimeout('https://example.test/fast', { signal: caller.signal })

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
