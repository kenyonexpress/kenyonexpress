import { describe, expect, it } from 'vitest'
import { RECENT_AUTH_MAX_AGE_MS, decideRecentAuth, reauthLoginHref } from './recent-auth'

const NOW = 1_800_000_000_000
const sec = (ms: number) => Math.floor(ms / 1000)

describe('forced re-auth policy for payment-method changes', () => {
  it('passes when the newest proof is inside the window, whatever the method', () => {
    const methods = [
      { method: 'password', timestamp: sec(NOW - 3 * 60 * 60_000) },
      { method: 'webauthn', timestamp: sec(NOW - 2 * 60_000) },
    ]
    expect(decideRecentAuth(methods, NOW)).toEqual({ recent: true, ageMs: expect.any(Number) })
  })

  it('fails when every proof is older than ten minutes', () => {
    const methods = [{ method: 'magiclink', timestamp: sec(NOW - RECENT_AUTH_MAX_AGE_MS - 5000) }]
    expect(decideRecentAuth(methods, NOW)).toMatchObject({ recent: false, reason: 'stale' })
  })

  it('fails closed with no methods, an empty list or bad timestamps', () => {
    expect(decideRecentAuth(null, NOW)).toMatchObject({ recent: false, reason: 'no_methods' })
    expect(decideRecentAuth([], NOW)).toMatchObject({ recent: false, reason: 'no_methods' })
    expect(decideRecentAuth([{ method: 'otp', timestamp: Number.NaN }], NOW)).toMatchObject({
      recent: false,
      reason: 'no_methods',
    })
  })

  it('sends the customer back to the tokens page after re-login', () => {
    expect(reauthLoginHref('/account/tokens')).toBe('/login?reauth=1&next=%2Faccount%2Ftokens')
  })
})
