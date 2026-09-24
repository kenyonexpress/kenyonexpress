import { describe, expect, it } from 'vitest'
import {
  isoToLocalDateTime,
  localDateTimeToIso,
  parseCampaignForm,
  pickCampaign,
} from './affiliate-campaigns'

function form(values: Record<string, string>): Pick<FormData, 'get'> {
  return { get: (key: string) => values[key] ?? null }
}

const GOOD = {
  name: 'קיץ 2026',
  commission_bp: '12.5',
  min_order_agorot: '50',
  max_commission_agorot: '',
  budget_agorot: '1000',
  max_conversions_per_day: '10',
  require_manual_approval: '',
  starts_at: '2026-07-01T00:00',
  ends_at: '2026-08-31T23:59',
  is_active: 'on',
  category_id: '',
  product_id: '',
}

describe('parseCampaignForm', () => {
  it('turns shekels into integer agorot and a percent into basis points', () => {
    const parsed = parseCampaignForm(form(GOOD))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.commission_bp).toBe(1250)
    expect(parsed.value.min_order_agorot).toBe(5_000)
    expect(parsed.value.budget_agorot).toBe(100_000)
    expect(parsed.value.max_commission_agorot).toBeNull()
    expect(parsed.value.max_conversions_per_day).toBe(10)
    expect(parsed.value.require_manual_approval).toBe(false)
    expect(parsed.value.is_active).toBe(true)
    expect(parsed.value.starts_at).toBe('2026-07-01T00:00:00+03:00')
    expect(parsed.value.ends_at).toBe('2026-08-31T23:59:00+03:00')
    expect(parsed.value.category_id).toBeNull()
  })

  it('refuses a commission over 50% with the field named', () => {
    const parsed = parseCampaignForm(form({ ...GOOD, commission_bp: '51' }))
    expect(parsed).toEqual({ ok: false, error: 'עמלה (%): עמלה: עד 50%' })
  })

  it('refuses a bad shekel amount before the schema runs', () => {
    const parsed = parseCampaignForm(form({ ...GOOD, budget_agorot: 'abc' }))
    expect(parsed).toEqual({ ok: false, error: 'תקציב כולל (₪, ריק = ללא): סכום לא תקין' })
  })

  it('refuses an end before the start and a scope on both product and category', () => {
    expect(parseCampaignForm(form({ ...GOOD, ends_at: '2026-06-01T00:00' }))).toMatchObject({
      ok: false,
    })
    expect(
      parseCampaignForm(
        form({
          ...GOOD,
          category_id: '123e4567-e89b-12d3-a456-426614174000',
          product_id: '123e4567-e89b-12d3-a456-426614174001',
        }),
      ),
    ).toMatchObject({ ok: false })
  })

  it('defaults the per-day cap to 20 and an empty end to null', () => {
    const parsed = parseCampaignForm(form({ ...GOOD, max_conversions_per_day: '', ends_at: '' }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.max_conversions_per_day).toBe(20)
    expect(parsed.value.ends_at).toBeNull()
  })
})

describe('Israel local time round trip', () => {
  it('uses +02:00 in winter and +03:00 in summer', () => {
    expect(localDateTimeToIso('2026-01-15T10:00')).toBe('2026-01-15T10:00:00+02:00')
    expect(localDateTimeToIso('2026-07-15T10:00')).toBe('2026-07-15T10:00:00+03:00')
  })

  it('reads an ISO instant back as the same local wall-clock', () => {
    expect(isoToLocalDateTime('2026-07-15T07:00:00Z')).toBe('2026-07-15T10:00')
    expect(isoToLocalDateTime('2026-01-15T08:00:00Z')).toBe('2026-01-15T10:00')
    expect(isoToLocalDateTime(null)).toBe('')
  })
})

describe('pickCampaign', () => {
  it('keeps only the form-owned fields for the audit diff', () => {
    expect(
      pickCampaign({ name: 'x', commission_bp: 100, id: 'ignored', created_at: 'ignored' }),
    ).toEqual({
      name: 'x',
      commission_bp: 100,
      min_order_agorot: null,
      max_commission_agorot: null,
      budget_agorot: null,
      max_conversions_per_day: null,
      require_manual_approval: null,
      starts_at: null,
      ends_at: null,
      is_active: null,
      category_id: null,
      product_id: null,
    })
    expect(pickCampaign(null)).toBeNull()
  })
})
