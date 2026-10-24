import { describe, expect, it } from 'vitest'
import { mapCsvToForms, parseCsv, previewRow } from './product-csv'
import { parseLogisticsFields } from './product-logistics-fields'

const HEADER =
  'slug,name_he,type,kenyon_price,cancellation_window_days,payout_cadence_days,shipping_price_agorot,city,full_address,lat,lng'

const FIVE_ROWS = [
  HEADER,
  'p-one,מוצר א,physical,100.00,14,7,2500,חיפה,הרצל 1,32.79,34.98',
  'p-two,מוצר ב,physical,50,0,14,0,תל אביב,"דיזנגוף 10, קומה 2",32.08,34.78',
  'p-three,מוצר ג,coupon,30.50,365,30,,ירושלים,,31.77,35.21',
  'p-four,מוצר ד,physical,10,,,990,,,,',
  'p-five,מוצר ה,physical,20,7,7,1500,באר שבע,רגר 5,,',
].join('\n')

describe('F06 CSV import with migration 185/187/278 columns (5 rows)', () => {
  const mapped = mapCsvToForms(parseCsv(FIVE_ROWS))

  it('maps all five rows as drafts with no unknown columns', () => {
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return
    expect(mapped.unknownColumns).toEqual([])
    expect(mapped.rows).toHaveLength(5)
    for (const r of mapped.rows) {
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.form.get('status')).toBe('draft')
    }
  })

  it('carries logistics fields as integers and cadence names', () => {
    if (!mapped.ok) throw new Error('map failed')
    const [r1, r2, , r4] = mapped.rows
    if (!r1?.ok || !r2?.ok || !r4?.ok) throw new Error('row failed')
    expect(parseLogisticsFields(r1.form)).toEqual({
      ok: true,
      fields: {
        cancellation_window_days: 14,
        payout_cadence: 'weekly',
        full_address: 'הרצל 1',
        shipping_price_agorot: 2500,
      },
    })
    expect(parseLogisticsFields(r2.form)).toMatchObject({
      ok: true,
      fields: { cancellation_window_days: 0, payout_cadence: 'biweekly', shipping_price_agorot: 0 },
    })
    // Blank cells are omitted, so nothing is written to those columns.
    expect(parseLogisticsFields(r4.form)).toEqual({
      ok: true,
      fields: { shipping_price_agorot: 990 },
    })
  })

  it('maps lat/lng to latitude/longitude and previews the new fields', () => {
    if (!mapped.ok) throw new Error('map failed')
    const r1 = mapped.rows[0]
    if (!r1?.ok) throw new Error('row failed')
    expect(r1.form.get('latitude')).toBe('32.79')
    expect(r1.form.get('longitude')).toBe('34.98')
    expect(previewRow(r1.form)).toMatchObject({
      shipping_price_agorot: '2500',
      cancellation_window_days: '14',
      payout_cadence: 'weekly',
    })
  })

  it('rejects bad values per row with the line number', () => {
    const bad = mapCsvToForms(
      parseCsv(
        [
          HEADER,
          'a,א,physical,1,400,7,100,,,,',
          'b,ב,physical,1,5,9,100,,,,',
          'c,ג,physical,1,5,7,12.5,,,,',
          'd,ד,physical,1,5,7,100,,,32,',
        ].join('\n'),
      ),
    )
    if (!bad.ok) throw new Error('map failed')
    expect(bad.rows.map((r) => r.ok)).toEqual([false, false, false, false])
    expect(bad.rows.map((r) => r.line)).toEqual([2, 3, 4, 5])
  })
})
