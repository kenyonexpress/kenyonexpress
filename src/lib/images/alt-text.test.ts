import { describe, expect, it } from 'vitest'
import { suggestAltHe } from './alt-text'
import { isValidHebrewAlt } from './validate'

describe('suggestAltHe', () => {
  it('builds the alt from the entity name, per kind', () => {
    expect(suggestAltHe({ kind: 'product', subject: 'ארוחה זוגית' })).toBe('תמונה של ארוחה זוגית')
    expect(suggestAltHe({ kind: 'supplier', subject: 'מסעדת הים' })).toBe('הלוגו של מסעדת הים')
    expect(suggestAltHe({ kind: 'category', subject: 'מסעדות' })).toBe('אייקון הקטגוריה מסעדות')
    expect(suggestAltHe({ kind: 'deal', subject: 'ספא זוגי' })).toBe('תמונה של הדיל ספא זוגי')
  })

  it('numbers several images of one thing, because they are not the same image', () => {
    expect(suggestAltHe({ kind: 'product', subject: 'ספא זוגי', index: 0, total: 3 })).toBe(
      'תמונה של ספא זוגי — תמונה 1 מתוך 3',
    )
    expect(suggestAltHe({ kind: 'product', subject: 'ספא זוגי', index: 2, total: 3 })).toBe(
      'תמונה של ספא זוגי — תמונה 3 מתוך 3',
    )
  })

  it('does not number a single image', () => {
    expect(suggestAltHe({ kind: 'product', subject: 'ספא זוגי', index: 0, total: 1 })).toBe(
      'תמונה של ספא זוגי',
    )
  })

  it('suggests nothing when there is nothing true to say', () => {
    // A generic filler would pass the validator, which is exactly how a
    // mandatory accessibility field becomes a formality.
    expect(suggestAltHe({ kind: 'product', subject: '' })).toBeNull()
    expect(suggestAltHe({ kind: 'product', subject: null })).toBeNull()
    expect(suggestAltHe({ kind: 'product', subject: ' א ' })).toBeNull()
  })

  it('refuses a Latin-only name instead of prefilling something the validator rejects', () => {
    expect(suggestAltHe({ kind: 'product', subject: 'AirPods Pro' })).toBeNull()
    // Mixed is fine, and the Hebrew part is what makes it valid.
    expect(suggestAltHe({ kind: 'product', subject: 'אוזניות AirPods Pro' })).toBe(
      'תמונה של אוזניות AirPods Pro',
    )
  })

  it('every suggestion it does make passes the gate the upload enforces', () => {
    const subjects = ['ארוחה זוגית', 'ספא', 'אוזניות AirPods 3', 'טיול ג׳יפים בגולן']
    for (const subject of subjects) {
      for (const kind of ['product', 'supplier', 'category', 'deal'] as const) {
        const suggestion = suggestAltHe({ kind, subject, index: 1, total: 4 })
        expect(suggestion).not.toBeNull()
        expect(isValidHebrewAlt(suggestion)).toBe(true)
      }
    }
  })

  it('collapses whitespace so the alt does not carry the form field verbatim', () => {
    expect(suggestAltHe({ kind: 'product', subject: '  ארוחה   זוגית  ' })).toBe(
      'תמונה של ארוחה זוגית',
    )
  })
})
