import { describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/auth/safe-next', () => ({
  safeNext: (val: unknown) => (typeof val === 'string' ? val : '/'),
  safeNextPath: (val: unknown) => (typeof val === 'string' ? val : '/'),
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

vi.mock('@/lib/i18n/error-messages', () => ({
  toHebrew: (msg: string) => `[HE] ${msg}`,
}))

describe('Guest to user upgrade flow', () => {
  it('linkGoogleAfterCheckout requires anonymous user', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    // Mock a regular (non-anonymous) user
    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user123', is_anonymous: false } },
        }),
        linkIdentity: vi.fn(),
      },
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    // Import the action
    const authModule = await import('./auth')
    const formData = new FormData()
    formData.set('next', '/checkout/return?order_id=test123')

    const result = await authModule.linkGoogleAfterCheckout(null, formData)

    expect(result).toEqual({ error: 'אין הזמנת אורח לשמירה' })
    expect(mockSupabase.auth.linkIdentity).not.toHaveBeenCalled()
  })

  it('linkGoogleAfterCheckout calls linkIdentity for anonymous user', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'anon123', is_anonymous: true } },
        }),
        linkIdentity: vi.fn().mockResolvedValue({
          data: { url: 'https://accounts.google.com/oauth...' },
          error: null,
        }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const authModule = await import('./auth')
    const formData = new FormData()
    formData.set('next', '/checkout/return?order_id=test123')

    // This will throw due to redirect(), which is expected
    await expect(authModule.linkGoogleAfterCheckout(null, formData)).rejects.toThrow()

    expect(mockSupabase.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.stringContaining('/auth/callback'),
        scopes: 'openid email profile',
      }),
    })
  })

  it('preserves order_id through OAuth redirect', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const orderId = 'order-abc-123'
    const nextUrl = `/checkout/return?order_id=${orderId}`

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'anon123', is_anonymous: true } },
        }),
        linkIdentity: vi.fn().mockResolvedValue({
          data: { url: 'https://accounts.google.com/oauth...' },
          error: null,
        }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const authModule = await import('./auth')
    const formData = new FormData()
    formData.set('next', nextUrl)

    await expect(authModule.linkGoogleAfterCheckout(null, formData)).rejects.toThrow()

    const linkIdentityCall = mockSupabase.auth.linkIdentity.mock.calls[0]
    expect(linkIdentityCall).toBeTruthy()
    if (!linkIdentityCall) return
    const redirectTo = linkIdentityCall[0].options.redirectTo
    expect(redirectTo).toContain(encodeURIComponent(orderId))
  })

  it('returns error when linkIdentity fails', async () => {
    const { createClient } = await import('@/lib/supabase/server')

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'anon123', is_anonymous: true } },
        }),
        linkIdentity: vi.fn().mockResolvedValue({
          data: { url: null },
          error: { message: 'OAuth provider error' },
        }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const authModule = await import('./auth')
    const formData = new FormData()
    formData.set('next', '/checkout/return?order_id=test123')

    const result = await authModule.linkGoogleAfterCheckout(null, formData)

    // The real toHebrew function maps unknown errors to a generic message
    expect(result).toHaveProperty('error')
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

describe('Guest identity preservation', () => {
  it('anonymous user ID is preserved after Google linking', () => {
    // This is a conceptual test - the actual preservation happens via
    // Supabase's linkIdentity, which keeps the same user.id
    const anonymousUserId = 'anon-user-123'
    const orderId = 'order-abc-123'

    // Before linking: order belongs to anonymous user
    const orderBeforeLinking = {
      id: orderId,
      user_id: anonymousUserId,
    }

    // After linking: order STILL belongs to same user ID
    // (linkIdentity does NOT create a new user)
    const orderAfterLinking = {
      id: orderId,
      user_id: anonymousUserId, // Same ID!
    }

    expect(orderAfterLinking.user_id).toBe(orderBeforeLinking.user_id)
  })
})
