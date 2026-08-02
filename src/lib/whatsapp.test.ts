import { describe, expect, it } from 'vitest'
import {
  buildCouponShareText,
  isIsraeliMobile,
  normalizeIsraeliPhone,
  waChatLink,
  waShareLink,
} from './whatsapp'

describe('normalizeIsraeliPhone', () => {
  it('normalizes local mobile formats', () => {
    expect(normalizeIsraeliPhone('0501234567')).toBe('972501234567')
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567')
    expect(normalizeIsraeliPhone('050 1234567')).toBe('972501234567')
  })

  it('normalizes international formats', () => {
    expect(normalizeIsraeliPhone('+972501234567')).toBe('972501234567')
    expect(normalizeIsraeliPhone('972501234567')).toBe('972501234567')
    expect(normalizeIsraeliPhone('9720501234567')).toBe('972501234567')
  })

  it('normalizes landlines', () => {
    expect(normalizeIsraeliPhone('03-1234567')).toBe('97231234567')
  })

  it('rejects garbage', () => {
    expect(normalizeIsraeliPhone('')).toBeNull()
    expect(normalizeIsraeliPhone(null)).toBeNull()
    expect(normalizeIsraeliPhone('abc')).toBeNull()
    expect(normalizeIsraeliPhone('12345')).toBeNull()
    expect(normalizeIsraeliPhone('05012')).toBeNull()
  })
})

describe('isIsraeliMobile', () => {
  it('accepts 05X numbers only', () => {
    expect(isIsraeliMobile('0501234567')).toBe(true)
    expect(isIsraeliMobile('03-1234567')).toBe(false)
  })
})

describe('waChatLink', () => {
  it('builds a wa.me link with encoded text', () => {
    const href = waChatLink('0501234567', 'שלום')
    expect(href).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('שלום')}`)
  })

  it('returns null for invalid phones', () => {
    expect(waChatLink('nope', 'x')).toBeNull()
  })
})

describe('waShareLink', () => {
  it('builds a recipient-less share link', () => {
    expect(waShareLink('בדיקה')).toBe(`https://wa.me/?text=${encodeURIComponent('בדיקה')}`)
  })
})

describe('buildCouponShareText', () => {
  it('includes name, code, collect amount, expiry and site url', () => {
    const text = buildCouponShareText({
      productName: 'ארוחה זוגית',
      code: '12345678',
      collectAmountIls: 162,
      expiresAt: '2026-12-31T00:00:00Z',
      siteUrl: 'https://kenyonexpress.co.il',
    })
    expect(text).toContain('ארוחה זוגית')
    expect(text).toContain('12345678')
    expect(text).toContain('162')
    expect(text).toContain('https://kenyonexpress.co.il')
  })
})
