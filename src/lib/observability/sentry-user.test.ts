import { describe, expect, it } from 'vitest'
import { scrubEventUser, userIdFromCookieHeader } from './sentry-user'

const USER_ID = '7f9c2f7e-3a41-4b6e-9d10-2f8a54c1e9ab'

/** A structurally valid JWT whose payload carries the given claims. */
function jwt(claims: Record<string, unknown>): string {
  const enc = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`
}

function sessionJson(claims: Record<string, unknown> = { sub: USER_ID }): string {
  return JSON.stringify({ access_token: jwt(claims), token_type: 'bearer' })
}

describe('userIdFromCookieHeader', () => {
  it('reads the sub out of a plain JSON auth cookie', () => {
    const header = `sb-abcdefgh-auth-token=${encodeURIComponent(sessionJson())}; other=1`
    expect(userIdFromCookieHeader(header)).toBe(USER_ID)
  })

  it('reads the base64- prefixed shape @supabase/ssr writes today', () => {
    const value = `base64-${Buffer.from(sessionJson()).toString('base64url')}`
    expect(userIdFromCookieHeader(`sb-abcdefgh-auth-token=${value}`)).toBe(USER_ID)
  })

  it('reassembles a chunked cookie in numeric order, not header order', () => {
    const value = `base64-${Buffer.from(sessionJson()).toString('base64url')}`
    const mid = Math.floor(value.length / 2)
    // .1 before .0 on purpose: browsers do not promise an order.
    const header = `sb-abcdefgh-auth-token.1=${value.slice(mid)}; sb-abcdefgh-auth-token.0=${value.slice(0, mid)}`
    expect(userIdFromCookieHeader(header)).toBe(USER_ID)
  })

  it('returns null for an anonymous request', () => {
    expect(userIdFromCookieHeader('theme=dark; cart=abc')).toBeNull()
    expect(userIdFromCookieHeader('')).toBeNull()
    expect(userIdFromCookieHeader(null)).toBeNull()
    expect(userIdFromCookieHeader(undefined)).toBeNull()
  })

  it('returns null rather than throwing on garbage', () => {
    expect(userIdFromCookieHeader('sb-x-auth-token=not-json')).toBeNull()
    expect(userIdFromCookieHeader('sb-x-auth-token=base64-!!!!')).toBeNull()
    expect(
      userIdFromCookieHeader(`sb-x-auth-token=${encodeURIComponent('{"access_token":42}')}`),
    ).toBeNull()
    expect(
      userIdFromCookieHeader(`sb-x-auth-token=${encodeURIComponent('{"access_token":"no.dots"}')}`),
    ).toBeNull()
  })

  it('rejects a sub that could not be a Supabase id', () => {
    const markup = sessionJson({ sub: '<img src=x>' })
    expect(userIdFromCookieHeader(`sb-x-auth-token=${encodeURIComponent(markup)}`)).toBeNull()
    const oversized = sessionJson({ sub: 'a'.repeat(65) })
    expect(userIdFromCookieHeader(`sb-x-auth-token=${encodeURIComponent(oversized)}`)).toBeNull()
  })
})

describe('scrubEventUser', () => {
  it('keeps only the id, whatever else was set', () => {
    expect(
      scrubEventUser({ id: USER_ID, email: 'x@y.com', ip_address: '1.2.3.4', username: 'ofir' }),
    ).toEqual({ id: USER_ID })
  })

  it('drops a user with no usable id entirely', () => {
    expect(scrubEventUser({ email: 'x@y.com' })).toBeUndefined()
    expect(scrubEventUser({ id: '' })).toBeUndefined()
    expect(scrubEventUser({ id: 42 })).toBeUndefined()
    expect(scrubEventUser(undefined)).toBeUndefined()
    expect(scrubEventUser(null)).toBeUndefined()
    expect(scrubEventUser('id-as-string')).toBeUndefined()
  })
})
