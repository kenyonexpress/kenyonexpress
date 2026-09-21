import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { MAX_PROPOSAL_AGOROT, validateProposalNote, validateProposedPrice } from './price-proposals'

describe('validateProposedPrice', () => {
  it('turns shekels into integer agorot exactly once', () => {
    const r = validateProposedPrice('149.90', agorot(12000))
    expect(r).toEqual({ ok: true, agorot: 14990 })
  })

  it('refuses blanks, words, zero, negatives and floats of agorot', () => {
    for (const raw of ['', '   ', 'abc', '0', '-5', '0.001']) {
      expect(validateProposedPrice(raw, agorot(1000)).ok, raw).toBe(false)
    }
  })

  it('refuses the same price as today, and only that one', () => {
    expect(validateProposedPrice('10', agorot(1000)).ok).toBe(false)
    expect(validateProposedPrice('10.01', agorot(1000)).ok).toBe(true)
    // An unpriced product has nothing to be equal to.
    expect(validateProposedPrice('10', null).ok).toBe(true)
  })

  it('caps at the table CHECK so the form fails with a sentence, not a 23514', () => {
    expect(validateProposedPrice('100000', null)).toEqual({ ok: true, agorot: MAX_PROPOSAL_AGOROT })
    expect(validateProposedPrice('100000.01', null).ok).toBe(false)
  })
})

describe('validateProposalNote', () => {
  it('trims, nulls an empty note and bounds the length', () => {
    expect(validateProposalNote('  ')).toEqual({ ok: true, note: null })
    expect(validateProposalNote(' hi ')).toEqual({ ok: true, note: 'hi' })
    expect(validateProposalNote('x'.repeat(1001)).ok).toBe(false)
  })
})
