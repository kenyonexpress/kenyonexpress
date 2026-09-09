import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserAuthCookieOptions, supabaseAuthCookieOptions } from './cookie-options'

/**
 * The session cookie carries `Secure`, at all three places that write it.
 *
 * WHY A TEST AND NOT A COMMENT. `@supabase/ssr` has no `secure` in its
 * `DEFAULT_COOKIE_OPTIONS`, so this flag exists only because each call site
 * passes `cookieOptions`. That is a line a refactor drops without breaking
 * anything visible: the session keeps working, the flag just stops being sent,
 * and no page, test or type notices. Three assertions, one per writer.
 */

const CAPTURED: { server: unknown[]; browser: unknown[] } = { server: [], browser: [] }

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookieOptions?: unknown }) => {
    CAPTURED.server.push(options.cookieOptions)
    return { auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }
  },
  createBrowserClient: (_url: string, _key: string, options: { cookieOptions?: unknown }) => {
    CAPTURED.browser.push(options.cookieOptions)
    return {}
  },
}))

vi.mock('@/lib/supabase/anon-key', () => ({ requireAnonKey: () => 'anon-key-for-test' }))

afterEach(() => {
  CAPTURED.server = []
  CAPTURED.browser = []
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('supabaseAuthCookieOptions', () => {
  it('is secure behind TLS and not behind plain http', () => {
    expect(supabaseAuthCookieOptions('https')).toEqual({ secure: true })
    expect(supabaseAuthCookieOptions('https:')).toEqual({ secure: true })
    // A forwarded chain: the FIRST hop is the one the client used.
    expect(supabaseAuthCookieOptions('https,http')).toEqual({ secure: true })
    expect(supabaseAuthCookieOptions('http')).toEqual({ secure: false })
    expect(supabaseAuthCookieOptions(null)).toEqual({ secure: false })
    expect(supabaseAuthCookieOptions(undefined)).toEqual({ secure: false })
  })

  it('never sets httpOnly, because the browser client reads the cookie back', () => {
    // Stated as a test because "we forgot" and "we decided" look identical in a
    // diff. `createBrowserClient` stores the session in `document.cookie`;
    // httpOnly would hide it from the only reader it has.
    expect(supabaseAuthCookieOptions('https')).not.toHaveProperty('httpOnly')
    expect(browserAuthCookieOptions()).not.toHaveProperty('httpOnly')
  })
})

describe('browserAuthCookieOptions', () => {
  it('follows the page protocol', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    expect(browserAuthCookieOptions()).toEqual({ secure: true })
    vi.stubGlobal('window', { location: { protocol: 'http:' } })
    expect(browserAuthCookieOptions()).toEqual({ secure: false })
  })
})

describe('the three writers', () => {
  it('server client passes the flag from x-forwarded-proto', async () => {
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ getAll: () => [], set: () => {} }),
      headers: async () => new Headers({ 'x-forwarded-proto': 'https' }),
    }))
    const { createClient } = await import('./server')
    await createClient()
    expect(CAPTURED.server).toEqual([{ secure: true }])
  })

  it('server client leaves it off without the header', async () => {
    vi.doMock('next/headers', () => ({
      cookies: async () => ({ getAll: () => [], set: () => {} }),
      headers: async () => new Headers(),
    }))
    const { createClient } = await import('./server')
    await createClient()
    expect(CAPTURED.server).toEqual([{ secure: false }])
  })

  it('browser client passes the flag from the page protocol', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } })
    const { createClient } = await import('./client')
    createClient()
    expect(CAPTURED.browser).toEqual([{ secure: true }])
  })

  it('the proxy passes the flag on the session refresh', async () => {
    vi.doMock('@/lib/seo/redirects', () => ({ lookupRedirect: async () => null }))
    const { proxy } = await import('@/proxy')
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('https://kenyonexpress.co.il/', {
      headers: { 'x-forwarded-proto': 'https' },
    })
    await proxy(request)
    expect(CAPTURED.server).toEqual([{ secure: true }])
  })
})
