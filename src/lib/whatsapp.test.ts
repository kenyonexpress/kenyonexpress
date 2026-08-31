import { afterEach, describe, expect, it } from 'vitest'
import {
  PUBLISHED_STORE_WHATSAPP,
  buildCouponShareText,
  buildOrderInquiryText,
  buildOrderUpdateText,
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
  function share(overrides: Partial<Parameters<typeof buildCouponShareText>[0]> = {}) {
    return buildCouponShareText({
      productName: 'ארוחה זוגית',
      code: '12345678',
      collectAmountAgorot: 16_200,
      expiresAt: '2026-12-31T00:00:00Z',
      siteUrl: 'https://kenyonexpress.co.il',
      ...overrides,
    })
  }

  it('includes name, code, collect amount, expiry and site url', () => {
    const text = share()
    expect(text).toContain('ארוחה זוגית')
    expect(text).toContain('12345678')
    expect(text).toContain('162')
    expect(text).toContain('https://kenyonexpress.co.il')
  })

  it('takes agorot and prints the agora, so a forwarded message is exact', () => {
    // This is the message a customer forwards to whoever is coming with them,
    // as a record of what they will still pay at the counter. It used to take
    // shekels, so every caller divided `remaining_amount_due_agorot` by 100
    // and handed over a float that had to be rounded back.
    expect(share({ collectAmountAgorot: 16_250 })).toContain('₪162.50')
    expect(share({ collectAmountAgorot: 5 })).toContain('₪0.05')
  })

  it('says nothing about a balance when the coupon covers the whole price', () => {
    expect(share({ collectAmountAgorot: 0 })).not.toContain('לתשלום בעסק')
  })
})

/**
 * The order-update links from (14). Both builders were shipped wired to a UI
 * and neither had a test.
 *
 * They are the only two messages in this module a STAFF member sends to a
 * named customer, which is what makes them worth pinning: the greeting
 * interpolates a nullable name, and the body interpolates an order id and a
 * status label straight out of the admin page.
 */
describe('the message an admin sends a customer about their order', () => {
  const base = { customerName: 'דנה כהן', orderShortId: 'KE-1042', statusLabel: 'נשלח' }

  it('greets the customer by name', () => {
    expect(buildOrderUpdateText(base)).toContain('שלום דנה כהן,')
  })

  it('degrades to a bare greeting rather than to the word null', () => {
    // `שלום null,` is the classic shape of this bug and it goes to a real
    // person's phone, from the business, with no way to recall it.
    const text = buildOrderUpdateText({ ...base, customerName: null })
    expect(text.startsWith('שלום,')).toBe(true)
    expect(text).not.toMatch(/null|undefined/)
  })

  it('names the order and the status, which is the entire point of the message', () => {
    const text = buildOrderUpdateText(base)
    expect(text).toContain('KE-1042')
    expect(text).toContain('נשלח')
  })

  it('carries nothing else about the customer', () => {
    // A prefilled message is one forward away from being somebody else's. The
    // same reasoning the redemption inquiry uses to withhold the voucher code.
    const text = buildOrderUpdateText({ ...base, customerName: 'דנה כהן' })
    expect(text).not.toMatch(/@|\d{9,}/)
  })

  it('reaches an Israeli mobile stored in any of the usual shapes', () => {
    // The phone comes from `profiles.phone`, which is free text.
    for (const stored of ['0524635550', '052-463-5550', '+972 52 4635550']) {
      const href = waChatLink(stored, buildOrderUpdateText(base))
      expect(href, stored).toContain('https://wa.me/972524635550')
    }
  })
})

describe('the message a customer sends about their own order', () => {
  it('names the order so support does not have to ask', () => {
    expect(buildOrderInquiryText('KE-1042')).toContain('KE-1042')
  })
})
