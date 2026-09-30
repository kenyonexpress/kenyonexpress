import { CITIES, cityByName } from '@/lib/geo/cities'
import { describe, expect, it } from 'vitest'
import {
  CITY_SUGGESTION_LIMIT,
  ISRAELI_CITIES,
  normalizeCityQuery,
  resolveIsraeliCity,
  suggestCities,
} from './israeli-cities'

describe('the Israeli city list', () => {
  it('has no duplicate canonical name', () => {
    const names = ISRAELI_CITIES.map((city) => city.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('has no alias that collides with another row', () => {
    const seen = new Map<string, string>()
    for (const city of ISRAELI_CITIES) {
      for (const label of [city.name, ...city.aliases]) {
        const norm = normalizeCityQuery(label)
        const owner = seen.get(norm)
        expect(owner === undefined || owner === city.name, `${label} -> ${owner}`).toBe(true)
        seen.set(norm, city.name)
      }
    }
  })

  it('is Hebrew throughout: a suggestion is never a Latin string', () => {
    for (const city of ISRAELI_CITIES) {
      expect(city.name, city.name).toMatch(/[֐-׿]/)
      expect(city.name).not.toMatch(/[A-Za-z]/)
    }
  })

  it('offers every city the delivery estimate knows, under the exact name the estimate matches', () => {
    // The picker narrows the slot list by `cityByName(picked)`; a picked name
    // that the estimate table does not recognise would silently fall back to
    // the country-wide band.
    for (const city of CITIES) {
      const offered = suggestCities(city.name, 1)[0]
      expect(offered?.name, city.slug).toBe(city.name)
      expect(cityByName(offered?.name ?? '')?.slug).toBe(city.slug)
    }
  })
})

describe('normalizeCityQuery', () => {
  it('treats hyphen, maqaf and doubled spaces as one space', () => {
    expect(normalizeCityQuery('תל-אביב')).toBe('תל אביב')
    expect(normalizeCityQuery('תל־אביב')).toBe('תל אביב')
    expect(normalizeCityQuery('  תל   אביב ')).toBe('תל אביב')
  })

  it('spells קרית and קריית the same', () => {
    expect(normalizeCityQuery('קרית גת')).toBe(normalizeCityQuery('קריית גת'))
  })

  it('drops gershayim and keeps a geresh as an apostrophe', () => {
    expect(normalizeCityQuery('ראשל״צ')).toBe('ראשלצ')
    expect(normalizeCityQuery('ג׳ת')).toBe("ג'ת")
  })
})

describe('suggestCities', () => {
  it('offers nothing for an empty query: it answers typing, it is not a scroll list', () => {
    expect(suggestCities('')).toEqual([])
    expect(suggestCities('   ')).toEqual([])
  })

  it('matches a prefix of the whole name first, in population order', () => {
    const names = suggestCities('רמ').map((city) => city.name)
    expect(names[0]).toBe('רמת גן')
    expect(names).toContain('רמלה')
    expect(names).toContain('רמת השרון')
  })

  it('matches a later word so סבא finds כפר סבא, after any whole-name match', () => {
    const names = suggestCities('סבא').map((city) => city.name)
    expect(names).toEqual(['כפר סבא'])
    // "שבע" is a later word of באר שבע; nothing starts with it.
    expect(suggestCities('שבע').map((city) => city.name)).toEqual(['באר שבע'])
  })

  it('resolves an alias to the one canonical row, once', () => {
    expect(suggestCities('פתח תקוה').map((city) => city.name)).toEqual(['פתח תקווה'])
    expect(suggestCities('ראשל"צ').map((city) => city.name)).toEqual(['ראשון לציון'])
    expect(suggestCities('ת"א').map((city) => city.name)).toEqual(['תל אביב'])
    expect(suggestCities('נצרת עילית').map((city) => city.name)).toEqual(['נוף הגליל'])
  })

  it('caps the list', () => {
    expect(suggestCities('א').length).toBeLessThanOrEqual(CITY_SUGGESTION_LIMIT)
    expect(suggestCities('א', 3)).toHaveLength(3)
    expect(suggestCities('א', 0)).toEqual([])
  })

  it('offers nothing for a locality it does not know, and that is not an error', () => {
    expect(suggestCities('כפר שאיננו')).toEqual([])
  })
})

describe('resolveIsraeliCity', () => {
  it('finds the row behind a typed spelling', () => {
    expect(resolveIsraeliCity('תל אביב-יפו')?.name).toBe('תל אביב')
    expect(resolveIsraeliCity('קרית אתא')?.name).toBe('קריית אתא')
  })

  it('answers null for blank or unknown input', () => {
    expect(resolveIsraeliCity('')).toBeNull()
    expect(resolveIsraeliCity(null)).toBeNull()
    expect(resolveIsraeliCity('מושב לא רשום')).toBeNull()
  })
})
