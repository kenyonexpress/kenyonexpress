import {
  DEFAULT_STREET_LOOKUP_URL,
  buildStreetLookupUrl,
  cityMatchesRecord,
  normalizeStreetLookupQuery,
  normalizeStreetName,
  parseStreetLookupResponse,
  rankStreetSuggestions,
  streetTsQuery,
} from '@/lib/checkout/street-autocomplete'
import { describe, expect, it } from 'vitest'

/**
 * The two pure halves of the street lookup (UX17): what is asked of the
 * registry and what is made of its answer. The shapes below are the ones the
 * registry really returned on 14.10.2026 (see the module header), so a parse
 * that passes here reads the live answer.
 */

/** A real answer, trimmed: "תל & אביב & דיז:*" on the CBS street registry. */
const CKAN_ANSWER = JSON.stringify({
  success: true,
  result: {
    records: [
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'ככר דיזנגוף' },
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'דיזנגוף' },
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'דיזנגוף סנטר' },
      // The words matched in the wrong column: a Tel Aviv row whose street
      // is named for another town, and another town's Dizengoff.
      { שם_ישוב: 'תל אביב - יפו', שם_רחוב: 'אוניברסיטת תל -אביב' },
      { שם_ישוב: 'באר יעקב', שם_רחוב: 'דיזנגוף' },
    ],
  },
})

describe('normalizeStreetLookupQuery', () => {
  it('trims and collapses both values', () => {
    expect(normalizeStreetLookupQuery({ city: '  תל   אביב ', prefix: ' דיז ' })).toEqual({
      city: 'תל אביב',
      prefix: 'דיז',
    })
  })

  it('refuses a missing city, a short prefix, an absurd length and a control character', () => {
    expect(normalizeStreetLookupQuery({ city: '', prefix: 'דיז' })).toBeNull()
    expect(normalizeStreetLookupQuery({ city: 'תל אביב', prefix: 'ד' })).toBeNull()
    expect(normalizeStreetLookupQuery({ city: 'תל אביב', prefix: 'א'.repeat(81) })).toBeNull()
    expect(normalizeStreetLookupQuery({ city: 'תל אביב', prefix: 'דיז\u0007' })).toBeNull()
    expect(normalizeStreetLookupQuery({ city: 42, prefix: 'דיז' })).toBeNull()
  })
})

describe('streetTsQuery', () => {
  it('ANDs the city words and the street words, with the last street word as a prefix', () => {
    expect(streetTsQuery({ city: 'תל אביב', prefix: 'דיז' })).toBe('תל & אביב & דיז:*')
    expect(streetTsQuery({ city: 'ירושלים', prefix: 'בן יה' })).toBe('ירושלים & בן & יה:*')
  })

  it('resolves a city alias to the name the registry is likelier to know', () => {
    expect(streetTsQuery({ city: 'ת"א', prefix: 'דיז' })).toBe('תל & אביב & דיז:*')
    expect(streetTsQuery({ city: 'פתח תקוה', prefix: 'רוט' })).toBe('פתח & תקווה & רוט:*')
  })

  it('drops punctuation the parser would not keep, and refuses a prefix with nothing left', () => {
    expect(streetTsQuery({ city: 'מודיעין-מכבים-רעות', prefix: 'עמק' })).toBe(
      'מודיעין & מכבים & רעות & עמק:*',
    )
    expect(streetTsQuery({ city: 'תל אביב', prefix: '--' })).toBeNull()
  })
})

describe('buildStreetLookupUrl', () => {
  const query = { city: 'תל אביב', prefix: 'דיז' }

  it('asks the public registry by default, with the query URL-encoded in place', () => {
    const url = buildStreetLookupUrl(query, undefined)
    expect(url).not.toBeNull()
    expect(url?.startsWith('https://data.gov.il/api/3/action/datastore_search?')).toBe(true)
    expect(url).toContain('resource_id=9ad3862c-8391-4b2f-84a4-2d4c68625f4b')
    expect(url).toContain('plain=false')
    expect(url).toContain(`q=${encodeURIComponent('תל & אביב & דיז:*')}`)
    expect(url).not.toContain('{tsquery}')
    expect(buildStreetLookupUrl(query, '')).toBe(buildStreetLookupUrl(query, undefined))
  })

  it('is switched off by `off`, and refuses an http template', () => {
    expect(buildStreetLookupUrl(query, 'off')).toBeNull()
    expect(buildStreetLookupUrl(query, ' OFF ')).toBeNull()
    expect(buildStreetLookupUrl(query, 'http://streets.example.test/?q={q}')).toBeNull()
  })

  it('fills a custom template with all three placeholders', () => {
    const url = buildStreetLookupUrl(
      query,
      'https://streets.example.test/?c={city}&q={q}&ts={tsquery}',
    )
    expect(url).toBe(
      `https://streets.example.test/?c=${encodeURIComponent('תל אביב')}&q=${encodeURIComponent('דיז')}&ts=${encodeURIComponent('תל & אביב & דיז:*')}`,
    )
  })

  it('answers null for a prefix that leaves no word to ask about', () => {
    expect(buildStreetLookupUrl({ city: 'תל אביב', prefix: '!!' }, undefined)).toBeNull()
  })

  it('keeps the default template https and placeholder-bearing', () => {
    expect(DEFAULT_STREET_LOOKUP_URL.startsWith('https://')).toBe(true)
    expect(DEFAULT_STREET_LOOKUP_URL).toContain('{tsquery}')
  })
})

describe('parseStreetLookupResponse', () => {
  it('reads CKAN rows into city and street', () => {
    const rows = parseStreetLookupResponse(CKAN_ANSWER)
    expect(rows).toHaveLength(5)
    expect(rows[1]).toEqual({ city: 'תל אביב - יפו', street: 'דיזנגוף' })
  })

  it('reads the simpler shapes a provider of one own might use', () => {
    expect(parseStreetLookupResponse(JSON.stringify({ streets: ['הרצל', 'ויצמן'] }))).toEqual([
      { city: null, street: 'הרצל' },
      { city: null, street: 'ויצמן' },
    ])
    expect(
      parseStreetLookupResponse(JSON.stringify([{ city: 'חיפה', street: 'הנביאים' }])),
    ).toEqual([{ city: 'חיפה', street: 'הנביאים' }])
    expect(parseStreetLookupResponse(JSON.stringify({ records: [{ name: 'אלנבי' }] }))).toEqual([
      { city: null, street: 'אלנבי' },
    ])
  })

  it('is an empty list for anything that is not rows: HTML, a number, a bare object', () => {
    expect(parseStreetLookupResponse('<!DOCTYPE html><html>שגיאה</html>')).toEqual([])
    expect(parseStreetLookupResponse('42')).toEqual([])
    expect(parseStreetLookupResponse('{"success":false}')).toEqual([])
    expect(
      parseStreetLookupResponse(JSON.stringify({ result: { records: [{ x: 1 }, 7] } })),
    ).toEqual([])
  })
})

describe('rankStreetSuggestions', () => {
  const query = { city: 'תל אביב', prefix: 'דיז' }

  it('keeps the typed city only, prefix matches first, shorter first inside a score', () => {
    const streets = rankStreetSuggestions(parseStreetLookupResponse(CKAN_ANSWER), query)
    expect(streets).toEqual(['דיזנגוף', 'דיזנגוף סנטר', 'ככר דיזנגוף'])
  })

  it('finds a later word, in either order of the typed words', () => {
    const rows = [
      { city: 'ירושלים', street: 'בן יהודה' },
      { city: 'ירושלים', street: 'יהושע בן נון' },
      { city: 'ירושלים', street: 'בן גמלא יהושע' },
    ]
    expect(rankStreetSuggestions(rows, { city: 'ירושלים', prefix: 'בן יה' })).toEqual([
      'בן יהודה',
      'יהושע בן נון',
      'בן גמלא יהושע',
    ])
    expect(rankStreetSuggestions(rows, { city: 'ירושלים', prefix: 'יהודה בן' })).toEqual([
      'בן יהודה',
    ])
  })

  it('drops duplicates and caps at the limit', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      city: 'חיפה',
      street: i % 2 ? 'הנביאים' : `הנרקיסים ${i}`,
    }))
    const streets = rankStreetSuggestions(rows, { city: 'חיפה', prefix: 'הנ' })
    expect(streets).toHaveLength(8)
    expect(streets[0]).toBe('הנביאים')
    expect(streets.filter((s) => s === 'הנביאים')).toHaveLength(1)
  })

  it('answers nothing for an empty prefix or a zero limit', () => {
    expect(
      rankStreetSuggestions([{ city: null, street: 'הרצל' }], { city: 'x', prefix: ' ' }),
    ).toEqual([])
    expect(
      rankStreetSuggestions([{ city: null, street: 'הרצל' }], { city: 'x', prefix: 'הר' }, 0),
    ).toEqual([])
  })
})

describe('cityMatchesRecord', () => {
  it('accepts the registry spelling with its suffix, an alias, and a row with no city', () => {
    expect(cityMatchesRecord('תל אביב', 'תל אביב - יפו')).toBe(true)
    expect(cityMatchesRecord('ת"א', 'תל אביב - יפו')).toBe(true)
    expect(cityMatchesRecord('פתח תקוה', 'פתח תקווה')).toBe(true)
    expect(cityMatchesRecord('חיפה', null)).toBe(true)
  })

  it('refuses another town', () => {
    expect(cityMatchesRecord('תל אביב', 'באר יעקב')).toBe(false)
    expect(cityMatchesRecord('רמת גן', 'רמת השרון')).toBe(false)
  })
})

describe('normalizeStreetName', () => {
  it('agrees on hyphens, spaces and the quote glyphs', () => {
    expect(normalizeStreetName('בן-גוריון')).toBe(normalizeStreetName('בן גוריון'))
    expect(normalizeStreetName("ז'בוטינסקי")).toBe(normalizeStreetName('ז׳בוטינסקי'))
    expect(normalizeStreetName("שד' רוטשילד")).toBe("שד'רוטשילד")
  })
})
