import { describe, expect, it } from 'vitest'
import { expandQueryWord, stripKnownPrefix } from './db-expansion'
import { SYNONYM_GROUPS } from './hebrew-synonyms'

describe('stripKnownPrefix', () => {
  it('strips a prefix when the stem is a term the catalogue knows', () => {
    expect(stripKnownPrefix('המסעדה')).toBe('מסעדה')
    expect(stripKnownPrefix('בצימר')).toBe('צימר')
    expect(stripKnownPrefix('לעיסוי')).toBe('עיסוי')
  })

  it('leaves a word alone when the stem is not a known term', () => {
    // The exact two words hebrew-synonyms.ts names as the reason it refuses to
    // ship a general prefix stripper. משהו -> שהו and ברזל -> רזל are both
    // wrong, and both are what a naive stripper would do.
    expect(stripKnownPrefix('משהו')).toBeNull()
    expect(stripKnownPrefix('ברזל')).toBeNull()
  })

  it('leaves a word alone when it starts with no Hebrew prefix', () => {
    expect(stripKnownPrefix('צימר')).toBeNull()
    expect(stripKnownPrefix('תספורת')).toBeNull()
  })

  it('refuses to strip down to a stub', () => {
    // מתנה minus מ is תנה: three letters, and an ILIKE pattern that short
    // matches a large slice of any Hebrew catalogue.
    expect(stripKnownPrefix('בר')).toBeNull()
    expect(stripKnownPrefix('מתנה')).toBeNull()
  })
})

describe('expandQueryWord', () => {
  it('always keeps the typed word, so expansion can never lose a result', () => {
    // The property the whole change rests on: every pattern the old code
    // searched is still searched. A query cannot return FEWER rows than before.
    for (const word of ['צימר', 'משהו', 'apple', 'ברזל', 'חיתולי', 'zzz']) {
      expect(expandQueryWord(word)).toContain(word)
    }
  })

  it('reaches the rest of the synonym group', () => {
    const spa = expandQueryWord('עיסוי')
    expect(spa).toContain('ספא')
    expect(spa).toContain('מסאז')
    expect(spa).toContain('פינוק')
  })

  it('reaches the group through a prefixed spelling too', () => {
    // A shopper types המסעדה. Before this module the LIKE pattern was
    // %המסעדה% and a product reading "ארוחה במסעדת השף" matched nothing.
    const prefixed = expandQueryWord('המסעדה')
    expect(prefixed).toContain('מסעדה')
    expect(prefixed).toContain('ארוחה')
  })

  it('emits no prefixed spellings of the targets', () => {
    // ILIKE is a substring match, so %מסעדה% already matches a product whose
    // text says המסעדה. Generating the prefixed forms as well would multiply
    // every group by eight and buy nothing, and each one becomes a clause in
    // a PostgREST or= group that travels in a URL.
    for (const term of expandQueryWord('עיסוי')) {
      expect(SYNONYM_GROUPS.flat().includes(term) || term === 'עיסוי').toBe(true)
    }
  })

  it('stays small enough to put in a URL', () => {
    // The largest group in the file is the seven-term pampering group. Anything
    // that pushes a single word past this is a group that grew without anyone
    // thinking about the query it produces.
    for (const group of SYNONYM_GROUPS) {
      for (const term of group) {
        expect(expandQueryWord(term).length, term).toBeLessThanOrEqual(12)
      }
    }
  })

  it('returns nothing for empty input', () => {
    expect(expandQueryWord('')).toEqual([])
    expect(expandQueryWord('   ')).toEqual([])
  })
})
