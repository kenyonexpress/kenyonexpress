import { describe, expect, it } from 'vitest'
import {
  mintOrderTrackingToken,
  orderTrackingUrl,
  trackingSigningKey,
  verifyOrderTrackingToken,
} from './tracking-token'

const ORDER = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-2222-3333-4444-555555555555'
const NOW = new Date('2026-09-10T00:00:00.000Z')

const ENV = { SUPABASE_SECRET_KEY: 'sb_secret_'.padEnd(40, 'x') } as unknown as NodeJS.ProcessEnv
const DEDICATED = {
  ORDER_TRACKING_SECRET: 'dedicated-secret-value',
} as unknown as NodeJS.ProcessEnv

describe('verifyOrderTrackingToken', () => {
  it('accepts a token it just minted, for the order it names', () => {
    const token = mintOrderTrackingToken(ORDER, { env: ENV, now: NOW })
    const verdict = verifyOrderTrackingToken(token, ORDER, { env: ENV, now: NOW })
    expect(verdict).toMatchObject({ ok: true, orderId: ORDER })
  })

  it('refuses a token minted for a different order', () => {
    const token = mintOrderTrackingToken(OTHER, { env: ENV, now: NOW })
    expect(verifyOrderTrackingToken(token, ORDER, { env: ENV, now: NOW })).toEqual({
      ok: false,
      reason: 'wrong_order',
    })
  })

  it('refuses a token signed with a different key', () => {
    const token = mintOrderTrackingToken(ORDER, { env: DEDICATED, now: NOW })
    expect(verifyOrderTrackingToken(token, ORDER, { env: ENV, now: NOW })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('refuses a tampered payload, version byte included', () => {
    const token = mintOrderTrackingToken(ORDER, { env: ENV, now: NOW })
    const [version, body, mac] = token.split('.')
    expect(version).toBe('KET1')
    expect(verifyOrderTrackingToken(`KET2.${body}.${mac}`, ORDER, { env: ENV, now: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    })

    const forged = Buffer.from(JSON.stringify({ v: 1, o: ORDER, e: 4102444800 }), 'utf8').toString(
      'base64url',
    )
    expect(
      verifyOrderTrackingToken(`KET1.${forged}.${mac}`, ORDER, { env: ENV, now: NOW }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('expires', () => {
    const token = mintOrderTrackingToken(ORDER, { env: ENV, now: NOW, ttlDays: 1 })
    expect(
      verifyOrderTrackingToken(token, ORDER, { env: ENV, now: new Date('2026-09-10T23:00:00Z') })
        .ok,
    ).toBe(true)
    expect(
      verifyOrderTrackingToken(token, ORDER, { env: ENV, now: new Date('2026-09-12T00:00:00Z') }),
    ).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects junk cheaply, without reaching a hash', () => {
    for (const junk of ['', '   ', 'x', 'a.b', 'KET1.only-two-parts', 'A'.repeat(600)]) {
      expect(verifyOrderTrackingToken(junk, ORDER, { env: ENV, now: NOW }).ok).toBe(false)
    }
    expect(verifyOrderTrackingToken(null, ORDER, { env: ENV, now: NOW }).ok).toBe(false)
  })

  it('does not throw when no secret exists; it declines', () => {
    const token = mintOrderTrackingToken(ORDER, { env: ENV, now: NOW })
    expect(
      verifyOrderTrackingToken(token, ORDER, { env: {} as unknown as NodeJS.ProcessEnv, now: NOW }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })
})

describe('trackingSigningKey', () => {
  it('prefers the dedicated secret when it is set', () => {
    const both = { ...ENV, ...DEDICATED }
    expect(trackingSigningKey(both).toString('utf8')).toBe(DEDICATED.ORDER_TRACKING_SECRET)
  })

  it('derives a key that is not the service key itself', () => {
    const derived = trackingSigningKey(ENV)
    expect(derived).toHaveLength(32)
    expect(derived.toString('utf8')).not.toContain('sb_secret_')
  })

  it('throws only when the process has no secret at all', () => {
    expect(() => trackingSigningKey({} as unknown as NodeJS.ProcessEnv)).toThrow()
  })
})

describe('orderTrackingUrl', () => {
  it('builds a verifiable absolute URL', () => {
    const url = orderTrackingUrl('https://kenyonexpress.co.il/', ORDER, { env: ENV, now: NOW })
    expect(url).not.toBeNull()
    const parsed = new URL(url as string)
    expect(parsed.pathname).toBe(`/order/${ORDER}/tracking`)
    expect(
      verifyOrderTrackingToken(parsed.searchParams.get('t'), ORDER, { env: ENV, now: NOW }).ok,
    ).toBe(true)
  })

  it('returns null rather than a dead link when nothing can sign', () => {
    expect(
      orderTrackingUrl('https://x.test', ORDER, { env: {} as unknown as NodeJS.ProcessEnv }),
    ).toBeNull()
  })
})
