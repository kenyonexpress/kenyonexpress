import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { supplierLocation } from '@/lib/geo/distance'
import { buildSupplierContact } from '@/lib/supplier-contact'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CouponTermsAccordion, { buildTermsSections } from './CouponTermsAccordion'
import CouponVoucherPreview from './CouponVoucherPreview'
import MerchantMap from './MerchantMap'
import { SimilarCouponCard } from './SimilarCoupons'

const sellable: CouponOffer = {
  sellable: true,
  fullPriceIls: 200,
  paidOnlineIls: 40,
  balanceAtBusinessIls: 160,
  discountPercent: 20,
  validUntil: new Date('2030-01-15T00:00:00Z'),
  expiryDays: 30,
}

describe('CouponVoucherPreview', () => {
  const html = renderToStaticMarkup(
    <CouponVoucherPreview name="ארוחת שף זוגית" supplierName="מסעדת השף" offer={sellable} />,
  )

  it('masks the code in the shape of a real one and says when it is revealed', () => {
    expect(html).toContain('data-testid="coupon-code-mask"')
    expect(html).toContain('•••••-•••••')
    expect(html).toContain('קוד השובר נחשף לאחר הרכישה')
    expect(html).toContain('נחשפים מיד אחרי התשלום')
  })

  it('renders no scannable QR: no data URL, no img, only the aria-hidden placeholder', () => {
    expect(html).not.toContain('data:image')
    expect(html).not.toContain('<img')
    expect(html).toContain('aria-hidden="true"')
  })

  it('quotes the same three numbers the offer carries', () => {
    expect(html).toContain('משלמים באתר')
    expect(html).toContain('משלמים בבית העסק')
    expect(html).toMatch(/40/)
    expect(html).toMatch(/160/)
    expect(html).toMatch(/200/)
  })

  it('explains an unsellable offer instead of pricing it', () => {
    const expired = renderToStaticMarkup(
      <CouponVoucherPreview
        name="x"
        supplierName={null}
        offer={{ sellable: false, reason: 'expired', fullPriceIls: 200, validUntil: null }}
      />,
    )
    expect(expired).toContain('המבצע הסתיים')
    expect(expired).not.toContain('משלמים באתר')
  })
})

describe('CouponTermsAccordion', () => {
  it('builds one section per filled field plus the cancellation section, validity first', () => {
    const sections = buildTermsSections({
      offer: sellable,
      terms: 'לא כולל אלכוהול',
      instructions: 'להזמין מקום מראש',
    })
    expect(sections.map((s) => s.id)).toEqual([
      'validity',
      'redemption',
      'conditions',
      'cancellation',
    ])
  })

  it('drops the empty sections but never the cancellation one', () => {
    const sections = buildTermsSections({
      offer: { sellable: false, reason: 'missing-price', fullPriceIls: 100, validUntil: null },
      terms: '   ',
      instructions: null,
    })
    expect(sections.map((s) => s.id)).toEqual(['cancellation'])
  })

  it('renders details elements, the first open, and links the cancellation policy', () => {
    const html = renderToStaticMarkup(
      <CouponTermsAccordion offer={sellable} terms="תנאי" instructions={null} />,
    )
    const details = html.match(/<details/g) ?? []
    expect(details).toHaveLength(3)
    expect(html).toMatch(/<details[^>]*open[^>]*data-section="validity"/)
    expect(html).not.toMatch(/<details[^>]*open[^>]*data-section="conditions"/)
    expect(html).toContain('href="/refund_returns"')
    expect(html).toContain('30 ימים')
  })
})

describe('MerchantMap', () => {
  const contact = buildSupplierContact({
    name: 'מסעדת השף',
    city: 'תל אביב',
    address: 'דיזנגוף 100',
    contact_phone: '03-1234567',
  })

  it('embeds a lazy OpenStreetMap frame and says the point is approximate', () => {
    const html = renderToStaticMarkup(
      <MerchantMap location={supplierLocation({ city: 'תל אביב' })} contact={contact} />,
    )
    expect(html).toMatch(/<iframe[^>]*src="https:\/\/www\.openstreetmap\.org\/export\/embed\.html/)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('data-precision="city"')
    expect(html).toContain('מיקום משוער לפי עיר')
    expect(html).toContain('דיזנגוף 100, תל אביב')
    expect(html).toContain('ניווט ב-Waze')
    expect(html).toContain('google.com/maps')
  })

  it('renders the section without a frame when nothing locates the business', () => {
    const html = renderToStaticMarkup(
      <MerchantMap
        location={supplierLocation(null)}
        contact={buildSupplierContact({ name: 'עסק' })}
      />,
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('מיקום בית העסק יתעדכן בקרוב')
    expect(html).toContain('עסק')
  })
})

describe('SimilarCouponCard', () => {
  it('links to the coupon variant, not the product page, and shows the online price', () => {
    const html = renderToStaticMarkup(
      <SimilarCouponCard
        coupon={{
          id: '1',
          slug: 'ספא-זוגי',
          name_he: 'ספא זוגי',
          image: null,
          fullPriceIls: 500,
          paidOnlineIls: 100,
          category: { name_he: 'ספא', slug: 'spa' },
        }}
      />,
    )
    expect(html).toContain(`href="/coupon/${encodeURIComponent('ספא-זוגי')}"`)
    expect(html).not.toContain('href="/product/')
    expect(html).toContain('-80%')
    expect(html).toContain('באתר')
  })

  it('lists an unpriced coupon without inventing a number', () => {
    const html = renderToStaticMarkup(
      <SimilarCouponCard
        coupon={{
          id: '1',
          slug: 'a',
          name_he: 'a',
          image: null,
          fullPriceIls: 500,
          paidOnlineIls: null,
          category: null,
        }}
      />,
    )
    expect(html).toContain('פרטים בעמוד הקופון')
    expect(html).not.toContain('%')
  })
})
