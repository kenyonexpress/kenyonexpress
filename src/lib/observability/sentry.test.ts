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

describe('a whole Cardcom webhook body (marathon step 15)', () => {
  // The realistic legacy /Interface callback shape, with the exact field
  // names cardcom.ts reads (both spellings) plus the instrument fields a
  // terminal can attach. This is the body capturePaymentAlarm forwards on a
  // mismatch -- the moment an error report is MOST likely to carry it whole.
  const callback = {
    terminalnumber: '1000',
    lowprofilecode: 'lp-123',
    ResponseCode: '0',
    Operation: '1',
    DealResponse: '0',
    OperationResponse: '0',
    ReturnValue: 'pay-1',
    Amount: '199.90',
    Last4CardDigits: '1234',
    CardOwnerName: 'ישראל ישראלי',
    CardValidityYear: '28',
    CardValidityMonth: '09',
    Token: 'tok_live_abc',
    TokenExDate: '20280901',
    InternalDealNumber: '777',
  }

  it('strips every instrument field and keeps the operational ones', () => {
    const out = redact(callback) as Record<string, unknown>

    // The chargeable instrument and everything printed on the card.
    expect(out.Token).toBe('[redacted]')
    expect(out.TokenExDate).toBe('[redacted]')
    expect(out.Last4CardDigits).toBe('[redacted]')
    expect(out.CardOwnerName).toBe('[redacted]')
    expect(out.CardValidityYear).toBe('[redacted]')
    expect(out.CardValidityMonth).toBe('[redacted]')

    // What an operator debugging a mismatch actually needs.
    expect(out.ReturnValue).toBe('pay-1')
    expect(out.Amount).toBe('199.90')
    expect(out.ResponseCode).toBe('0')
    expect(out.lowprofilecode).toBe('lp-123')
    expect(out.InternalDealNumber).toBe('777')
  })

  it('leaks nothing card-shaped through the serialised report', () => {
    const serialised = JSON.stringify(redact(callback))
    expect(serialised).not.toContain('tok_live_abc')
    expect(serialised).not.toContain('1234')
    expect(serialised).not.toContain('ישראל')
  })
})
