import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bearerMatches, secretEquals } from './constant-time'

describe('secretEquals', () => {
  it('accepts the exact secret', () => {
    expect(secretEquals('s3cr3t', 's3cr3t')).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    expect(secretEquals('s3cr3t', 's3cr3T')).toBe(false)
  })

  it('rejects a prefix, which is the guess a timing leak would grow', () => {
    expect(secretEquals('s3cr3', 's3cr3t')).toBe(false)
    expect(secretEquals('s3cr3t!', 's3cr3t')).toBe(false)
  })

  it('rejects absence rather than treating it as a match', () => {
    // An unset CRON_SECRET must never make every caller authorised.
    expect(secretEquals(null, '')).toBe(false)
    expect(secretEquals('', '')).toBe(false)
    expect(secretEquals(undefined, 'expected')).toBe(false)
    expect(secretEquals('provided', '')).toBe(false)
  })

  it('compares bytes, not code units', () => {
    // Buffer.byteLength differs from .length here; a length check on the string
    // would pass this pair to timingSafeEqual, which throws on unequal buffers.
    expect(() => secretEquals('é', 'ab')).not.toThrow()
    expect(secretEquals('é', 'ab')).toBe(false)
  })
})

describe('bearerMatches', () => {
  it('accepts the Bearer form the cron routes are called with', () => {
    expect(bearerMatches('Bearer tok', 'tok')).toBe(true)
  })

  it('rejects a wrong token, a missing header and another scheme', () => {
    expect(bearerMatches('Bearer nope', 'tok')).toBe(false)
    expect(bearerMatches(null, 'tok')).toBe(false)
    expect(bearerMatches('Basic tok', 'tok')).toBe(false)
    expect(bearerMatches('bearer tok', 'tok')).toBe(false)
  })

  it('does not accept the bare token without the scheme', () => {
    expect(bearerMatches('tok', 'tok')).toBe(false)
  })
})

/**
 * The regression this exists to stop is not a failing check, it is a check that
 * still passes while comparing in variable time. `!==` on a template string
 * answers 401 and 200 in exactly the right places, so nothing else in the suite
 * would notice it coming back.
 */
describe('secret comparison in API routes', () => {
  const API = resolve(__dirname, '../../app/api')

  function routes(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) found.push(...routes(path))
      else if (/route\.ts$/.test(path)) found.push(path)
    }
    return found
  }

  const ALL = routes(API)

  it('finds the routes to check', () => {
    expect(ALL.length).toBeGreaterThan(8)
  })

  it('never compares a Bearer secret with === or !==', () => {
    const offenders = ALL.filter((file) =>
      /[=!]==\s*`Bearer /.test(readFileSync(file, 'utf8')),
    ).map((file) => relative(API, file))

    expect(offenders).toEqual([])
  })
})
