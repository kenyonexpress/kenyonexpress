import { describe, expect, it } from 'vitest'
import {
  readCashbackPercent,
  readCity,
  readDimensionMm,
  readOriginalPriceSourceFields,
  readTags,
  readVatExempt,
} from './product-fields'

describe('readDimensionMm', () => {
  it('prefers the millimetre column', () => {
    expect(readDimensionMm({ length_mm: 250, length_cm: 99 }, 'length')).toBe(250)
  })

  it('converts a superseded centimetre value rather than dropping it', () => {
    // A row written before 112 must still show its real number in the form.
    // An empty box would silently discard the dimension on the next save.
    expect(readDimensionMm({ width_cm: 12.5 }, 'width')).toBe(125)
    expect(readDimensionMm({ height_cm: '30' }, 'height')).toBe(300)
  })

  it('treats zero and nonsense as absent, not as a dimension', () => {
    // 0mm is not a parcel; the DB CHECK refuses it, so the form must not offer
    // it back as if it were a stored value.
    expect(readDimensionMm({ length_mm: 0 }, 'length')).toBeNull()
    expect(readDimensionMm({ length_cm: 0 }, 'length')).toBeNull()
    expect(readDimensionMm({ length_mm: -5 }, 'length')).toBeNull()
    expect(readDimensionMm({ length_cm: 'abc' }, 'length')).toBeNull()
    expect(readDimensionMm({}, 'length')).toBeNull()
    expect(readDimensionMm(null, 'length')).toBeNull()
  })
})

describe('readVatExempt', () => {
  it('is false when the column is absent', () => {
    // The generated types predate 112. An unmigrated read must mean "VAT
    // applies", which is the ordinary Israeli case, never "exempt".
    expect(readVatExempt({})).toBe(false)
    expect(readVatExempt(null)).toBe(false)
  })

  it('is true only for a real true', () => {
    expect(readVatExempt({ vat_exempt: true })).toBe(true)
    expect(readVatExempt({ vat_exempt: 'true' })).toBe(false)
    expect(readVatExempt({ vat_exempt: 1 })).toBe(false)
  })
})

describe('readTags', () => {
  it('is always an array', () => {
    expect(readTags({ tags: ['מבצע', 'חורף'] })).toEqual(['מבצע', 'חורף'])
    expect(readTags({ tags: null })).toEqual([])
    expect(readTags({})).toEqual([])
    expect(readTags(null)).toEqual([])
  })

  it('drops blanks and non-strings rather than rendering them', () => {
    expect(readTags({ tags: ['מבצע', '', '  ', 7, null, 'מתנה'] })).toEqual(['מבצע', 'מתנה'])
  })
})

describe('readOriginalPriceSourceFields', () => {
  it('reads an absent column (242 not applied) as empty boxes', () => {
    expect(readOriginalPriceSourceFields({})).toEqual({ label: '', url: '' })
    expect(readOriginalPriceSourceFields(null)).toEqual({ label: '', url: '' })
  })

  it('shows what is stored', () => {
    expect(
      readOriginalPriceSourceFields({
        original_price_source: 'מחירון היצרן',
        original_price_source_url: 'https://example.com/list',
      }),
    ).toEqual({ label: 'מחירון היצרן', url: 'https://example.com/list' })
  })
})

describe('readCity', () => {
  it('is an empty box for NULL or absent, trimmed otherwise', () => {
    expect(readCity({})).toBe('')
    expect(readCity({ city: null })).toBe('')
    expect(readCity({ city: ' תל אביב ' })).toBe('תל אביב')
  })
})

describe('readCashbackPercent', () => {
  it('reads the production column as a percent, 0 when unset', () => {
    expect(readCashbackPercent({ cashback_percent: 5 })).toBe(5)
    expect(readCashbackPercent({ cashback_percent: 0 })).toBe(0)
    expect(readCashbackPercent({})).toBe(0)
    expect(readCashbackPercent(null)).toBe(0)
  })

  it('reads the 059 basis-point column back as a percent when a row carries it', () => {
    expect(readCashbackPercent({ cashback_bp: 250 })).toBe(2.5)
  })
})
