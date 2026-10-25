import { describe, expect, it } from 'vitest'
import {
  RATE_LIMIT_POLICIES,
  type RateLimitPolicyName,
  checkRateLimit,
  getClientIp,
  legacyRedisKey,
  policy,
  postgresKey,
  rateLimit,
  rateLimitByKey,
  redisKey,
} from './rate-limit'

describe('rate-limit exports', () => {
  it('exports policy table', () => {
    expect(RATE_LIMIT_POLICIES).toBeDefined()
    expect(RATE_LIMIT_POLICIES.login).toEqual({
      limit: 10,
      windowSeconds: 3600,
      reason: 'password guessing, per IP',
    })
  })

  it('exports policy lookup', () => {
    expect(policy('login')).toEqual(RATE_LIMIT_POLICIES.login)
    expect(policy('signup')).toEqual(RATE_LIMIT_POLICIES.signup)
    expect(policy('contact')).toEqual(RATE_LIMIT_POLICIES.contact)
  })

  it('exports key builders', () => {
    expect(redisKey('login', '203.0.113.1')).toBe('rl:v1:login:203.0.113.1')
    expect(postgresKey('login', '203.0.113.1')).toBe('login:203.0.113.1')
    expect(legacyRedisKey('login:203.0.113.1')).toBe('rl:v1:login:203.0.113.1')
  })

  it('exports rate limiting functions', () => {
    expect(typeof rateLimit).toBe('function')
    expect(typeof rateLimitByKey).toBe('function')
    expect(typeof checkRateLimit).toBe('function')
    expect(typeof getClientIp).toBe('function')
  })

  it('validates all policies have required fields', () => {
    const names = Object.keys(RATE_LIMIT_POLICIES) as RateLimitPolicyName[]
    for (const name of names) {
      const p = policy(name)
      expect(p.limit).toBeGreaterThan(0)
      expect(p.windowSeconds).toBeGreaterThan(0)
      expect(p.reason).toBeTruthy()
    }
  })

  it('has policies for auth flows', () => {
    expect(RATE_LIMIT_POLICIES.login).toBeDefined()
    expect(RATE_LIMIT_POLICIES.signup).toBeDefined()
    expect(RATE_LIMIT_POLICIES.reset).toBeDefined()
    expect(RATE_LIMIT_POLICIES.contact).toBeDefined()
    expect(RATE_LIMIT_POLICIES['supplier-lead']).toBeDefined()
  })

  it('has policies for checkout flows', () => {
    expect(RATE_LIMIT_POLICIES.begin_checkout).toBeDefined()
    expect(RATE_LIMIT_POLICIES.cart_write).toBeDefined()
  })
})
