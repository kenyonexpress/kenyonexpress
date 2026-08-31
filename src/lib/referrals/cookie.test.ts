import { describe, expect, it } from 'vitest'
import { REFERRAL_COOKIE_MAX_AGE, referralCookieOptions } from './cookie'

/**
 * The same two properties the guest-session cookie is tested for, because this
 * cookie is set from the same line of `src/proxy.ts` and a divergence between
 * them is exactly how `secure` came to be missing from both copies of the guest
 * options: each one matched the other.
 */
describe('referralCookieOptions', () => {
  it('is httpOnly and lax, because nothing in the browser reads it', () => {
    const options = referralCookieOptions('https')
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBe(REFERRAL_COOKIE_MAX_AGE)
  })

  it('sets secure over TLS and NOT over plain http', () => {
    // The negative case is the one that matters: an unconditional flag is
    // dropped by WebKit against http://localhost, which is what the E2E suite
    // runs, and the referral would silently never be captured there.
    expect(referralCookieOptions('https').secure).toBe(true)
    expect(referralCookieOptions('http').secure).toBe(false)
    expect(referralCookieOptions(null).secure).toBe(false)
  })

  it('reads the first hop of a forwarded chain', () => {
    expect(referralCookieOptions('https,http').secure).toBe(true)
    expect(referralCookieOptions('http,https').secure).toBe(false)
  })
})
