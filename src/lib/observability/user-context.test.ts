import { describe, expect, it } from 'vitest'
import { userIdFromCookieHeader } from './user-context'

const USER_ID = '6f1e2f6a-6b1d-4c2e-9a9f-2b3c4d5e6f70'

/** A JWT-shaped string. Only the payload is ever read, so the rest is filler. */
function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.c2lnbmF0dXJl`
}

function chunkedCookie(name: string, session: unknown, chunks = 1): string {
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  if (chunks === 1) return `${name}=${encoded}`
  const size = Math.ceil(encoded.length / chunks)
  return Array.from({ length: chunks }, (_, i) => {
    return `${name}.${i}=${encoded.slice(i * size, (i + 1) * size)}`
  }).join('; ')
}

describe('reading the caller out of the cookie header', () => {
  it('finds the sub claim in a single-cookie session', () => {
    const header = `ke_session_id=abc; ${chunkedCookie('sb-ixvwfbuvfxxsjiywhbbb-auth-token', {
      access_token: token({ sub: USER_ID, role: 'authenticated' }),
    })}; other=1`

    expect(userIdFromCookieHeader(header)).toBe(USER_ID)
  })

  it('reassembles a chunked session, in index order rather than header order', () => {
    const parts = chunkedCookie(
      'sb-ixvwfbuvfxxsjiywhbbb-auth-token',
      { access_token: token({ sub: USER_ID }) },
      3,
    ).split('; ')

    // Reversed on purpose: a cookie header promises no ordering, and joining in
    // the order they appear would decode to nothing.
    expect(userIdFromCookieHeader(parts.reverse().join('; '))).toBe(USER_ID)
  })

  it('answers null for an anonymous visitor', () => {
    expect(userIdFromCookieHeader('ke_session_id=abc; consent=all')).toBeNull()
    expect(userIdFromCookieHeader(undefined)).toBeNull()
  })

  it('answers null rather than throwing on a half-written cookie', () => {
    // Two chunks from different writes decode to invalid JSON. @supabase/ssr
    // treats that as no session and this has to agree, or an error page would
    // become two errors.
    const header = 'sb-ref-auth-token.0=base64-eyJhY2Nlc3Nf; sb-ref-auth-token.1=bm9uc2Vuc2U'
    expect(userIdFromCookieHeader(header)).toBeNull()
  })

  it('refuses anything that is not a uuid, including a name', () => {
    const header = chunkedCookie('sb-ref-auth-token', {
      access_token: token({ sub: 'service_role' }),
    })
    expect(userIdFromCookieHeader(header)).toBeNull()
  })

  it('does not pick up an unrelated cookie that merely looks close', () => {
    const header = 'sb-auth-token=base64-x; my-sb-ref-auth-token=base64-y'
    expect(userIdFromCookieHeader(header)).toBeNull()
  })

  it('still reads the older un-prefixed JSON encoding', () => {
    const header = `sb-ref-auth-token=${encodeURIComponent(
      JSON.stringify({ access_token: token({ sub: USER_ID }) }),
    )}`
    expect(userIdFromCookieHeader(header)).toBe(USER_ID)
  })
})
