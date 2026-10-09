import { describe, expect, it } from 'vitest'
import {
  buildErrorReportCsv,
  buildTemplateCsv,
  buildUpsertUpdateFields,
  mapHeaders,
  markInFileDuplicates,
  toRecords,
  validateImportRow,
} from './import-rows'
import { parseCsv } from './parse-csv'

const goodRecord = {
  slug: 'test-product',
  name_he: 'מוצר בדיקה',
  kenyon_price: '199.90',
  platform_percent: '30',
}

describe('mapHeaders', () => {
  it('maps English canonical headers', () => {
    const m = mapHeaders(['slug', 'name_he', 'kenyon_price', 'platform_percent'])
    expect(m.keys).toEqual(['slug', 'name_he', 'kenyon_price', 'platform_percent'])
    expect(m.missing).toEqual([])
    expect(m.unknown).toEqual([])
  })

  it('maps Hebrew aliases, ignoring case, spacing and a BOM', () => {
    const m = mapHeaders(['﻿קישור', ' שם מוצר ', 'מחיר בקניון', 'עמלת פלטפורמה', 'מק"ט'])
    expect(m.keys).toEqual(['slug', 'name_he', 'kenyon_price', 'platform_percent', 'sku'])
    expect(m.missing).toEqual([])
  })

  it('reports unknown headers and missing required columns', () => {
    const m = mapHeaders(['slug', 'צבע מועדף'])
    expect(m.unknown).toEqual(['צבע מועדף'])
    expect(m.missing).toEqual(['name_he', 'kenyon_price', 'platform_percent'])
  })

  it('nulls a duplicate header instead of overwriting the first column', () => {
    const m = mapHeaders(['slug', 'slug'])
    expect(m.keys).toEqual(['slug', null])
  })

  it('maps every template header, so the template round-trips', () => {
    const { rows } = parseCsv(buildTemplateCsv())
    const m = mapHeaders(rows[0] ?? [])
    expect(m.unknown).toEqual([])
    expect(m.missing).toEqual([])
  })
})

describe('toRecords', () => {
  it('trims values, drops empties, and numbers lines from 2', () => {
    const mapping = mapHeaders(['slug', 'name_he'])
    const rows = toRecords(mapping, [
      [' a ', ''],
      ['b', 'שם'],
    ])
    expect(rows).toEqual([
      { line: 2, record: { slug: 'a' } },
      { line: 3, record: { slug: 'b', name_he: 'שם' } },
    ])
  })

  it('skips all-empty rows but keeps line numbers true to the file', () => {
    // The xlsx parser returns blank Excel rows as empty arrays so indexes stay
    // aligned with what the admin sees; those rows must not become errors.
    const mapping = mapHeaders(['slug', 'name_he'])
    const rows = toRecords(mapping, [['a', 'x'], [], ['', '  '], ['b', 'y']])
    expect(rows).toEqual([
      { line: 2, record: { slug: 'a', name_he: 'x' } },
      { line: 5, record: { slug: 'b', name_he: 'y' } },
    ])
  })
})

describe('buildUpsertUpdateFields', () => {
  it('rewrites money as a unit but other columns only when present in the file', () => {
    const row = validateImportRow({
      line: 2,
      record: { ...goodRecord, sku: 'SKU-9', tags: 'חדש, מבצע' },
    })
    const fields = buildUpsertUpdateFields(row)
    expect(fields).not.toBeNull()
    // Money sources and the derived write, exactly like the insert path.
    expect(fields?.kenyon_price).toBe(199.9)
    expect(fields?.platform_percent).toBe(30)
    expect(fields?.price_ils).toBe(199.9)
    // Present columns update...
    expect(fields?.name_he).toBe('מוצר בדיקה')
    expect(fields?.sku).toBe('SKU-9')
    expect(fields?.tags).toEqual(['חדש', 'מבצע'])
    // ...absent ones do not, and the untouchables are never written.
    expect(fields).not.toHaveProperty('name_en')
    expect(fields).not.toHaveProperty('description_he')
    expect(fields).not.toHaveProperty('status')
    expect(fields).not.toHaveProperty('images')
    expect(fields).not.toHaveProperty('type')
    expect(fields).not.toHaveProperty('supplier_id')
    expect(fields).not.toHaveProperty('created_by')
  })

  it('returns null for a row that failed validation', () => {
    const row = validateImportRow({ line: 2, record: { slug: 'only-a-slug' } })
    expect(row.errors.length).toBeGreaterThan(0)
    expect(buildUpsertUpdateFields(row)).toBeNull()
  })
})

describe('validateImportRow', () => {
  it('accepts a minimal physical row, defaulting type and completing the split', () => {
    const row = validateImportRow({ line: 2, record: { ...goodRecord } })
    expect(row.errors).toEqual([])
    expect(row.data?.type).toBe('physical')
    expect(row.data?.status).toBe('draft')
    expect(row.money?.platform_percent).toBe(30)
    expect(row.money?.supplier_split_percent).toBe(70)
    expect(row.money?.price_ils).toBe(199.9)
  })

  it('lowercases the slug and rejects an invalid one in Hebrew', () => {
    const upper = validateImportRow({ line: 2, record: { ...goodRecord, slug: 'Test-Product' } })
    expect(upper.errors).toEqual([])
    expect(upper.data?.slug).toBe('test-product')

    const bad = validateImportRow({ line: 2, record: { ...goodRecord, slug: 'עברית' } })
    expect(bad.errors.some((e) => e.includes('קישור'))).toBe(true)
    expect(bad.data).toBeUndefined()
  })

  it('names the missing required column in Hebrew instead of zod\'s "Required"', () => {
    const row = validateImportRow({ line: 2, record: { slug: 'x-y', name_he: 'שם תקין' } })
    expect(row.errors.some((e) => e.includes('מחיר בקניון') && e.includes('חסר'))).toBe(true)
    expect(row.errors.some((e) => e === 'Required' || e.includes('Required'))).toBe(false)
  })

  it('accepts Hebrew type aliases and rejects unknown types', () => {
    const coupon = validateImportRow({
      line: 2,
      record: { ...goodRecord, type: 'קופון', coupon_price_ils: '50', coupon_expiry_days: '60' },
    })
    expect(coupon.errors).toEqual([])
    expect(coupon.data?.type).toBe('coupon')

    const recurring = validateImportRow({ line: 2, record: { ...goodRecord, type: 'recurring' } })
    expect(recurring.errors.some((e) => e.includes('סוג מוצר לא מוכר'))).toBe(true)
  })

  it('requires coupon expiry days on a coupon row (C7)', () => {
    const row = validateImportRow({
      line: 2,
      record: { ...goodRecord, type: 'coupon', coupon_price_ils: '50' },
    })
    expect(row.errors.some((e) => e.includes('תוקף קופון'))).toBe(true)
  })

  it('derives the coupon discount instead of trusting the file (no quote-vs-charge split)', () => {
    const row = validateImportRow({
      line: 2,
      record: {
        ...goodRecord,
        kenyon_price: '100',
        type: 'coupon',
        coupon_price_ils: '25',
        coupon_expiry_days: '30',
        discount_percent: '99',
      },
    })
    expect(row.errors).toEqual([])
    expect(row.money?.discount_percent).toBe(75)
  })

  it('rejects a split pair that does not sum to 100', () => {
    const row = validateImportRow({
      line: 2,
      record: { ...goodRecord, supplier_split_percent: '80' },
    })
    expect(row.errors.some((e) => e.includes('100'))).toBe(true)
  })

  it('rejects a full price below the kenyon price', () => {
    const row = validateImportRow({ line: 2, record: { ...goodRecord, full_price: '10' } })
    expect(row.errors.some((e) => e.includes('מחיר מלא'))).toBe(true)
  })

  it('splits and dedupes tags', () => {
    const row = validateImportRow({
      line: 2,
      record: { ...goodRecord, tags: 'חדש, מבצע ,חדש,' },
    })
    expect(row.data?.tags).toEqual(['חדש', 'מבצע'])
  })

  it('treats a zero price as missing, not free', () => {
    const row = validateImportRow({ line: 2, record: { ...goodRecord, kenyon_price: '0' } })
    expect(row.errors.length).toBeGreaterThan(0)
    expect(row.data).toBeUndefined()
  })
})

describe('markInFileDuplicates', () => {
  it('flags a repeated slug or sku against the line that used it first', () => {
    const rows = markInFileDuplicates(
      [
        { line: 2, record: { ...goodRecord, sku: 'S-1' } },
        { line: 3, record: { ...goodRecord, slug: 'other', sku: 'S-1' } },
        { line: 4, record: { ...goodRecord } },
      ].map(validateImportRow),
    )
    expect(rows[0]?.errors).toEqual([])
    expect(rows[1]?.errors.some((e) => e.includes('מק"ט כפול') && e.includes('2'))).toBe(true)
    expect(rows[2]?.errors.some((e) => e.includes('כפול') && e.includes('2'))).toBe(true)
    // A duplicate must not stay importable.
    expect(rows[1]?.data).toBeUndefined()
    expect(rows[2]?.data).toBeUndefined()
  })
})

describe('buildTemplateCsv', () => {
  it('produces two example rows that validate cleanly', () => {
    const { rows, errors } = parseCsv(buildTemplateCsv())
    expect(errors).toEqual([])
    const mapping = mapHeaders(rows[0] ?? [])
    const validated = toRecords(mapping, rows.slice(1)).map(validateImportRow)
    expect(validated).toHaveLength(2)
    for (const row of validated) expect(row.errors).toEqual([])
  })
})

describe('buildErrorReportCsv', () => {
  it('starts with a BOM for Excel and escapes the error text', () => {
    const csv = buildErrorReportCsv([
      { line: 2, slug: 'a-b', name: 'שם, עם פסיק', errors: ['שגיאה אחת', 'שגיאה "שנייה"'] },
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"שם, עם פסיק"')
    expect(csv).toContain('שגיאה אחת | שגיאה ""שנייה""')
    const reparsed = parseCsv(csv)
    expect(reparsed.rows[1]?.[3]).toBe('שגיאה אחת | שגיאה "שנייה"')
  })
})
