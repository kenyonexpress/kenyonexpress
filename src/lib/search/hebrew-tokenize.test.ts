import {
  MAX_QUERY_LENGTH,
  hasHebrew,
  normalizeSearchQuery,
  queryDirection,
  tokenizeSearchQuery,
} from '@/lib/search/hebrew-tokenize'
import { describe, expect, it } from 'vitest'

/**
 * RTL tokenisation.
 *
 * Every case here is a string a shopper can actually produce by copying text
 * out of WhatsApp, a PDF or a pointed Hebrew document, and every one of them
 * looks identical on screen to the plain form it is compared against. That is
 * the whole difficulty: the bug is invisible in a code review, in a bug report
 * and in a screenshot.
 */

const RLM = '‏'
const LRM = '‎'
const RLE = '‫'
const PDF = '‬'
const RLI = '⁧'
const PDI = '⁩'
const ZWSP = '​'
const BOM = '﻿'

describe('normalizeSearchQuery: invisible characters', () => {
  it('strips the bidi marks a pasted RTL string carries', () => {
    // Looks exactly like 'מסעדה' in every editor and every terminal.
    expect(normalizeSearchQuery(`${RLM}מסעדה${LRM}`)).toBe('מסעדה')
    expect(normalizeSearchQuery(`${RLE}מסעדה${PDF}`)).toBe('מסעדה')
    expect(normalizeSearchQuery(`${RLI}מסעדה${PDI}`)).toBe('מסעדה')
    expect(normalizeSearchQuery(`${BOM}מסעדה`)).toBe('מסעדה')
  })

  it('removes a zero-width space INSIDE a word rather than splitting there', () => {
    // A ZWSP mid-word is the nastiest of the set: it is not whitespace, so a
    // tokeniser keeps it in the token, and 'מסע​דה' matches nothing.
    expect(normalizeSearchQuery(`מסע${ZWSP}דה`)).toBe('מסעדה')
    expect(tokenizeSearchQuery(`מסע${ZWSP}דה`)).toEqual(['מסעדה'])
  })

  it('leaves a query of only invisible characters empty, not whitespace', () => {
    expect(normalizeSearchQuery(`${RLM}${LRM}${ZWSP}`)).toBe('')
    expect(tokenizeSearchQuery(`${RLM}${LRM}${ZWSP}`)).toEqual([])
  })
})

describe('normalizeSearchQuery: Hebrew marks and punctuation', () => {
  it('strips niqqud and cantillation', () => {
    expect(normalizeSearchQuery('מִסְעָדָה')).toBe('מסעדה')
    expect(normalizeSearchQuery('בֵּית קָפֶה')).toBe('בית קפה')
  })

  it('joins an acronym written with gershayim into one token', () => {
    expect(tokenizeSearchQuery('צה"ל')).toEqual(['צהל'])
    expect(tokenizeSearchQuery('ר״ג')).toEqual(['רג'])
    expect(tokenizeSearchQuery('ג׳ינס')).toEqual(['גינס'])
  })

  it('treats maqaf as a word boundary, because that is what it is', () => {
    // U+05BE sits inside the same Unicode block as the vowel points but is a
    // hyphen. Deleting it would produce 'ביתקפה', which matches nothing.
    expect(tokenizeSearchQuery('בית־קפה')).toEqual(['בית', 'קפה'])
  })

  it('does not fold final letters, because the index does not either', () => {
    expect(normalizeSearchQuery('דגים')).toBe('דגים')
    expect(normalizeSearchQuery('חופש')).toBe('חופש')
  })

  it('does not strip an attached prefix', () => {
    // ברזל must not become רזל. Prefixes are declared per term in
    // hebrew-synonyms.ts, where the base word is known.
    expect(normalizeSearchQuery('ברזל')).toBe('ברזל')
    expect(normalizeSearchQuery('משהו')).toBe('משהו')
  })
})

describe('normalizeSearchQuery: shape', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeSearchQuery('  יום   ספא \n')).toBe('יום ספא')
  })

  it('turns punctuation into boundaries', () => {
    expect(tokenizeSearchQuery('ספא, עיסוי; פנים!')).toEqual(['ספא', 'עיסוי', 'פנים'])
  })

  it('keeps digits and Latin, which is how a SKU is searched', () => {
    expect(tokenizeSearchQuery('SPA-1 2026')).toEqual(['SPA', '1', '2026'])
  })

  it('caps the length', () => {
    const long = 'א'.repeat(MAX_QUERY_LENGTH + 40)
    expect(normalizeSearchQuery(long)).toHaveLength(MAX_QUERY_LENGTH)
  })

  it('composes decomposed input before measuring it', () => {
    // NFD then NFC: the point is that the mark is combined first and stripped
    // second, so neither ordering leaves a stray mark as its own token.
    expect(normalizeSearchQuery('מִסְעָדָה'.normalize('NFD'))).toBe('מסעדה')
  })
})

describe('hasHebrew / queryDirection', () => {
  it('detects Hebrew letters', () => {
    expect(hasHebrew('ספא')).toBe(true)
    expect(hasHebrew('spa')).toBe(false)
    expect(hasHebrew('spa ספא')).toBe(true)
  })

  it('keeps the box RTL unless the value is purely Latin', () => {
    expect(queryDirection('')).toBe('rtl')
    expect(queryDirection('   ')).toBe('rtl')
    expect(queryDirection('ספא')).toBe('rtl')
    expect(queryDirection('spa ספא')).toBe('rtl')
    expect(queryDirection('SPA-1')).toBe('ltr')
    // Digits alone have no direction of their own; the UI is RTL, so they stay.
    expect(queryDirection('2026')).toBe('rtl')
  })
})
