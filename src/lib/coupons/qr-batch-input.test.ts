import { describe, expect, it } from 'vitest'
import { parseQrBatchInput } from './qr-batch-input'

const CAMPAIGN = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-09-17T10:00:00.000Z')

const base = { campaign_id: CAMPAIGN, label: 'פליירים ספטמבר', quantity: '12' }

describe('parseQrBatchInput', () => {
  it('accepts a batch with no deadline and stores NULL, not an empty string', () => {
    const result = parseQrBatchInput({ ...base, expires_at: '' }, NOW)
    expect(result).toEqual({
      ok: true,
      value: { campaign_id: CAMPAIGN, label: 'פליירים ספטמבר', quantity: 12, expires_at: null },
    })
    // A form that omits the field entirely (older client) is the same answer.
    expect(parseQrBatchInput(base, NOW).ok).toBe(true)
  })

  it('resolves a datetime-local deadline to an ISO instant', () => {
    const result = parseQrBatchInput({ ...base, expires_at: '2026-09-30T23:59' }, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.expires_at).toMatch(/^2026-(09-30|10-01)T\d{2}:\d{2}:00\.000Z$/)
    expect(new Date(result.value.expires_at as string).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('refuses a deadline that is already past, or unparseable', () => {
    expect(parseQrBatchInput({ ...base, expires_at: '2026-09-17T09:00:00.000Z' }, NOW)).toEqual({
      ok: false,
      fieldErrors: { expires_at: ['תאריך התוקף חייב להיות בעתיד'] },
    })
    expect(parseQrBatchInput({ ...base, expires_at: 'מחר' }, NOW)).toEqual({
      ok: false,
      fieldErrors: { expires_at: ['תאריך התוקף אינו תקין'] },
    })
  })

  it('keeps the quantity ceiling the DB CHECK carries and reports it as a field error', () => {
    const result = parseQrBatchInput({ ...base, quantity: '1001' }, NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.quantity).toEqual(['עד 1000 קודים בקבוצה'])
  })

  it('reports a missing label and a bad campaign id together', () => {
    const result = parseQrBatchInput({ campaign_id: 'x', label: '  ', quantity: '3' }, NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['campaign_id', 'label'])
  })
})
