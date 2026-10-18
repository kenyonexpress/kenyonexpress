import { describe, expect, it } from 'vitest'
import { cadenceFromDays, parseLogisticsFields } from './product-logistics-fields'

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

describe('parseLogisticsFields', () => {
  it('writes nothing for a form that never mentions the columns', () => {
    expect(parseLogisticsFields(form({ name_he: 'x' }))).toEqual({ ok: true, fields: {} })
  })

  it('parses every column it is given', () => {
    const r = parseLogisticsFields(
      form({
        cancellation_window_days: '30',
        payout_cadence: 'monthly',
        full_address: 'הרצל 1, תל אביב',
        shipping_price_agorot: '2990',
      }),
    )
    expect(r).toEqual({
      ok: true,
      fields: {
        cancellation_window_days: 30,
        payout_cadence: 'monthly',
        full_address: 'הרצל 1, תל אביב',
        shipping_price_agorot: 2990,
      },
    })
  })

  it('clears a column sent explicitly empty', () => {
    expect(parseLogisticsFields(form({ shipping_price_agorot: '' }))).toEqual({
      ok: true,
      fields: { shipping_price_agorot: null },
    })
  })

  it('refuses a shekel float for the agorot price, and out-of-range windows', () => {
    expect(parseLogisticsFields(form({ shipping_price_agorot: '29.90' })).ok).toBe(false)
    expect(parseLogisticsFields(form({ cancellation_window_days: '400' })).ok).toBe(false)
    expect(parseLogisticsFields(form({ payout_cadence: 'daily' })).ok).toBe(false)
  })
})

describe('cadenceFromDays', () => {
  it('maps only the three supported periods', () => {
    expect(cadenceFromDays('7')).toBe('weekly')
    expect(cadenceFromDays('14')).toBe('biweekly')
    expect(cadenceFromDays('30')).toBe('monthly')
    expect(cadenceFromDays('10')).toBeNull()
  })
})
