import { describe, expect, it } from 'vitest'
import { PROVIDERS, providerAvailability, providerById } from './providers'

/**
 * WHAT THIS FILE IS REALLY ASSERTING: that the page tells the truth about why
 * a number had to be typed in by hand.
 *
 * A cost dashboard whose provider rows say nothing invites the reader to assume
 * the figures are pulled. Every row here names the exact credential that is
 * missing, so "why is this manual" has an answer that does not require reading
 * the source.
 */

describe('the credential each provider would need', () => {
  it('cannot pull any of the four platform providers with the environment as it is', () => {
    // Measured 2026-09-09: src/lib/env.ts declares 27 variables and not one is
    // a billing credential. The goal asked for the pull "where available", and
    // available is currently nowhere.
    const availability = providerAvailability({} as unknown as NodeJS.ProcessEnv)
    for (const id of ['vercel', 'supabase', 'upstash', 'cloudflare']) {
      const row = availability.find((entry) => entry.id === id)
      expect(row?.canPull, id).toBe(false)
      expect(row?.reason, id).toMatch(/is not set/)
    }
  })

  it('names the variable in the reason, so nobody has to grep for it', () => {
    const availability = providerAvailability({} as unknown as NodeJS.ProcessEnv)
    expect(availability.find((e) => e.id === 'vercel')?.reason).toContain('VERCEL_API_TOKEN')
    expect(availability.find((e) => e.id === 'cloudflare')?.reason).toContain(
      'CLOUDFLARE_API_TOKEN',
    )
  })

  it('does NOT mistake the Upstash REST token for a billing credential', () => {
    // The trap this file exists for. UPSTASH_REDIS_REST_TOKEN IS set in this
    // project and is the obvious thing to reach for; it grants access to the
    // DATABASE, not the account. A pull written against it 401s forever and the
    // natural conclusion is that the variable is wrong rather than the wrong
    // KIND of credential.
    const availability = providerAvailability({
      UPSTASH_REDIS_REST_TOKEN: 'a-real-token',
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    } as unknown as NodeJS.ProcessEnv)

    const upstash = availability.find((entry) => entry.id === 'upstash')
    expect(upstash?.canPull).toBe(false)
    expect(upstash?.reason).toContain('UPSTASH_MANAGEMENT_API_KEY')
    expect(upstash?.reason).toContain('DATABASE')
  })

  it('reports Twilio as measurable without an API, because it already is', () => {
    // 216 records the real per-message price from the delivery receipts. That
    // is the actual spend rather than a plan, and it needs no billing call.
    const twilio = providerAvailability({} as unknown as NodeJS.ProcessEnv).find(
      (entry) => entry.id === 'twilio',
    )
    expect(twilio?.canPull).toBe(true)
    expect(twilio?.reason).toContain('sms_messages.price_micro')
  })

  it('turns a present credential into a pullable provider', () => {
    const vercel = providerAvailability({
      VERCEL_API_TOKEN: 'token',
    } as unknown as NodeJS.ProcessEnv).find((entry) => entry.id === 'vercel')
    expect(vercel?.canPull).toBe(true)
  })

  it('treats an empty string as absent, not as configured', () => {
    const vercel = providerAvailability({
      VERCEL_API_TOKEN: '   ',
    } as unknown as NodeJS.ProcessEnv).find((entry) => entry.id === 'vercel')
    expect(vercel?.canPull).toBe(false)
  })
})

describe('the registry itself', () => {
  it('matches the provider CHECK constraint in migration 219', () => {
    // A provider added here and not there is a row the database refuses; the
    // other way round is a row nothing can display.
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual([
      'cloudflare',
      'resend',
      'supabase',
      'twilio',
      'upstash',
      'vercel',
    ])
  })

  it('gives every provider a default kind, which is what stops a bad projection', () => {
    // A subscription filed as variable is extrapolated to ten times the bill on
    // day 3 of the month.
    expect(PROVIDERS.find((p) => p.id === 'vercel')?.defaultKind).toBe('fixed')
    expect(PROVIDERS.find((p) => p.id === 'supabase')?.defaultKind).toBe('fixed')
    expect(PROVIDERS.find((p) => p.id === 'cloudflare')?.defaultKind).toBe('variable')
  })

  it('says plainly that Resend can never be automated', () => {
    // Not our omission: the vendor publishes no billing endpoint at all.
    expect(providerById('resend')?.note).toContain('no usage or billing API')
  })

  it('is null for something that is not a provider', () => {
    expect(providerById('aws')).toBeNull()
  })
})
