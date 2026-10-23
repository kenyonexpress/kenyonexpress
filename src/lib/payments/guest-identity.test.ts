import { describe, expect, it, vi } from 'vitest'
import { ensureCheckoutUser } from './guest-identity'

const client = (opts: {
  user?: { id: string; is_anonymous?: boolean } | null
  anon?: { data: { user: { id: string } | null }; error: { message: string } | null }
}) => ({
  auth: {
    getUser: vi.fn(async () => ({ data: { user: opts.user ?? null } })),
    signInAnonymously: vi.fn(async () => opts.anon ?? { data: { user: null }, error: null }),
  },
})

describe('ensureCheckoutUser', () => {
  it('keeps a signed-in user and does not create a session', async () => {
    const c = client({ user: { id: 'u1' } })
    const merge = vi.fn()
    const r = await ensureCheckoutUser(c, merge)
    expect(r).toEqual({ ok: true, userId: 'u1', guest: false, created: false })
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
  })

  it('reports an existing anonymous user as guest', async () => {
    const r = await ensureCheckoutUser(client({ user: { id: 'g1', is_anonymous: true } }), vi.fn())
    expect(r).toMatchObject({ ok: true, guest: true, created: false })
  })

  it('creates an anonymous session and merges the cookie cart', async () => {
    const merge = vi.fn(async () => true)
    const r = await ensureCheckoutUser(
      client({ anon: { data: { user: { id: 'g2' } }, error: null } }),
      merge,
    )
    expect(r).toEqual({ ok: true, userId: 'g2', guest: true, created: true })
    expect(merge).toHaveBeenCalledWith('g2')
  })

  it('fails closed when anonymous sign-ins are disabled', async () => {
    const r = await ensureCheckoutUser(
      client({ anon: { data: { user: null }, error: { message: 'disabled' } } }),
      vi.fn(),
    )
    expect(r).toMatchObject({ ok: false, code: 'GUEST_UNAVAILABLE' })
  })

  it('refuses to continue when the cart merge did not run', async () => {
    const r = await ensureCheckoutUser(
      client({ anon: { data: { user: { id: 'g3' } }, error: null } }),
      async () => false,
    )
    expect(r).toMatchObject({ ok: false, code: 'GUEST_UNAVAILABLE' })
  })
})
