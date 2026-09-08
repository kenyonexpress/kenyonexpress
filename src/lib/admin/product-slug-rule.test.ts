import { describe, expect, it } from 'vitest'
import { productSchema } from './product-form-schema'

/**
 * THE SLUG RULE WAS STRICTER THAN THE CATALOGUE, AND BLOCKED 80% OF IT.
 *
 * `/^[a-z0-9-]+$/` accepted Latin only. Measured against the live catalogue on
 * 2026-09-08: 36 of 45 active products carry a HEBREW slug, preserved by the
 * WordPress import from the URLs WordPress had already published.
 *
 * `ProductForm` seeds the field from the stored slug and auto-generates only on
 * create. So opening an imported product to change its price resubmitted a
 * Hebrew slug into a Latin-only regex, and the save failed on a field the
 * editor never touched. Thirty-six of forty-five products were uneditable, and
 * nothing said why.
 *
 * These tests use REAL slugs from the live catalogue rather than invented ones,
 * because the defect was precisely a rule that looked reasonable and did not
 * match the data.
 */

const base = {
  name_he: 'מוצר לבדיקה',
  type: 'coupon' as const,
  // Required by the schema. Present so a failure here can only be the slug,
  // which is the whole point of the file.
  status: 'draft' as const,
  // A coupon needs an expiry; supplied so the only thing that can fail is the
  // slug, which is what this file is about.
  coupon_expiry_days: 30,
}

function slugResult(slug: string) {
  return productSchema.safeParse({ ...base, slug })
}

/** Verbatim from `products` on 2026-09-08. */
const LIVE_SLUGS = [
  'ארוחת-בוקר-זוגית-בקפה-קפה',
  'חיתולי-פמפרס',
  'מלון-5-כוכבים-בטבריה',
  'טיפול-פנים-עמוק',
  'שעון-אפל-חכם-apple-watch-series-7',
  'צימר-מאסטר-copy-copy',
]

describe('slugs that exist in production are editable', () => {
  it.each(LIVE_SLUGS)('accepts %s', (slug) => {
    expect(slugResult(slug).success, `${slug} is live and must stay saveable`).toBe(true)
  })

  it('accepts a mixed Hebrew and Latin slug, which the catalogue has', () => {
    expect(slugResult('שעון-אפל-חכם-apple-watch-series-7').success).toBe(true)
  })

  it('still accepts the Latin slugs slugify() mints for new products', () => {
    expect(slugResult('apple-watch-series-7').success).toBe(true)
  })
})

describe('what a URL cannot carry is still refused', () => {
  it.each([
    ['a shekel sign', 'עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪'],
    ['a space', 'two words'],
    ['a slash', 'a/b'],
    ['a question mark', 'a?b'],
    ['a hash', 'a#b'],
    ['a percent', 'a%20b'],
    ['a quote', "a'b"],
  ])('rejects %s', (_label, slug) => {
    expect(slugResult(slug).success).toBe(false)
  })

  it('rejects the two live shekel slugs, and that is the correct outcome', () => {
    // These are the duplicate twins found in pass 10: each is a second live URL
    // for a deal that already has one. Refusing to save them points at a real
    // defect instead of at 80% of the catalogue.
    expect(slugResult('עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪').success).toBe(false)
    expect(slugResult('עיסוי-משולב-מפנק-לגבר-רק-108₪').success).toBe(false)
  })

  it('still enforces a minimum length', () => {
    expect(slugResult('a').success).toBe(false)
  })
})

/**
 * The rule is the exact inverse of the one that minted these slugs. Written as
 * a test so the two cannot drift apart again: if the importer's class changes,
 * this is where it is noticed.
 */
describe('the rule matches the importer that produced the data', () => {
  it('accepts everything wp-import would have emitted', () => {
    const importerStrip = /[^\p{L}\p{N}-]/gu
    for (const raw of ['ארוחת בוקר זוגית', 'Apple Watch 7', 'עיסוי 45 דקות רק ב108₪']) {
      const asImported = raw.toLowerCase().trim().replace(/\s+/g, '-').replace(importerStrip, '')
      expect(slugResult(asImported).success, asImported).toBe(true)
    }
  })
})
