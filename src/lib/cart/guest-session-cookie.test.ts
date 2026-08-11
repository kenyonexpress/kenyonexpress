import { describe, expect, it } from 'vitest'
import {
  GUEST_SESSION_COOKIE,
  guestSessionCookieOptions,
  isSecureProto,
} from './guest-session-cookie'

describe('isSecureProto', () => {
  it('accepts https, with or without the colon', () => {
    expect(isSecureProto('https')).toBe(true)
    // `request.nextUrl.protocol` is the form with the colon.
    expect(isSecureProto('https:')).toBe(true)
    expect(isSecureProto('HTTPS')).toBe(true)
  })

  it('reads the FIRST hop of a forwarded chain, which is the client’s', () => {
    // The later entries describe hops behind the edge and are routinely plain
    // http. Reading the last one would drop `secure` on every real request.
    expect(isSecureProto('https,http')).toBe(true)
    expect(isSecureProto('https, http')).toBe(true)
    expect(isSecureProto('http,https')).toBe(false)
  })

  it('is false for anything absent or not TLS', () => {
    // The direction that keeps the cookie working rather than making it vanish:
    // a Secure cookie over plain http is dropped by the browser, and the E2E
    // WebKit project runs against http://localhost.
    expect(isSecureProto(undefined)).toBe(false)
    expect(isSecureProto(null)).toBe(false)
    expect(isSecureProto('')).toBe(false)
    expect(isSecureProto('http')).toBe(false)
  })
})

describe('guestSessionCookieOptions', () => {
  it('is httpOnly and lax, always', () => {
    // httpOnly is what keeps `/api/a` able to say the analytics id came from a
    // cookie the page could not have written.
    const options = guestSessionCookieOptions('https')
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
  })

  it('marks the cookie secure over TLS', () => {
    expect(guestSessionCookieOptions('https').secure).toBe(true)
  })

  it('does not, over plain http', () => {
    expect(guestSessionCookieOptions('http').secure).toBe(false)
  })

  it('survives a weekend', () => {
    expect(guestSessionCookieOptions('https').maxAge).toBe(60 * 60 * 24 * 30)
  })

  it('names the cookie both writers use', () => {
    // The proxy and `ensureGuestSessionId` each used to spell the name and the
    // options out. `secure` was missing from both, and neither looked wrong,
    // because each matched the other.
    expect(GUEST_SESSION_COOKIE).toBe('ke_session_id')
  })
})
