import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two reads the browser is allowed now that the session cookie is
 * HttpOnly. What can only fail here: that the id comes from the VERIFIED
 * `getUser()` and not from the cookie's own claim, that no token crosses for
 * a signed-out request, and that only the access token ever crosses.
 */

const getUser = vi.fn()
const getSession = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser(), getSession: () => getSession() },
  }),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

import { currentUserId, realtimeCredentials } from './session'

beforeEach(() => {
  getUser.mockReset()
  getSession.mockReset()
})

describe('currentUserId', () => {
  it('answers the verified user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    expect(await currentUserId()).toBe('u-1')
  })

  it('answers null when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await currentUserId()).toBeNull()
  })
})

describe('realtimeCredentials', () => {
  it('hands over the access token and nothing else', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    getSession.mockResolvedValue({
      data: {
        session: { access_token: 'jwt.access', refresh_token: 'rt-secret', user: { id: 'u-1' } },
      },
    })
    const creds = await realtimeCredentials()
    expect(creds).toEqual({ userId: 'u-1', accessToken: 'jwt.access' })
    expect(JSON.stringify(creds)).not.toContain('rt-secret')
  })

  it('never consults the cookie session for a request getUser rejects', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt.access' } } })
    expect(await realtimeCredentials()).toBeNull()
    expect(getSession).not.toHaveBeenCalled()
  })

  it('answers null when the verified user has no session in the cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    getSession.mockResolvedValue({ data: { session: null } })
    expect(await realtimeCredentials()).toBeNull()
  })
})
