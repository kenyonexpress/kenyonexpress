import { describe, expect, it } from 'vitest'
import { __test } from './bearer'

const { bearerToken } = __test

describe('bearerToken', () => {
  it('reads the token out of a well-formed header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })

  it('accepts the casing variants clients actually send', () => {
    expect(bearerToken('bearer abc')).toBe('abc')
    expect(bearerToken('BEARER abc')).toBe('abc')
    expect(bearerToken('  Bearer   abc  ')).toBe('abc')
  })

  it('returns null rather than an empty token', () => {
    // An empty string here would be handed to `getUser('')`, and a client that
    // treats that as "no token" would fall back to an anonymous session - which
    // is the difference between a 401 and a silently unauthenticated request.
    expect(bearerToken('Bearer ')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
    expect(bearerToken('')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })

  it('does not accept another scheme', () => {
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken('abc')).toBeNull()
  })
})
