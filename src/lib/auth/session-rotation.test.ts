import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
const deleted: string[] = []

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) } : undefined),
    delete: (name: string) => {
      deleted.push(name)
      store.delete(name)
    },
  }),
}))

import { GUEST_SESSION_COOKIE } from '@/lib/cart/guest-session-cookie'
import { rotateSessionAfterLogin } from './session-rotation'

type RefreshResult = { data: { session: unknown }; error: { message: string } | null }

function client(refresh: () => Promise<RefreshResult> | RefreshResult) {
  const refreshSession = vi.fn(async () => refresh())
  // Only `auth.refreshSession` is reached; the rest of SupabaseClient is not.
  return { supabase: { auth: { refreshSession } } as never, refreshSession }
}

const ok = { data: { session: { access_token: 'new' } }, error: null }

beforeEach(() => {
  store.clear()
  deleted.length = 0
})

describe('rotateSessionAfterLogin', () => {
  it('spends the refresh token the sign-in just issued', async () => {
    const { supabase, refreshSession } = client(() => ok)
    const outcome = await rotateSessionAfterLogin(supabase)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(outcome.tokenRotated).toBe(true)
  })

  /**
   * The bug this was written for. Both login paths deleted the guest cookie
   * only inside `if (user && sessionId)`, the branch that merges a cart, so a
   * planted id with nothing behind it survived the login and kept keying the
   * now-authenticated visitor's analytics to a value a stranger chose.
   */
  it('clears a guest id that has no cart behind it', async () => {
    store.set(GUEST_SESSION_COOKIE, 'planted-by-someone-else')
    const { supabase } = client(() => ok)
    const outcome = await rotateSessionAfterLogin(supabase)
    expect(deleted).toEqual([GUEST_SESSION_COOKIE])
    expect(store.has(GUEST_SESSION_COOKIE)).toBe(false)
    expect(outcome.guestCleared).toBe(true)
  })

  it('does not touch a cookie that was not there', async () => {
    const { supabase } = client(() => ok)
    const outcome = await rotateSessionAfterLogin(supabase)
    expect(deleted).toEqual([])
    expect(outcome.guestCleared).toBe(false)
  })

  /**
   * The guest id is cleared even when the auth server is unreachable. It is the
   * half that does not depend on the network, and it is the half an attacker
   * planted.
   */
  it('still clears the guest id when the refresh fails', async () => {
    store.set(GUEST_SESSION_COOKIE, 'planted')
    const { supabase } = client(() => {
      throw new Error('gotrue down')
    })
    const outcome = await rotateSessionAfterLogin(supabase)
    expect(outcome).toEqual({ tokenRotated: false, guestCleared: true })
    expect(store.has(GUEST_SESSION_COOKIE)).toBe(false)
  })

  /**
   * FAILS OPEN. The caller is already signed in with a session minted seconds
   * ago; refusing the login over a failed rotation would show "wrong password"
   * to someone whose password was right.
   */
  it('reports the failure without throwing, on an error result or a rejection', async () => {
    const errored = client(() => ({ data: { session: null }, error: { message: 'network' } }))
    await expect(rotateSessionAfterLogin(errored.supabase)).resolves.toMatchObject({
      tokenRotated: false,
    })

    const threw = client(() => Promise.reject(new Error('boom')))
    await expect(rotateSessionAfterLogin(threw.supabase)).resolves.toMatchObject({
      tokenRotated: false,
    })
  })

  it('reports no rotation when the refresh returns no session', async () => {
    const { supabase } = client(() => ({ data: { session: null }, error: null }))
    expect((await rotateSessionAfterLogin(supabase)).tokenRotated).toBe(false)
  })
})

describe('every login path rotates', () => {
  /**
   * Three doors into an authenticated session: password, phone OTP, and the
   * code exchange that serves both Google OAuth and the magic link. A fourth
   * added later that forgets this call is the regression.
   */
  it('is called from all three', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

    const actions = read('src/server/actions/auth.ts')
    const callback = read('src/app/auth/callback/route.ts')

    // Password sign-in and OTP verify are the two in the actions file.
    expect(actions.match(/await rotateSessionAfterLogin\(/g)).toHaveLength(2)
    expect(callback).toContain('await rotateSessionAfterLogin(')

    // And the guest cookie is no longer deleted by hand anywhere on those
    // paths, which is what made the clear conditional.
    expect(actions).not.toContain('GUEST_SESSION_COOKIE')
  })
})
