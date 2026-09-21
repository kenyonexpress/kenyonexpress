import { describe, expect, it } from 'vitest'
import { parseReferralSettingsForm, pickSettings } from './referral-settings'

function form(entries: Record<string, string>): Pick<FormData, 'get'> {
  return { get: (key: string) => entries[key] ?? null }
}

const good = {
  is_active: 'on',
  referrer_bonus_agorot: '20',
  referred_bonus_agorot: '10.50',
  min_order_agorot: '100',
  qualify_window_days: '30',
  max_per_referrer_month: '5',
  max_per_referrer_year: '30',
}

describe('parseReferralSettingsForm', () => {
  it('turns shekel text into agorot integers and checkboxes into booleans', () => {
    const result = parseReferralSettingsForm(form(good))
    expect(result).toEqual({
      ok: true,
      value: {
        is_active: true,
        referrer_bonus_agorot: 2000,
        referred_bonus_agorot: 1050,
        min_order_agorot: 10_000,
        qualify_window_days: 30,
        max_per_referrer_month: 5,
        max_per_referrer_year: 30,
        require_manual_approval: false,
      },
    })
  })

  it('names the field in every error', () => {
    expect(parseReferralSettingsForm(form({ ...good, referred_bonus_agorot: 'abc' }))).toEqual({
      ok: false,
      error: 'בונוס למופנה (₪): סכום לא תקין',
    })
    const window = parseReferralSettingsForm(form({ ...good, qualify_window_days: '0' }))
    expect(window.ok).toBe(false)
    if (!window.ok) expect(window.error).toContain('חלון זכאות')
    const year = parseReferralSettingsForm(form({ ...good, max_per_referrer_year: '2' }))
    expect(year.ok).toBe(false)
    if (!year.ok) expect(year.error).toContain('השנתית')
  })

  it('mirrors the table CHECK: a cap of zero is refused before it reaches Postgres', () => {
    expect(parseReferralSettingsForm(form({ ...good, max_per_referrer_month: '0' })).ok).toBe(false)
    expect(parseReferralSettingsForm(form({ ...good, max_per_referrer_year: '0' })).ok).toBe(false)
  })

  it('refuses a bonus above ten thousand shekels', () => {
    expect(parseReferralSettingsForm(form({ ...good, referrer_bonus_agorot: '10000.01' })).ok).toBe(
      false,
    )
  })
})

describe('pickSettings', () => {
  it('keeps only the editable fields, for a diff that does not show updated_at', () => {
    expect(
      pickSettings({ id: true, is_active: true, updated_at: 'x', referrer_bonus_agorot: 5 }),
    ).toEqual({
      is_active: true,
      referrer_bonus_agorot: 5,
      referred_bonus_agorot: null,
      min_order_agorot: null,
      qualify_window_days: null,
      max_per_referrer_month: null,
      max_per_referrer_year: null,
      require_manual_approval: null,
    })
    expect(pickSettings(null)).toBeNull()
  })
})
