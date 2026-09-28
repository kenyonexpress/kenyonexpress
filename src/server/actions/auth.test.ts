import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())
const getClientIp = vi.hoisted(() => vi.fn())

vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit, getClientIp }))

import { signInWithEmail } from './auth'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

/**
 * `checkRateLimit` runs before any Supabase call in `runSignInWithEmail`, so a
 * rejection here never needs a mocked client: both ceilings (per-IP `login`,
 * per-account `login-account`) must be provably enforced without one, because
 * `checkout.test.ts` had this exact check permanently stubbed to `true` and
 * `redeem` had no test at all — M13-c51.
 */
describe('signInWithEmail rate limiting', () => {
  beforeEach(() => {
    checkRateLimit.mockReset()
    getClientIp.mockReset()
    getClientIp.mockResolvedValue('1.2.3.4')
  })

  it('rejects when the per-IP login ceiling is hit, before touching credentials', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await signInWithEmail(
      null,
      form({ email: 'dani@example.com', password: 'hunter2' }),
    )
    expect(result).toEqual({ error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' })
    expect(checkRateLimit).toHaveBeenCalledWith('login:1.2.3.4')
  })

  it('rejects when the per-account ceiling is hit even under the IP ceiling', async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('login-account:'))
    const result = await signInWithEmail(
      null,
      form({ email: 'Dani@Example.com', password: 'hunter2' }),
    )
    expect(result).toEqual({ error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה' })
    // Lower-cased, so `Dani@Example.com` and `dani@example.com` share one budget.
    expect(checkRateLimit).toHaveBeenCalledWith('login-account:dani@example.com', 20, 3600)
  })
})
