import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * Tests for product location actions (single and batch updates).
 * These are schema-only tests since the actual server actions use redirect()
 * which makes them difficult to unit test. Integration tests should verify
 * the full flow.
 */

const locationSchema = z.object({
  id: z.string().uuid(),
  city: z.string().trim().min(2).max(60),
  full_address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? null : v)),
})

const batchLocationSchema = z.object({
  ids: z
    .string()
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
  city: z.string().trim().min(2).max(60),
  full_address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? null : v)),
})

describe('locationSchema', () => {
  it('accepts valid single product location data', () => {
    const result = locationSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      city: 'תל אביב',
      full_address: 'רחוב הרצל 1',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.city).toBe('תל אביב')
      expect(result.data.full_address).toBe('רחוב הרצל 1')
    }
  })

  it('transforms empty address to null', () => {
    const result = locationSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      city: 'ירושלים',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.full_address).toBeNull()
    }
  })

  it('trims whitespace from city', () => {
    const result = locationSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      city: '  חיפה  ',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.city).toBe('חיפה')
    }
  })

  it('rejects city shorter than 2 chars', () => {
    const result = locationSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      city: 'א',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects city longer than 60 chars', () => {
    const result = locationSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      city: 'א'.repeat(61),
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUID', () => {
    const result = locationSchema.safeParse({
      id: 'not-a-uuid',
      city: 'באר שבע',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('batchLocationSchema', () => {
  it('accepts valid batch location data with multiple IDs', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000,660e8400-e29b-41d4-a716-446655440001',
      city: 'אילת',
      full_address: 'שדרות הפלמ"ח 10',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ids).toHaveLength(2)
      expect(result.data.ids[0]).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(result.data.ids[1]).toBe('660e8400-e29b-41d4-a716-446655440001')
      expect(result.data.city).toBe('אילת')
      expect(result.data.full_address).toBe('שדרות הפלמ"ח 10')
    }
  })

  it('accepts single ID in batch', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000',
      city: 'הרצליה',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ids).toHaveLength(1)
      expect(result.data.full_address).toBeNull()
    }
  })

  it('filters out empty ID strings', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000,,660e8400-e29b-41d4-a716-446655440001,',
      city: 'נתניה',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ids).toHaveLength(2)
    }
  })

  it('rejects empty IDs list', () => {
    const result = batchLocationSchema.safeParse({
      ids: '',
      city: 'ראשון לציון',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects IDs list with only commas', () => {
    const result = batchLocationSchema.safeParse({
      ids: ',,,',
      city: 'פתח תקווה',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 100 IDs', () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `550e840${i.toString().padStart(1, '0')}-e29b-41d4-a716-446655440000`,
    ).join(',')
    const result = batchLocationSchema.safeParse({
      ids,
      city: 'אשדוד',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid UUIDs in batch', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000,not-a-uuid',
      city: 'כפר סבא',
      full_address: '',
    })
    expect(result.success).toBe(false)
  })

  it('transforms empty address to null', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000',
      city: 'רמת גן',
      full_address: '   ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.full_address).toBeNull()
    }
  })

  it('trims whitespace from city and address', () => {
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000',
      city: '  טבריה  ',
      full_address: '  כיכר השעון 5  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.city).toBe('טבריה')
      expect(result.data.full_address).toBe('כיכר השעון 5')
    }
  })

  it('accepts exactly 100 IDs', () => {
    const ids = Array.from(
      { length: 100 },
      (_, i) =>
        `${i.toString().padStart(8, '0')}-e29b-41d4-a716-${(i + 1000).toString().padStart(12, '0')}`,
    ).join(',')
    const result = batchLocationSchema.safeParse({
      ids,
      city: 'אילת',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ids).toHaveLength(100)
    }
  })

  it('handles nationwide label city name', () => {
    // The action should reject "כל הארץ" but the schema itself allows it
    // (validation happens in the action to provide better error messaging)
    const result = batchLocationSchema.safeParse({
      ids: '550e8400-e29b-41d4-a716-446655440000',
      city: 'כל הארץ',
      full_address: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.city).toBe('כל הארץ')
    }
  })
})
