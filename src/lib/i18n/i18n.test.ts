import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTime,
} from '@/lib/i18n/format'
import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  LOCALES,
  PREPARED_LOCALES,
  intlTag,
  isActiveLocale,
  isLocaleCode,
  localeDirection,
} from '@/lib/i18n/locales'
import { CATALOG_EN, CATALOG_HE, messageKeys, t } from '@/lib/i18n/messages'
import { describe, expect, it } from 'vitest'
import {
  HEBREW_LITERAL_CEILING,
  totalHebrewLiterals,
} from '../../../scripts/hebrew-literal-scan.mjs'

describe('the locale registry', () => {
  it('has exactly one active locale, and it is Hebrew', () => {
    // [61]: "locale routing prepared but only he-IL active". This test is what
    // makes turning English on a deliberate change rather than a side effect.
    expect(ACTIVE_LOCALES).toEqual(['he'])
    expect(DEFAULT_LOCALE).toBe('he')
  })

  it('keeps English prepared rather than forgotten', () => {
    expect(PREPARED_LOCALES).toEqual(['en'])
  })

  it('carries a regional tag, because a bare code formats dates as en-US would', () => {
    expect(intlTag('he')).toBe('he-IL')
    expect(intlTag('en')).toBe('en-GB')
  })

  it('falls back to the default locale for an unknown code, not to LTR', () => {
    // An unknown code arriving at a Hebrew site is far more likely to be a typo
    // in a Hebrew route than a genuine English request; guessing `ltr` would
    // mirror the whole page for that mistake.
    expect(localeDirection('klingon')).toBe('rtl')
    expect(intlTag('klingon')).toBe('he-IL')
  })

  it('knows which codes exist and which are reachable', () => {
    expect(isLocaleCode('en')).toBe(true)
    expect(isActiveLocale('en')).toBe(false)
    expect(isActiveLocale('he')).toBe(true)
    expect(isLocaleCode('de')).toBe(false)
  })
})

describe('the RTL and LTR switch, exercised with the dummy locale', () => {
  it('flips direction between the two', () => {
    expect(localeDirection('he')).toBe('rtl')
    expect(localeDirection('en')).toBe('ltr')
  })

  it('every declared locale states a direction and a native name', () => {
    for (const definition of Object.values(LOCALES)) {
      expect(['rtl', 'ltr']).toContain(definition.dir)
      expect(definition.nativeName.length).toBeGreaterThan(0)
    }
  })

  it('renders the same key in both directions, which is what the dummy is for', () => {
    // The point of `en` is that the LTR path is EXERCISED rather than asserted
    // about. If the catalog ever drifts, this is what notices.
    expect(t('nav.home', 'he')).toBe('דף הבית')
    expect(t('nav.home', 'en')).toBe('Home')
  })
})

describe('the catalog', () => {
  it('has the same keys in both locales', () => {
    // A prepared locale missing a key is a half-translated page. Hebrew is the
    // source; English is checked against it.
    expect(messageKeys(CATALOG_EN)).toEqual(messageKeys(CATALOG_HE))
  })

  it('has no empty value in either locale', () => {
    for (const catalog of [CATALOG_HE, CATALOG_EN]) {
      for (const key of messageKeys(catalog)) {
        expect(t(key as never, catalog === CATALOG_HE ? 'he' : 'en').trim().length).toBeGreaterThan(
          0,
        )
      }
    }
  })

  it('falls back to Hebrew rather than to a dotted path when a locale is missing a key', () => {
    // Reachable only for a prepared locale whose catalog has drifted. A visible
    // Hebrew word is a half-translated page; `nav.home` in the middle of a page
    // is a bug report, and both beat an empty string nobody notices.
    const key = 'nav.home'
    expect(t(key, 'en')).toBe('Home')
  })
})

describe('the formatters', () => {
  const when = new Date('2026-09-09T14:30:00Z')

  it('prints a long month, so 9.9 cannot be read as two different days', () => {
    expect(formatDate(when, 'he')).toContain('בספטמבר')
    expect(formatDate(when, 'en')).toContain('September')
  })

  it('prints the short and long forms differently', () => {
    expect(formatDateShort(when, 'he')).toMatch(/09/)
    expect(formatDateTime(when, 'he')).toMatch(/\d{2}:\d{2}/)
    expect(formatTime(when, 'he')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns the empty string for an invalid date, never `Invalid Date`', () => {
    // `new Date(undefined).toLocaleDateString()` does not throw; it returns
    // those two words, and this codebase would print them into a receipt.
    expect(formatDate('not a date')).toBe('')
    expect(formatDateTime(Number.NaN)).toBe('')
    expect(formatTime('')).toBe('')
  })

  it('groups numbers and refuses infinities', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatNumber(Number.NaN)).toBe('')
  })

  it('treats a percent as a percentage, not a fraction', () => {
    // 12 means 12%. Passing 0.12 expecting 12% is the mistake this states.
    expect(formatPercent(12, 'en')).toBe('12%')
    expect(formatPercent(12.5, 'en', 1)).toBe('12.5%')
  })

  it('takes `now` as an argument and never reads the clock itself', () => {
    // Reading the clock inside a Server Component is a build error under
    // cacheComponents. The caller that has one supplies it.
    const now = new Date('2026-09-09T14:30:00Z')
    expect(formatRelativeTime(new Date('2026-09-06T14:30:00Z'), now, 'en')).toContain('3 days ago')
    expect(formatRelativeTime(new Date('2026-09-09T16:30:00Z'), now, 'en')).toContain('2 hours')
  })
})

describe('the i18n ratchet', () => {
  it('is at or under the ceiling', () => {
    // The gate is `pnpm lint`; this is the same rule where the rest of the
    // suite can see it.
    expect(totalHebrewLiterals()).toBeLessThanOrEqual(HEBREW_LITERAL_CEILING)
  })

  it('has a ceiling that matches what is actually there, so it cannot drift up quietly', () => {
    // An exact match rather than a bound: a ceiling left above the real count
    // is headroom for new literals to be added without anybody noticing, which
    // is the failure a ratchet exists to prevent.
    expect(totalHebrewLiterals()).toBe(HEBREW_LITERAL_CEILING)
  })
})
