import { describe, expect, it } from 'vitest'
import { canonicalJson, hashResponse, makeIdempotencyKey } from './idempotency'

describe('makeIdempotencyKey', () => {
  it('joins scope and parts with colons deterministically', () => {
    expect(makeIdempotencyKey('lp', 'ref-123')).toBe('lp:ref-123')
    expect(makeIdempotencyKey('order', 'o1', 'cashback')).toBe('order:o1:cashback')
    expect(makeIdempotencyKey('tok', 'o1', 42)).toBe('tok:o1:42')
  })

  it('trims parts and rejects empty', () => {
    expect(makeIdempotencyKey('lp', '  ref  ')).toBe('lp:ref')
    expect(() => makeIdempotencyKey('lp', '')).toThrow(TypeError)
    expect(() => makeIdempotencyKey('', 'x')).toThrow(TypeError)
  })
})

describe('canonicalJson', () => {
  it('sorts object keys recursively so equal payloads serialize identically', () => {
    const a = { b: 1, a: { d: 4, c: 3 } }
    const b = { a: { c: 3, d: 4 }, b: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
    expect(canonicalJson(a)).toBe('{"a":{"c":3,"d":4},"b":1}')
  })

  it('rejects non-finite numbers (no NaN/Infinity in a money response)', () => {
    expect(() => canonicalJson({ amount: Number.POSITIVE_INFINITY })).toThrow(TypeError)
    expect(() => canonicalJson({ amount: Number.NaN })).toThrow(TypeError)
  })
})

describe('hashResponse', () => {
  it('is stable across key order and changes with content', () => {
    const h1 = hashResponse({ orderId: 'o1', paid: true })
    const h2 = hashResponse({ paid: true, orderId: 'o1' })
    const h3 = hashResponse({ orderId: 'o1', paid: false })
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })
})
