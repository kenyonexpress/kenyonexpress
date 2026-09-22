import { describe, expect, it } from 'vitest'
import { invoiceSettingsSchema } from './account'

describe('invoiceSettingsSchema', () => {
  it('accepts the toggle off with nothing else filled in', () => {
    const result = invoiceSettingsSchema.safeParse({
      invoice_to_business: false,
      business_name: '',
      business_registration_number: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts the toggle on with both fields filled in', () => {
    const result = invoiceSettingsSchema.safeParse({
      invoice_to_business: true,
      business_name: 'חברת דוגמה בע"מ',
      business_registration_number: '123456789',
    })
    expect(result.success).toBe(true)
  })

  it('rejects the toggle on with a missing business name', () => {
    const result = invoiceSettingsSchema.safeParse({
      invoice_to_business: true,
      business_name: '',
      business_registration_number: '123456789',
    })
    expect(result.success).toBe(false)
  })

  it('rejects the toggle on with a missing registration number', () => {
    const result = invoiceSettingsSchema.safeParse({
      invoice_to_business: true,
      business_name: 'חברת דוגמה בע"מ',
      business_registration_number: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a registration number that is not nine digits', () => {
    for (const bad of ['12345', '12345678901', 'abcdefghi']) {
      const result = invoiceSettingsSchema.safeParse({
        invoice_to_business: true,
        business_name: 'חברת דוגמה בע"מ',
        business_registration_number: bad,
      })
      expect(result.success, bad).toBe(false)
    }
  })

  it('does not require a registration number format when the toggle is off', () => {
    const result = invoiceSettingsSchema.safeParse({
      invoice_to_business: false,
      business_name: 'טיוטה שלא נשמרה',
      business_registration_number: '',
    })
    expect(result.success).toBe(true)
  })
})
