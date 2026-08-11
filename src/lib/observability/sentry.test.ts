import { describe, expect, it } from 'vitest'
import { redact } from './sentry'

/**
 * The payment path carries chargeable instruments. Everything that reaches an
 * error reporter leaves the server, so this is the check that a Cardcom token
 * or a webhook secret cannot ride out inside a "detail" bag.
 */
describe('redact', () => {
  it('removes anything whose key names a credential', () => {
    const out = redact({
      order_id: 'ord-1',
      cardcom_token: 'tok_live_abc',
      webhook_secret: 's3cret',
      apiPassword: 'pw',
      Authorization: 'Bearer x',
      cookie: 'sb-auth=...',
    }) as Record<string, unknown>

    expect(out.order_id).toBe('ord-1')
    expect(out.cardcom_token).toBe('[redacted]')
    expect(out.webhook_secret).toBe('[redacted]')
    expect(out.apiPassword).toBe('[redacted]')
    expect(out.Authorization).toBe('[redacted]')
    expect(out.cookie).toBe('[redacted]')
  })

  it('matches on substring, so prefixed and suffixed names are caught too', () => {
    const out = redact({
      p_idempotency_key: 'k',
      CARDCOM_API_PASSWORD: 'p',
      card_last4: '4242',
      jwt_claims: {},
    }) as Record<string, unknown>

    // Not because the key is exactly "token", but because it contains one of
    // the patterns. A new field named foo_token is covered on the day it is
    // added, which is the only way this stays correct.
    expect(out.p_idempotency_key).toBe('[redacted]')
    expect(out.CARDCOM_API_PASSWORD).toBe('[redacted]')
    expect(out.card_last4).toBe('[redacted]')
    expect(out.jwt_claims).toBe('[redacted]')
  })

  it('reaches into nested objects and arrays', () => {
    const out = redact({
      payment: { id: 'pay-1', raw: { Token: 'tok', Amount: '50.00' } },
      attempts: [{ token: 'a' }, { token: 'b' }],
    }) as Record<string, unknown>

    const payment = out.payment as Record<string, unknown>
    const raw = payment.raw as Record<string, unknown>
    expect(payment.id).toBe('pay-1')
    expect(raw.Token).toBe('[redacted]')
    expect(raw.Amount).toBe('50.00')

    const attempts = out.attempts as Record<string, unknown>[]
    expect(attempts.map((a) => a.token)).toEqual(['[redacted]', '[redacted]'])
  })

  it('stops at a depth limit rather than walking an arbitrary payload', () => {
    // Cardcom raw blobs are shallow; an unbounded walk over attacker-influenced
    // input is its own denial of service.
    const deep = { a: { b: { c: { d: { e: { f: 'bottom' } } } } } }
    const out = redact(deep) as Record<string, unknown>
    expect(JSON.stringify(out)).toContain('[truncated]')
    expect(JSON.stringify(out)).not.toContain('bottom')
  })

  it('passes primitives and null through untouched', () => {
    expect(redact('plain')).toBe('plain')
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBe(null)
    expect(redact(undefined)).toBe(undefined)
  })

  it('survives a cycle-free object with an empty shape', () => {
    expect(redact({})).toEqual({})
    expect(redact([])).toEqual([])
  })
})
