import { afterEach, describe, expect, it } from 'vitest'
import {
  PUBLISHED_STORE_WHATSAPP,
  buildCouponShareText,
  buildRedemptionInquiryText,
  buildSupplierInquiryText,
  formatIsraeliPhoneDisplay,
  isIsraeliMobile,
  normalizeIsraeliPhone,
  storeWhatsAppLink,
  storeWhatsAppNumber,
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

describe('the store number', () => {
  const original = process.env.NEXT_PUBLIC_WHATSAPP_PHONE

  afterEach(() => {
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE = original
  })

  it('falls back to the published number when the env var is absent', () => {
    // The floating button, the footer icon and the /contact line are three
    // surfaces for one number. Only the button read the env var, so a
    // deployment that never set it lost the button and kept the other two -- a
    // silent gap. KE_LIVE_SPEC.md publishes this number.
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE = ''
    expect(storeWhatsAppNumber()).toBe(PUBLISHED_STORE_WHATSAPP)
    expect(storeWhatsAppLink()).toBe(`https://wa.me/${PUBLISHED_STORE_WHATSAPP}`)
  })

  it('lets the env var override it', () => {
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE = '050-111-2222'
    expect(storeWhatsAppNumber()).toBe('972501112222')
  })

  it('ignores an env value that is not a phone number', () => {
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE = 'TODO'
    expect(storeWhatsAppNumber()).toBe(PUBLISHED_STORE_WHATSAPP)
  })
})

describe('formatIsraeliPhoneDisplay', () => {
  it('prints international digits as the local form', () => {
    expect(formatIsraeliPhoneDisplay('972524635550')).toBe('052-463-5550')
    expect(formatIsraeliPhoneDisplay('03-1234567')).toBe('03-1234567')
  })

  it('returns null for a non-phone', () => {
    expect(formatIsraeliPhoneDisplay('nope')).toBeNull()
  })
})

describe('supplier message builders', () => {
  it('names the deal a shopper is asking about', () => {
    expect(buildSupplierInquiryText('ארוחה זוגית')).toContain('ארוחה זוגית')
    expect(buildSupplierInquiryText(null)).toContain('דיל')
  })

  it('never puts the voucher code in a pre-filled message', () => {
    // A pre-filled message is one forward away from being somebody else's, and
    // the code is what redeems the coupon.
    const text = buildRedemptionInquiryText('ארוחה זוגית')
    expect(text).toContain('ארוחה זוגית')
    expect(text).not.toMatch(/\d{6,}/)
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
