import { describe, expect, it } from 'vitest'
import { formatPhoneIL, maskPhoneIL, normalizePhoneIL } from './phone'

describe('formatPhoneIL', () => {
  it('formats 10-digit Israeli number', () => {
    expect(formatPhoneIL('0501234567')).toBe('050-123-4567')
  })

  it('formats international +972 number', () => {
    expect(formatPhoneIL('+972501234567')).toBe('050-123-4567')
  })

  it('formats already-formatted number', () => {
    expect(formatPhoneIL('050-123-4567')).toBe('050-123-4567')
  })

  it('handles empty/null', () => {
    expect(formatPhoneIL('')).toBe('')
    expect(formatPhoneIL(null)).toBe('')
    expect(formatPhoneIL(undefined)).toBe('')
  })

  it('handles 9-digit number', () => {
    expect(formatPhoneIL('021234567')).toBe('02-123-4567')
  })
})

describe('normalizePhoneIL', () => {
  it('converts local to international', () => {
    expect(normalizePhoneIL('0501234567')).toBe('+972501234567')
  })

  it('preserves already-international', () => {
    expect(normalizePhoneIL('+972501234567')).toBe('+972501234567')
  })

  it('strips formatting', () => {
    expect(normalizePhoneIL('050-123-4567')).toBe('+972501234567')
  })
})

describe('maskPhoneIL', () => {
  it('masks as user types', () => {
    expect(maskPhoneIL('0')).toBe('0')
    expect(maskPhoneIL('05')).toBe('05')
    expect(maskPhoneIL('050')).toBe('050')
    expect(maskPhoneIL('0501')).toBe('050-1')
    expect(maskPhoneIL('050123')).toBe('050-123')
    expect(maskPhoneIL('0501234')).toBe('050-123-4')
    expect(maskPhoneIL('0501234567')).toBe('050-123-4567')
  })

  it('adds leading 0 if missing', () => {
    expect(maskPhoneIL('50')).toBe('050')
    expect(maskPhoneIL('501234567')).toBe('050-123-4567')
  })

  it('handles empty', () => {
    expect(maskPhoneIL('')).toBe('')
  })
})
