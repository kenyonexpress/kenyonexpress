import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { evaluateWindow, parseWindowState, slidingWindowScript } from './sliding-window'

const config = { url: 'https://eu1.upstash.io', token: 'tok', timeoutMs: 1000 }

/**
 * `vi.fn()` types its `calls` as possibly-empty, and under
 * `noUncheckedIndexedAccess` indexing it yields `undefined`. Casting that away
 * at each use site would also cast away the case this throws for: a test that
 * asserts on the body of a request the code never sent, and passes because
 * `undefined` matched nothing.
 */
function fetchCall(
  spy: { mock: { calls: unknown[] } },
  index = 0,
): [string, RequestInit & { cache?: string }] {
  const call = spy.mock.calls[index] as [string, RequestInit & { cache?: string }] | undefined
  if (!call) throw new Error(`fetch call #${index} was never made`)
  return call
}

function requestBody(spy: { mock: { calls: unknown[] } }, index = 0): string[] {
  return JSON.parse(fetchCall(spy, index)[1].body as string) as string[]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseWindowState', () => {
  it('reads the three-element reply Redis returns', () => {
    expect(parseWindowState([1, 3, 1_700_000_000_000])).toEqual({
      allowed: true,
      used: 3,
      resetAtMs: 1_700_000_000_000,
    })
  })

  it('accepts integers widened to strings', () => {
    // Upstash has been observed returning large integers as strings. Read as a
    // number that comes out NaN, `resetAtMs` would be rendered straight into a
    // `Retry-After` header.
    expect(parseWindowState(['0', '5', '1700000000000'])).toEqual({
      allowed: false,
      used: 5,
      resetAtMs: 1_700_000_000_000,
    })
  })

  it('rejects anything that is not three readable numbers', () => {
    expect(parseWindowState(null)).toBeNull()
    expect(parseWindowState('OK')).toBeNull()
    expect(parseWindowState([1, 2])).toBeNull()
    expect(parseWindowState([1, 2, 'later'])).toBeNull()
    expect(parseWindowState([1, 2, Number.NaN])).toBeNull()
  })
})

describe('the script', () => {
  const script = slidingWindowScript()

  it('prunes the window before it counts it', () => {
    // Counting first and pruning after would refuse a caller on the strength of
    // requests that have already aged out.
    expect(script.indexOf('ZREMRANGEBYSCORE')).toBeLessThan(script.indexOf('ZCARD'))
  })

  it('never adds a member on the refusal branch', () => {
    // A refused request that still writes turns the window into a rolling
    // extension of itself: a caller hammering a spent limit would never see it
    // reopen, because every refusal pushes the oldest entry forward.
    const branchStart = script.indexOf('if used >= limit')
    const refusalBranch = script.slice(branchStart, script.indexOf('end', branchStart))
    expect(refusalBranch).not.toContain('ZADD')
  })

  it('renews a TTL of exactly one window on every accepted request', () => {
    expect(script).toContain("redis.call('PEXPIRE', key, window)")
  })
})

describe('evaluateWindow', () => {
  function capture(result: unknown) {
    const spy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', spy)
    return spy
  }

  it('sends EVAL with one key and four stringified arguments', async () => {
    const spy = capture([1, 1, 1_700_000_060_000])

    await evaluateWindow(config, {
      key: 'rl:v1:login:203.0.113.5',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
      limit: 10,
      member: 'member-1',
    })

    const body = requestBody(spy)
    expect(body[0]).toBe('EVAL')
    expect(body[2]).toBe('1')
    expect(body[3]).toBe('rl:v1:login:203.0.113.5')
    expect(body.slice(4)).toEqual(['1700000000000', '60000', '10', 'member-1'])
    // Every argument on the wire is a string: the Lua `tonumber()` calls are
    // the one place a value becomes a number.
    expect(body.every((part) => typeof part === 'string')).toBe(true)
  })

  it('returns null rather than a half-read state when the reply is the wrong shape', async () => {
    capture('OK')
    const state = await evaluateWindow(config, {
      key: 'k',
      nowMs: 1,
      windowMs: 1000,
      limit: 1,
      member: 'm',
    })
    expect(state).toBeNull()
  })
})
