import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * Address book tests.
 *
 * These verify the schema validation and business logic for the address_book
 * table without requiring a database connection.
 */

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'מספר טלפון קצר מדי')
  .max(15, 'מספר טלפון ארוך מדי')
  .regex(/^\+?[0-9]{10,15}$/, 'מספר טלפון לא תקין')

const addressBookSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'יש להזין תווית').max(50, 'התווית ארוכה מדי'),
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(100, 'השם ארוך מדי'),
  phone: phoneSchema,
  street: z.string().trim().min(1, 'יש להזין כתובת').max(200, 'הכתובת ארוכה מדי'),
  city: z.string().trim().min(1, 'יש להזין עיר').max(100, 'העיר ארוכה מדי'),
  postal_code: z.string().trim().max(20).optional().nullable(),
  country: z.string().length(2).default('IL'),
  is_default: z.coerce.boolean().default(false),
})

describe('address_book schema validation', () => {
  it('accepts valid address with all fields', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
      postal_code: '1234567',
      country: 'IL',
      is_default: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.label).toBe('בית')
      expect(result.data.full_name).toBe('ישראל ישראלי')
      expect(result.data.phone).toBe('+972501234567')
      expect(result.data.is_default).toBe(true)
      expect(result.data.country).toBe('IL')
    }
  })

  it('accepts valid address with minimal fields', () => {
    const result = addressBookSchema.safeParse({
      label: 'עבודה',
      full_name: 'משה כהן',
      phone: '0501234567',
      street: 'דרך השלום 5',
      city: 'ירושלים',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.postal_code).toBeUndefined()
      expect(result.data.country).toBe('IL') // default
      expect(result.data.is_default).toBe(false) // default
    }
  })

  it('rejects empty label', () => {
    const result = addressBookSchema.safeParse({
      label: '',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('תווית')
    }
  })

  it('rejects label longer than 50 characters', () => {
    const result = addressBookSchema.safeParse({
      label: 'א'.repeat(51),
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('ארוכה מדי')
    }
  })

  it('rejects short full name', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'א',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid phone number', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '123', // too short
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
  })

  it('accepts phone with +972 prefix', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(true)
  })

  it('accepts phone without prefix', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '0501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(true)
  })

  it('rejects empty street', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: '',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
  })

  it('rejects empty city', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: '',
    })

    expect(result.success).toBe(false)
  })

  it('coerces string "true" to boolean true', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
      is_default: 'true',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_default).toBe(true)
    }
  })

  it('coerces string "false" to boolean false', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
      is_default: 'false',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_default).toBe(false)
    }
  })

  it('validates country code length', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
      country: 'ISR', // 3 chars, should be 2
    })

    expect(result.success).toBe(false)
  })

  it('accepts null postal_code', () => {
    const result = addressBookSchema.safeParse({
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
      postal_code: null,
    })

    expect(result.success).toBe(true)
  })

  it('accepts optional UUID id', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    const result = addressBookSchema.safeParse({
      id: uuid,
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(uuid)
    }
  })

  it('rejects invalid UUID id', () => {
    const result = addressBookSchema.safeParse({
      id: 'not-a-uuid',
      label: 'בית',
      full_name: 'ישראל ישראלי',
      phone: '+972501234567',
      street: 'רחוב הרצל 10',
      city: 'תל אביב',
    })

    expect(result.success).toBe(false)
  })
})
