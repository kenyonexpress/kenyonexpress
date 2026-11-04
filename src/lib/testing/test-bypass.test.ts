import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TEST_BYPASS_HEADER,
  requestHasTestBypass,
  testBypassMatches,
  testBypassSecret,
} from './test-bypass'

const SECRET = 'a'.repeat(64)

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('next/headers')
})

describe('testBypassSecret', () => {
  it('is null when the variable is unset, empty, or shorter than 32 characters', () => {
    expect(testBypassSecret({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(testBypassSecret({ TEST_BYPASS_SECRET: '' } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(
      testBypassSecret({ TEST_BYPASS_SECRET: '   ' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(
      testBypassSecret({ TEST_BYPASS_SECRET: 'short' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(
      testBypassSecret({ TEST_BYPASS_SECRET: 'x'.repeat(31) } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it('returns the trimmed secret at 32 characters or more', () => {
    expect(
      testBypassSecret({ TEST_BYPASS_SECRET: ` ${SECRET} ` } as unknown as NodeJS.ProcessEnv),
    ).toBe(SECRET)
  })
})

describe('testBypassMatches', () => {
  const env = { TEST_BYPASS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv

  it('matches only the exact secret', () => {
    expect(testBypassMatches(SECRET, env)).toBe(true)
    expect(testBypassMatches(` ${SECRET}\n`, env)).toBe(true)
    expect(testBypassMatches(`${SECRET}b`, env)).toBe(false)
    expect(testBypassMatches(SECRET.slice(0, -1), env)).toBe(false)
    expect(testBypassMatches(`b${SECRET.slice(1)}`, env)).toBe(false)
  })

  it('never matches a missing header, and never matches when no secret is configured', () => {
    expect(testBypassMatches(null, env)).toBe(false)
    expect(testBypassMatches(undefined, env)).toBe(false)
    expect(testBypassMatches('', env)).toBe(false)
    // The trap this guards: undefined === undefined would be "true".
    expect(testBypassMatches(undefined, {} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(
      testBypassMatches('short', { TEST_BYPASS_SECRET: 'short' } as unknown as NodeJS.ProcessEnv),
    ).toBe(false)
  })
})

describe('requestHasTestBypass', () => {
  it('does not consult next/headers when no secret is configured', async () => {
    const headers = vi.fn()
    vi.doMock('next/headers', () => ({ headers }))
    expect(await requestHasTestBypass({} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(headers).not.toHaveBeenCalled()
  })

  it('answers true when the request header equals the configured secret', async () => {
    vi.doMock('next/headers', () => ({
      headers: async () => new Headers({ [TEST_BYPASS_HEADER]: SECRET }),
    }))
    const { requestHasTestBypass: fresh } = await import('./test-bypass')
    expect(await fresh({ TEST_BYPASS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('answers false for a wrong or absent header', async () => {
    vi.doMock('next/headers', () => ({
      headers: async () => new Headers({ [TEST_BYPASS_HEADER]: 'nope' }),
    }))
    const { requestHasTestBypass: fresh } = await import('./test-bypass')
    expect(await fresh({ TEST_BYPASS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('answers false outside a request scope, where headers() throws', async () => {
    vi.doMock('next/headers', () => ({
      headers: async () => {
        throw new Error('headers was called outside a request scope')
      },
    }))
    const { requestHasTestBypass: fresh } = await import('./test-bypass')
    expect(await fresh({ TEST_BYPASS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
})
