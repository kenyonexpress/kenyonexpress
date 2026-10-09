import { describe, expect, it } from 'vitest'
import { detectQueryLocales, localesParam } from './query-locale'

describe('detectQueryLocales', () => {
  it('reads Hebrew script as Hebrew', () => {
    expect(detectQueryLocales('מסעדה זוגית')).toEqual(['heb'])
  })

  it('reads Latin script as English', () => {
    expect(detectQueryLocales('spa massage')).toEqual(['eng'])
  })

  it('reads Cyrillic as Russian and Arabic script as Arabic', () => {
    expect(detectQueryLocales('массаж')).toEqual(['rus'])
    expect(detectQueryLocales('مطعم')).toEqual(['ara'])
  })

  it('keeps every script of a mixed query, Hebrew first', () => {
    // A brand in Latin letters next to a Hebrew noun is the ordinary shape of
    // a real query here ("אוזניות sony"), and both halves must tokenize right.
    expect(detectQueryLocales('אוזניות sony')).toEqual(['heb', 'eng'])
    expect(detectQueryLocales('sony אוזניות')).toEqual(['heb', 'eng'])
  })

  it('finds no locale in digits and punctuation', () => {
    // A SKU or a barcode has no script; pinning a tokenizer would be a lie.
    expect(detectQueryLocales('7290011234567')).toEqual([])
    expect(detectQueryLocales('')).toEqual([])
    expect(detectQueryLocales('   ')).toEqual([])
  })
})

describe('localesParam', () => {
  it('spreads to nothing when there is nothing to pin', () => {
    expect(localesParam('12345')).toEqual({})
    expect({ q: '12345', ...localesParam('12345') }).toEqual({ q: '12345' })
  })

  it('carries the detected list otherwise', () => {
    expect(localesParam('ספא')).toEqual({ locales: ['heb'] })
  })
})
