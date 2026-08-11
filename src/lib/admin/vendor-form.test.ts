import { describe, expect, it } from 'vitest'
import { eligibleVendorProfiles, parseVendorForm } from './vendor-form'

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

// Minimal valid raw payload for creating a vendor.
function rawCreate(overrides: Record<string, unknown> = {}) {
  return {
    business_name: 'עסק לדוגמה',
    business_id: '123456789',
    contact_email: 'vendor@example.com',
    status: 'pending',
    ...overrides,
  }
}

describe('parseVendorForm', () => {
  // The original bug: /admin/suppliers/new never sent profile_id, so every
  // create failed. profile_id is NOT NULL, so creation must require it.
  it('rejects creation without a linked profile', () => {
    const result = parseVendorForm(rawCreate())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('יש לבחור משתמש לקישור הספק')
  })

  it('accepts creation when a profile is linked', () => {
    const result = parseVendorForm(rawCreate({ profile_id: UUID_A }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.profile_id).toBe(UUID_A)
      expect(result.data.business_name).toBe('עסק לדוגמה')
    }
  })

  it('allows updates (id present) without a profile_id, leaving it unchanged', () => {
    const result = parseVendorForm(rawCreate({ id: UUID_B }))
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid business name before checking the profile', () => {
    const result = parseVendorForm(rawCreate({ business_name: 'x', profile_id: UUID_A }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('שם עסק נדרש')
  })

  it('rejects an invalid contact email', () => {
    const result = parseVendorForm(rawCreate({ contact_email: 'not-an-email', profile_id: UUID_A }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('אימייל לא תקין')
  })

  // The dynamic-percentage rule (AGENTS.md): a percentage is per product, so a
  // supplier carries none at all. Until 2026-08-11 this schema had
  // `commission_rate: z.coerce.number().default(90)`, so a vendor saved without
  // touching the field took a 90% commission nobody chose. Measured before
  // removal, all six live vendors shared one rate (10.00) while their products
  // already carried three distinct rates of their own (30/25/15): the
  // supplier-level number was unused by settlement and wrong besides.
  describe('carries no commission percentage at all', () => {
    it('does not return a commission_rate even when one is submitted', () => {
      const result = parseVendorForm(rawCreate({ commission_rate: '90', profile_id: UUID_A }))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).not.toHaveProperty('commission_rate')
    })

    it('saves fine with no commission_rate in the payload', () => {
      // rawCreate no longer carries a rate at all, which is the point: a vendor
      // is now valid without one, where before the schema quietly supplied 90.
      const result = parseVendorForm(rawCreate({ profile_id: UUID_A }))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).not.toHaveProperty('commission_rate')
    })

    it('ignores a nonsense rate rather than validating it, since it is not a field', () => {
      const result = parseVendorForm(
        rawCreate({ commission_rate: 'not-a-number', profile_id: UUID_A }),
      )
      expect(result.ok).toBe(true)
    })
  })
})

describe('eligibleVendorProfiles', () => {
  const profiles = [
    { id: UUID_A, email: 'a@example.com', full_name: 'משתמש א' },
    { id: UUID_B, email: 'b@example.com', full_name: null },
  ]

  it('excludes profiles already linked to a vendor', () => {
    const result = eligibleVendorProfiles(profiles, [UUID_A])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe(UUID_B)
  })

  it('returns all profiles when none are linked', () => {
    expect(eligibleVendorProfiles(profiles, [])).toHaveLength(2)
  })
})
