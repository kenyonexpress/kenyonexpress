import { describe, expect, it } from 'vitest'
import { computeWebhookSignature, verifyWebhookSignature } from './signature'

const SECRET = 'test-secret-0123456789abcdef'
const BODY = '{"lowprofilecode":"lp-1","ResponseCode":0,"terminalnumber":1000}'

describe('webhook signature', () => {
  it('round-trips: a computed signature verifies against the same body and secret', () => {
    const sig = computeWebhookSignature(BODY, SECRET)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyWebhookSignature(BODY, SECRET, sig)).toBe(true)
  })

  it('accepts uppercase hex from the sender', () => {
    const sig = computeWebhookSignature(BODY, SECRET).toUpperCase()
    expect(verifyWebhookSignature(BODY, SECRET, sig)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const sig = computeWebhookSignature(BODY, SECRET)
    expect(verifyWebhookSignature(`${BODY} `, SECRET, sig)).toBe(false)
  })

  it('rejects a signature made with a different secret (cross-account)', () => {
    const sig = computeWebhookSignature(BODY, 'another-secret-x')
    expect(verifyWebhookSignature(BODY, SECRET, sig)).toBe(false)
  })

  it('rejects missing / empty inputs without throwing', () => {
    expect(verifyWebhookSignature(BODY, SECRET, null)).toBe(false)
    expect(verifyWebhookSignature(BODY, SECRET, undefined)).toBe(false)
    expect(verifyWebhookSignature(BODY, SECRET, '')).toBe(false)
    expect(verifyWebhookSignature(BODY, '', 'deadbeef')).toBe(false)
    expect(verifyWebhookSignature(BODY, SECRET, 'not-hex-at-all')).toBe(false)
  })
})
