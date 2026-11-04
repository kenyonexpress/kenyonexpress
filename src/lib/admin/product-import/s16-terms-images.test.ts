import { describe, expect, it } from 'vitest'
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_IMAGES,
  buildTemplateCsv,
  mapHeaders,
  parseImageCell,
  toRecords,
  validateImportRow,
} from './import-rows'
import { parseCsv } from './parse-csv'

/**
 * S16: the CSV import carries the same shipping fee, cancellation window and
 * images the single-product form does, through the form's own schema.
 */

const base = {
  slug: 's16-product',
  name_he: 'מוצר S16',
  kenyon_price: '199',
  platform_percent: '30',
}

function row(extra: Record<string, string>) {
  return validateImportRow({ line: 2, record: { ...base, ...extra } })
}

describe('S16 import: shipping fee', () => {
  it('converts shekels to integer agorot once', () => {
    const r = row({ shipping_price_ils: '29.90' })
    expect(r.errors).toEqual([])
    expect(r.terms.shippingPriceAgorot).toBe(2990)
    expect(Number.isInteger(r.terms.shippingPriceAgorot)).toBe(true)
  })

  it('reads a blank cell as free shipping, the form default', () => {
    const r = row({})
    expect(r.errors).toEqual([])
    expect(r.terms.shippingPriceAgorot).toBe(0)
  })

  it('refuses a negative fee in Hebrew and names the column', () => {
    const r = row({ shipping_price_ils: '-5' })
    expect(r.data).toBeUndefined()
    expect(r.errors.join(' ')).toContain('דמי משלוח')
    expect(r.errors.join(' ')).toContain('לא יכול להיות שלילי')
  })

  it('refuses a shipping fee on a coupon', () => {
    const r = row({ type: 'coupon', coupon_price_ils: '30', shipping_price_ils: '20' })
    expect(r.data).toBeUndefined()
    expect(r.errors).toContain('דמי משלוח: לקופון אין משלוח')
  })

  it('accepts a zero fee on a coupon', () => {
    const r = row({ type: 'coupon', coupon_price_ils: '30', shipping_price_ils: '0' })
    expect(r.errors).toEqual([])
  })
})

describe('S16 import: cancellation window', () => {
  it('defaults to the statutory 14 days', () => {
    expect(row({}).terms.cancellationWindowDays).toBe(14)
  })

  it('accepts a longer window', () => {
    const r = row({ cancellation_window_days: '30' })
    expect(r.errors).toEqual([])
    expect(r.terms.cancellationWindowDays).toBe(30)
  })

  it('refuses a window below the statutory floor', () => {
    const r = row({ cancellation_window_days: '7' })
    expect(r.data).toBeUndefined()
    expect(r.errors.join(' ')).toContain('חוק הגנת הצרכן')
  })

  it('refuses a fractional window', () => {
    const r = row({ cancellation_window_days: '14.5' })
    expect(r.data).toBeUndefined()
    expect(r.errors.join(' ')).toContain('חלון ביטול בימים')
  })
})

describe('S16 import: images', () => {
  it('splits on |, trims and dedupes', () => {
    const { urls, errors } = parseImageCell(
      ' /images/products/a.webp | https://cdn.kenyonexpress.co.il/b.avif|/images/products/a.webp ',
    )
    expect(errors).toEqual([])
    expect(urls).toEqual(['/images/products/a.webp', 'https://cdn.kenyonexpress.co.il/b.avif'])
  })

  it('refuses a host next/image would throw on', () => {
    const r = row({ images: 'https://evil.example.com/x.jpg' })
    expect(r.data).toBeUndefined()
    expect(r.errors.join(' ')).toContain('תמונות')
  })

  it('refuses http', () => {
    expect(parseImageCell('http://cdn.kenyonexpress.co.il/x.webp').errors).toHaveLength(1)
  })

  it(`caps at ${MAX_IMPORT_IMAGES} images, the form's cap`, () => {
    const cell = Array.from({ length: MAX_IMPORT_IMAGES + 1 }, (_, i) => `/i/${i}.webp`).join('|')
    expect(parseImageCell(cell).errors.join(' ')).toContain(`עד ${MAX_IMPORT_IMAGES}`)
  })

  it('carries the urls on a valid row', () => {
    const r = row({ images: '/images/products/a.webp' })
    expect(r.errors).toEqual([])
    expect(r.images).toEqual(['/images/products/a.webp'])
  })
})

describe('S16 import: headers and template', () => {
  it('maps the Hebrew headers for the three new columns', () => {
    const m = mapHeaders(['slug', 'שם', 'מחיר', 'עמלה', 'משלוח', 'חלון ביטול', 'תמונות'])
    expect(m.keys.slice(4)).toEqual(['shipping_price_ils', 'cancellation_window_days', 'images'])
    expect(m.unknown).toEqual([])
  })

  it('keeps the template rows the width of the header', () => {
    const { rows } = parseCsv(buildTemplateCsv())
    for (const r of rows) expect(r).toHaveLength(IMPORT_COLUMNS.length)
  })

  it('template rows validate and carry their terms', () => {
    const { rows } = parseCsv(buildTemplateCsv())
    const records = toRecords(mapHeaders(rows[0] ?? []), rows.slice(1))
    const [physical, coupon] = records.map(validateImportRow)
    expect(physical?.errors).toEqual([])
    expect(physical?.terms.shippingPriceAgorot).toBe(2900)
    expect(coupon?.errors).toEqual([])
    expect(coupon?.terms.cancellationWindowDays).toBe(30)
  })
})
