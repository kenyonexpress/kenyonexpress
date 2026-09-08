import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A ROTATED SESSION COOKIE MUST NOT BE CACHEABLE.
 *
 * When the proxy refreshes a session it writes new auth cookies onto the
 * response. If a CDN or reverse proxy stores that response, the next visitor is
 * served it - with someone else's session token in the Set-Cookie header.
 *
 * @supabase/ssr 0.12 passes the headers that prevent it as a SECOND argument to
 * `setAll`. An adapter declared with one parameter still runs, still sets every
 * cookie, and silently drops them; ours did, and so did the version in this
 * file before the 0.10 -> 0.12 bump. Nothing fails, which is the whole problem.
 *
 * This runs the real adapter rather than scanning the source for it: the
 * question is whether the headers reach the response, not whether the parameter
 * is named. The adapter is captured from the createServerClient call.
 */

const { createServerClient, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient }))

import { proxy } from './proxy'

/** The cookie adapter the proxy handed to the library on its last run. */
// biome-ignore lint/suspicious/noExplicitAny: the adapter is captured untyped
let cookies: any

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: null } })
  // biome-ignore lint/suspicious/noExplicitAny: capturing the adapter the proxy passes to the library
  createServerClient.mockImplementation((_url: string, _key: string, options: any) => {
    cookies = options.cookies
    return { auth: { getUser } }
  })
})

const NEW_SESSION = [
  { name: 'sb-access-token', value: 'rotated', options: { path: '/', httpOnly: true } },
]

const NO_STORE = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

/**
 * Runs the proxy with the library rotating cookies MID-REQUEST, which is when
 * this actually happens: `auth.getUser()` refreshes the session and the client
 * calls `setAll` from inside it. Asserting on the response the proxy returns is
 * the only assertion that means anything - a check that `setAll` declares two
 * parameters passes just as well when the body ignores the second.
 */
async function proxyRotatingSession(headers: Record<string, string> | undefined) {
  getUser.mockImplementation(async () => {
    cookies.setAll(NEW_SESSION, headers)
    return { data: { user: null } }
  })
  return await proxy(new NextRequest('https://kenyonexpress.co.il/'))
}

describe('a response carrying a rotated session cookie', () => {
  it('carries the no-store headers the library asked for', async () => {
    const response = await proxyRotatingSession(NO_STORE)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE['Cache-Control'])
    expect(response.headers.get('Expires')).toBe('0')
    expect(response.headers.get('Pragma')).toBe('no-cache')
  })

  it('still carries the cookie itself', async () => {
    const response = await proxyRotatingSession(NO_STORE)
    expect(response.cookies.get('sb-access-token')?.value).toBe('rotated')
  })

  // The library sends the headers only on the first cookie write per client and
  // an empty object after that, so an empty one must not blank what is set.
  it('does not invent headers when the library sends none', async () => {
    const response = await proxyRotatingSession({})
    expect(response.headers.get('Cache-Control')).toBeNull()
    expect(response.cookies.get('sb-access-token')?.value).toBe('rotated')
  })

  it('survives a library that passes no second argument at all', async () => {
    const response = await proxyRotatingSession(undefined)
    expect(response.cookies.get('sb-access-token')?.value).toBe('rotated')
  })
})
