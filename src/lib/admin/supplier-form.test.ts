import { describe, expect, it } from 'vitest'
import { REQUIRED_TO_PUBLISH, parseSupplierForm, supplierReadiness } from './supplier-form'

const VALID = {
  name: 'פלאפל הכרם',
  contact_phone: '050-1234567',
  address: 'הרצל 12, תל אביב',
  logo_url: 'https://cdn.example.com/logo.png',
}

describe('parseSupplierForm', () => {
  it('accepts a supplier carrying only a name', () => {
    // All eleven live suppliers are missing an address and a logo. If saving
    // required them, an admin could not correct a phone number without also
    // sourcing a logo first.
    const result = parseSupplierForm({ name: 'ספק חדש' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.name).toBe('ספק חדש')
    expect(result.data.address).toBeNull()
    expect(result.data.logo_url).toBeNull()
    expect(result.data.status).toBe('active')
  })

  it('rejects a missing or too-short name', () => {
    expect(parseSupplierForm({}).ok).toBe(false)
    expect(parseSupplierForm({ name: '   ' }).ok).toBe(false)
    expect(parseSupplierForm({ name: 'א' }).ok).toBe(false)
  })

  it('trims and nulls blank optional fields rather than storing empty strings', () => {
    // A stored '' would read as present to supplierReadiness and let a product
    // publish with a blank Waze link.
    const result = parseSupplierForm({ name: '  ספק  ', address: '   ', city: '' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.name).toBe('ספק')
    expect(result.data.address).toBeNull()
    expect(result.data.city).toBeNull()
  })

  it('accepts the phone shapes Israeli suppliers actually enter', () => {
    for (const phone of ['0501234567', '050-123-4567', '+972 50 123 4567', '(03) 555-1234']) {
      const result = parseSupplierForm({ ...VALID, contact_phone: phone })
      expect(result.ok, phone).toBe(true)
    }
  })

  it('rejects a phone that is not a phone', () => {
    expect(parseSupplierForm({ ...VALID, contact_phone: 'call me' }).ok).toBe(false)
    expect(parseSupplierForm({ ...VALID, contact_phone: '123' }).ok).toBe(false)
  })

  it('rejects a website or logo that is not an absolute http url', () => {
    expect(parseSupplierForm({ ...VALID, website: 'example.com' }).ok).toBe(false)
    expect(parseSupplierForm({ ...VALID, logo_url: '/uploads/logo.png' }).ok).toBe(false)
    expect(parseSupplierForm({ ...VALID, website: 'https://example.com' }).ok).toBe(true)
  })

  it('rejects a malformed email', () => {
    expect(parseSupplierForm({ ...VALID, contact_email: 'nope' }).ok).toBe(false)
    expect(parseSupplierForm({ ...VALID, contact_email: 'a@b.co' }).ok).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(parseSupplierForm({ ...VALID, status: 'suspended' }).ok).toBe(false)
    expect(parseSupplierForm({ ...VALID, status: 'inactive' }).ok).toBe(true)
  })

  it('rejects a malformed id', () => {
    expect(parseSupplierForm({ ...VALID, id: 'not-a-uuid' }).ok).toBe(false)
  })

  it('never emits the retired supplier-level commission knobs', () => {
    // commission_percent and default_split_percent are leftovers from the fixed
    // commission model. Writing them from this form would give an admin a second
    // place to set a split that only products own.
    const result = parseSupplierForm({
      ...VALID,
      commission_percent: 42,
      default_split_percent: 55,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.data)).not.toContain('commission_percent')
    expect(Object.keys(result.data)).not.toContain('default_split_percent')
  })
})

describe('supplierReadiness', () => {
  it('is ready only when all four fields are present and the supplier is active', () => {
    expect(supplierReadiness({ ...VALID, status: 'active' }).ready).toBe(true)
  })

  it('is not ready when the supplier is inactive even with every field filled', () => {
    const readiness = supplierReadiness({ ...VALID, status: 'inactive' })
    expect(readiness.ready).toBe(false)
    expect(readiness.missing).toEqual([])
  })

  it('names every missing field at once, not just the first', () => {
    const readiness = supplierReadiness({ name: 'ספק', status: 'active' })
    expect(readiness.ready).toBe(false)
    expect(readiness.missing).toEqual(['contact_phone', 'address', 'logo_url'])
    expect(readiness.missingLabels).toEqual(['טלפון', 'כתובת', 'לוגו'])
  })

  it('treats whitespace as missing', () => {
    const readiness = supplierReadiness({ ...VALID, address: '   ', status: 'active' })
    expect(readiness.missing).toEqual(['address'])
  })

  it('matches the live catalog shape: address and logo missing on every supplier', () => {
    // Measured 2026-07-28: 11 of 11 suppliers have no address and no logo.
    const live = { name: 'ספק חי', contact_phone: '0501234567', status: 'active' }
    expect(supplierReadiness(live).missing).toEqual(['address', 'logo_url'])
  })

  it('keeps the required set to the four fields the product page renders', () => {
    expect(REQUIRED_TO_PUBLISH).toEqual(['name', 'contact_phone', 'address', 'logo_url'])
  })
})
