import { describe, expect, it } from 'vitest'
import { SUPPLIER_EDITABLE_FIELDS, parseSupplierProfileForm } from './profile-form'

describe('parseSupplierProfileForm', () => {
  it('returns only the whitelisted columns, whatever the caller posted', () => {
    // The whitelist is the policy: the service role writes this object, so a
    // field that survives parsing reaches `suppliers` with RLS out of the way.
    const parsed = parseSupplierProfileForm({
      contact_name: 'דנה',
      status: 'active',
      name: 'עסק אחר',
      business_id: '515151515',
      notes: 'הערה פנימית',
      min_payout_ils: '0',
      commission_percent: '0',
      id: 'some-uuid',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(Object.keys(parsed.data).sort()).toEqual([...SUPPLIER_EDITABLE_FIELDS].sort())
    for (const forbidden of ['status', 'name', 'business_id', 'notes', 'min_payout_ils', 'id']) {
      expect(parsed.data).not.toHaveProperty(forbidden)
    }
  })

  it('accepts a form where everything is empty', () => {
    const parsed = parseSupplierProfileForm({})
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(Object.values(parsed.data).every((v) => v === null)).toBe(true)
  })

  it('trims and nulls a whitespace-only field rather than storing a blank', () => {
    const parsed = parseSupplierProfileForm({ contact_name: '   ', city: '  חיפה  ' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.contact_name).toBeNull()
    expect(parsed.data.city).toBe('חיפה')
  })

  it('names the field that failed, so the form can point at it', () => {
    expect(parseSupplierProfileForm({ contact_phone: 'לא טלפון' })).toEqual({
      ok: false,
      field: 'contact_phone',
      error: 'מספר טלפון לא תקין',
    })
    expect(parseSupplierProfileForm({ contact_email: 'dana@' })).toMatchObject({
      ok: false,
      field: 'contact_email',
    })
    expect(parseSupplierProfileForm({ website: 'example.co.il' })).toMatchObject({
      ok: false,
      field: 'website',
    })
    expect(parseSupplierProfileForm({ logo_url: '/images/logo.png' })).toMatchObject({
      ok: false,
      field: 'logo_url',
    })
  })

  it('takes the Israeli phone shapes the admin form takes', () => {
    for (const phone of ['0501234567', '050-123-4567', '+972 50 123 4567', '(03) 555-1234']) {
      expect(parseSupplierProfileForm({ contact_phone: phone }).ok).toBe(true)
    }
  })
})
