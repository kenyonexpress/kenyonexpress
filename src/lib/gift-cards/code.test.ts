import { describe, expect, it } from 'vitest'
import {
  createGiftCardCode,
  formatGiftCardCode,
  hashGiftCardCode,
  isWellFormedGiftCardCode,
  normalizeGiftCardCode,
} from './code'

describe('createGiftCardCode', () => {
  it('mints a grouped 16-character code with its hash and tail', () => {
    const { code, hash, last4 } = createGiftCardCode()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(code.replaceAll('-', '').endsWith(last4)).toBe(true)
    expect(isWellFormedGiftCardCode(code)).toBe(true)
  })

  it('never emits a lookalike character', () => {
    for (let i = 0; i < 20; i += 1) {
      const { code } = createGiftCardCode()
      expect(code).not.toMatch(/[01OILU]/i)
    }
  })
})

describe('normalize and hash', () => {
  it('a dictated code matches its printed form', () => {
    // Lowercase, spaces instead of dashes, stray punctuation: still the same card.
    expect(hashGiftCardCode('abcd efgh jkmn pqrs')).toBe(hashGiftCardCode('ABCD-EFGH-JKMN-PQRS'))
  })

  it('formats back into groups of four', () => {
    expect(formatGiftCardCode('abcdefghjkmnpqrs')).toBe('ABCD-EFGH-JKMN-PQRS')
  })

  it('normalize strips everything that is not a letter or digit', () => {
    expect(normalizeGiftCardCode(' ab-CD_2:3 ')).toBe('ABCD23')
  })
})

describe('isWellFormedGiftCardCode', () => {
  it('rejects the wrong length, the empty string and lookalike characters', () => {
    expect(isWellFormedGiftCardCode('')).toBe(false)
    expect(isWellFormedGiftCardCode(null)).toBe(false)
    expect(isWellFormedGiftCardCode('ABCD-EFGH-JKMN')).toBe(false)
    // O is not in the alphabet, so a 16-char string holding one is a typo.
    expect(isWellFormedGiftCardCode('OBCD-EFGH-JKMN-PQRS')).toBe(false)
  })
})
