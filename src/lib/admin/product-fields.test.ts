import { describe, expect, it } from 'vitest'
import { readDimensionMm, readTags, readVatExempt } from './product-fields'

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
