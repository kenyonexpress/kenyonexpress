import { describe, expect, it } from 'vitest'
import { checkAdminKey } from './admin-key'

/** Builds an unsigned JWT with the given payload. Signature is never checked. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

describe('checkAdminKey', () => {
  it('rejects a missing key', () => {
    const verdict = checkAdminKey(undefined)
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.reason).toBe('missing')
  })

  it('rejects an empty key', () => {
    expect(checkAdminKey('').ok).toBe(false)
  })

  it('names the local demo key, which is the mistake that actually happened', () => {
    // This exact payload was in .env.local and cost hours: a well-formed key
    // that the hosted project answers "Invalid API key" to, with nothing in the
    // app saying so.
    const verdict = checkAdminKey(jwt({ iss: 'supabase-demo', role: 'service_role' }))
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.reason).toBe('demo-key')
    expect(!verdict.ok && verdict.message).toContain('supabase-demo')
  })

  it('rejects an anon key pasted into the service slot', () => {
    const verdict = checkAdminKey(jwt({ iss: 'supabase', role: 'anon' }))
    expect(verdict.ok).toBe(false)
    expect(!verdict.ok && verdict.reason).toBe('not-service-role')
  })

  it('accepts a real project service-role JWT', () => {
    expect(checkAdminKey(jwt({ iss: 'supabase', role: 'service_role' })).ok).toBe(true)
  })

  it('accepts the opaque new-format secret key, which has nothing to inspect', () => {
    expect(checkAdminKey('sb_secret_abcdefghijklmnop').ok).toBe(true)
  })

  it('does not reject a key it cannot parse', () => {
    // A shape check that guesses would be worse than none: refusing to start on
    // a key format nobody anticipated turns a working deploy into an outage.
    expect(checkAdminKey('a.b.c').ok).toBe(true)
    expect(checkAdminKey('not-a-jwt-at-all').ok).toBe(true)
  })

  it('tells the reader where to get the right key', () => {
    for (const key of [undefined, jwt({ iss: 'supabase-demo' }), jwt({ role: 'anon' })]) {
      const verdict = checkAdminKey(key)
      expect(!verdict.ok && verdict.message).toContain('API Keys')
    }
  })
})
