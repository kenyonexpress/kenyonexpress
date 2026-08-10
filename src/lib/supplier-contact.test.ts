import { describe, expect, it } from 'vitest'
import { buildSupplierContact } from './supplier-contact'

/** The five production rows that actually carry contact data, in their real shape. */
const LIVE_SHAPED = {
  name: 'מסעדת השף הגדול',
  city: 'תל אביב',
  address: null,
  contact_phone: '03-1234567',
  whatsapp: '972501234567',
}

describe('buildSupplierContact', () => {
  it('normalizes a locally-typed WhatsApp number to international digits', () => {
    // THE BUG THIS LOCKS. The voucher page built the href with
    // `whatsapp.replace(/[^0-9]/g, '')`, which keeps the leading zero:
    // wa.me/0524635550 is WhatsApp's "not on WhatsApp" screen, shown to a
    // customer standing at the counter.
    const view = buildSupplierContact({ name: 'עסק', whatsapp: '052-463-5550' })
    expect(view.whatsappHref).toContain('https://wa.me/972524635550')
    expect(view.whatsappHref).not.toContain('/0')
  })

  it('encodes the prepared message into the link', () => {
    const view = buildSupplierContact(
      { name: 'עסק', whatsapp: '0501234567' },
      { whatsappMessage: 'שלום, יש פרטים?' },
    )
    expect(view.whatsappHref).toBe(
      `https://wa.me/972501234567?text=${encodeURIComponent('שלום, יש פרטים?')}`,
    )
  })

  it('does not offer WhatsApp on a landline', () => {
    // Measured: all five filled production suppliers hold a landline in
    // contact_phone. An unconditional fallback would have produced five links
    // that open WhatsApp only to report the number is not on it.
    const view = buildSupplierContact({ name: 'עסק', contact_phone: '03-1234567' })
    expect(view.telHref).toBe('tel:+97231234567')
    expect(view.whatsappHref).toBeNull()
  })

  it('falls back to contact_phone when it is a mobile', () => {
    const view = buildSupplierContact({ name: 'עסק', contact_phone: '054-7654321' })
    expect(view.whatsappHref).toContain('wa.me/972547654321')
  })

  it('prefers the whatsapp column over the phone', () => {
    const view = buildSupplierContact(LIVE_SHAPED)
    expect(view.whatsappHref).toContain('wa.me/972501234567')
    expect(view.telHref).toBe('tel:+97231234567')
    expect(view.phoneDisplay).toBe('03-1234567')
  })

  it('dials internationally and prints locally', () => {
    // The href has to survive a roaming handset, which resolves a leading 0
    // against the visited network; the label has to stay readable to an Israeli.
    const view = buildSupplierContact({ contact_phone: '050-1234567' })
    expect(view.telHref).toBe('tel:+972501234567')
    expect(view.phoneDisplay).toBe('050-1234567')
  })

  it('joins address and city, and offers Waze only with a street address', () => {
    const withAddress = buildSupplierContact({ address: 'הרצל 5', city: 'חיפה' })
    expect(withAddress.addressLine).toBe('הרצל 5, חיפה')
    expect(withAddress.wazeHref).toContain('waze.com/ul?q=')

    const cityOnly = buildSupplierContact({ city: 'חיפה' })
    expect(cityOnly.addressLine).toBe('חיפה')
    expect(cityOnly.wazeHref).toBeNull()
  })

  it('reports nothing to render for an empty or missing supplier', () => {
    // 11 of 11 production suppliers have no address and 6 have no phone: the
    // block has to be able to render nothing rather than empty labels.
    expect(buildSupplierContact(null).hasAny).toBe(false)
    expect(buildSupplierContact({}).hasAny).toBe(false)
    expect(buildSupplierContact({ name: '   ', city: '  ' }).hasAny).toBe(false)
    expect(buildSupplierContact({ name: 'עסק' }).hasAny).toBe(true)
  })

  it('drops a phone that is not a phone instead of linking it', () => {
    const view = buildSupplierContact({ name: 'עסק', contact_phone: 'צרו קשר באתר' })
    expect(view.telHref).toBeNull()
    expect(view.whatsappHref).toBeNull()
    expect(view.hasAny).toBe(true)
  })
})
