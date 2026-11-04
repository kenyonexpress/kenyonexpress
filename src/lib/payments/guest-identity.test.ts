import { describe, expect, it, vi } from 'vitest'
import { ensureCheckoutUser, normaliseGuestEmail } from './guest-identity'

function client(user: { id: string; is_anonymous?: boolean } | null, signIn?: unknown) {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
      signInAnonymously: vi.fn(
        async () =>
          (signIn as never) ?? {
            data: { user: { id: 'anon-1', is_anonymous: true } },
            error: null,
          },
      ),
    },
  }
}

describe('ensureCheckoutUser (S07)', () => {
  it('keeps a signed-in customer as is', async () => {
    const c = client({ id: 'u1' })
    const merge = vi.fn(async () => true)
    expect(await ensureCheckoutUser(c, merge)).toEqual({
      ok: true,
      userId: 'u1',
      guest: false,
      created: false,
    })
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(merge).not.toHaveBeenCalled()
  })

  it('reuses an existing anonymous session instead of minting a second user', async () => {
    const c = client({ id: 'anon-0', is_anonymous: true })
    const result = await ensureCheckoutUser(c, async () => true)
    expect(result).toEqual({ ok: true, userId: 'anon-0', guest: true, created: false })
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('mints an anonymous user for a visitor and moves the cart onto it', async () => {
    const c = client(null)
    const merge = vi.fn(async () => true)
    const result = await ensureCheckoutUser(c, merge)
    expect(result).toEqual({ ok: true, userId: 'anon-1', guest: true, created: true })
    expect(merge).toHaveBeenCalledWith('anon-1')
  })

  it('refuses to go on when the cart did not move', async () => {
    const result = await ensureCheckoutUser(client(null), async () => false)
    expect(result.ok).toBe(false)
  })

  it('says so when anonymous sign-in is off', async () => {
    const c = client(null, {
      data: { user: null },
      error: { message: 'Anonymous sign-ins are disabled' },
    })
    const result = await ensureCheckoutUser(c, async () => true)
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'GUEST_UNAVAILABLE' }))
  })

  it('asks the ceiling before minting, and only then', async () => {
    const c = client(null)
    const mayCreate = vi.fn(async () => false)
    const result = await ensureCheckoutUser(c, async () => true, mayCreate)
    expect(result.ok).toBe(false)
    expect(c.auth.signInAnonymously).not.toHaveBeenCalled()

    const signedIn = vi.fn(async () => false)
    await ensureCheckoutUser(client({ id: 'u1' }), async () => true, signedIn)
    expect(signedIn).not.toHaveBeenCalled()
  })
})

describe('normaliseGuestEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(normaliseGuestEmail('  Dana@Example.COM ')).toBe('dana@example.com')
  })

  it('refuses what cannot receive a voucher', () => {
    for (const bad of ['', 'dana', 'dana@', '@example.com', 'da na@example.com', 'a@b']) {
      expect(normaliseGuestEmail(bad), bad).toBeNull()
    }
    expect(normaliseGuestEmail(`${'a'.repeat(250)}@b.co`)).toBeNull()
  })
})
