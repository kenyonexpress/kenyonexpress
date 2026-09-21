import { describe, expect, it } from 'vitest'
import {
  BLOCKED_MESSAGE_HE,
  blocklistDecision,
  expiryFor,
  isBlockActive,
  normalizeBlockValue,
} from './blocklist'

const NOW = new Date('2026-09-22T00:00:00Z')

describe('normalizeBlockValue', () => {
  it('folds an address to one spelling and refuses a non-address', () => {
    expect(normalizeBlockValue('email', ' Dana@Example.COM ')).toBe('dana@example.com')
    expect(normalizeBlockValue('email', 'not an address')).toBeNull()
  })

  it('folds an Israeli number to local digits, whichever way it was typed', () => {
    expect(normalizeBlockValue('phone', '+972-52-463-5550')).toBe('0524635550')
    expect(normalizeBlockValue('phone', '052 463 5550')).toBe('0524635550')
    expect(normalizeBlockValue('phone', '12')).toBeNull()
  })

  it('strips the v4-in-v6 prefix the runtime reports for loopback', () => {
    expect(normalizeBlockValue('ip', '::ffff:127.0.0.1')).toBe('127.0.0.1')
    expect(normalizeBlockValue('ip', '2001:DB8::1')).toBe('2001:db8::1')
    expect(normalizeBlockValue('ip', 'not an ip!')).toBeNull()
  })

  it('keeps a card fingerprint as given, bounded', () => {
    expect(normalizeBlockValue('card_fingerprint', 'tok_123')).toBe('tok_123')
    expect(normalizeBlockValue('card_fingerprint', 'x'.repeat(201))).toBeNull()
  })
})

describe('isBlockActive and blocklistDecision', () => {
  const row = {
    kind: 'email',
    value: 'a@b.com',
    reason: 'chargeback',
    expires_at: null,
    removed_at: null,
  }

  it('treats removed and expired rows as absent', () => {
    expect(isBlockActive(row, NOW)).toBe(true)
    expect(isBlockActive({ ...row, removed_at: '2026-09-01T00:00:00Z' }, NOW)).toBe(false)
    expect(isBlockActive({ ...row, expires_at: '2026-09-21T00:00:00Z' }, NOW)).toBe(false)
    expect(isBlockActive({ ...row, expires_at: '2026-09-23T00:00:00Z' }, NOW)).toBe(true)
  })

  it('tells the customer one sentence and the operator the reason', () => {
    const decision = blocklistDecision([row], NOW)
    expect(decision).toEqual({
      blocked: true,
      kind: 'email',
      reason: 'chargeback',
      message: BLOCKED_MESSAGE_HE,
    })
    expect(BLOCKED_MESSAGE_HE).not.toContain('a@b.com')
    expect(blocklistDecision([{ ...row, removed_at: '2026-09-01T00:00:00Z' }], NOW)).toEqual({
      blocked: false,
    })
  })
})

describe('expiryFor', () => {
  it('reads days into a timestamp, blank into no expiry, nonsense into invalid', () => {
    expect(expiryFor('30', NOW)).toBe('2026-10-22T00:00:00.000Z')
    expect(expiryFor('', NOW)).toBeNull()
    expect(expiryFor('0', NOW)).toBeUndefined()
    expect(expiryFor('abc', NOW)).toBeUndefined()
  })
})
