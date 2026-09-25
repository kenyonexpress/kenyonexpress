import { DEFAULT_CONTACT_CHANNELS, askBusinessHref } from '@/lib/contact/channels'
import type { SupplierContactRow } from '@/lib/supplier-contact'
import { buildSupplierInquiryText } from '@/lib/whatsapp'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SupplierInfo from './SupplierInfo'

/** What the product page computes and passes since section 94. */
function askFor(supplier: SupplierContactRow, enabled: boolean, name: string | null) {
  return askBusinessHref({
    supplierWhatsapp: supplier.whatsapp ?? null,
    whatsappEnabled: enabled,
    name,
    customerService: DEFAULT_CONTACT_CHANNELS[0] ?? null,
    storeNumber: '972524635550',
    supplierOpener: buildSupplierInquiryText(name),
  })
}

/**
 * `docs/BUSINESS-MODEL.md` §2 makes address + Waze and phone + WhatsApp
 * mandatory on every product page. Before [68] this block printed the business
 * name and nothing else, and the address only appeared on `/coupon/[id]` --
 * after paying. Fifteen of the live products are coupons redeemed in person.
 *
 * Rendered as server markup because that is where it lives: the PDP is static
 * (`x-nextjs-prerender`, [46]) and this block has no client state.
 */
describe('SupplierInfo', () => {
  const full = {
    id: 'a',
    name: 'מסעדת השף הגדול',
    city: 'תל אביב',
    address: 'דיזנגוף 100',
    contact_phone: '03-1234567',
    whatsapp: '972501234567',
  }

  // These two pass `whatsappEnabled` because the link is opt-in per product
  // since 003-products-whatsapp-enabled. They asserted it unconditionally when
  // written, which is the behaviour the toggle deliberately removed; the
  // opted-out case is covered in "the WhatsApp opt-in" below.
  it('renders the address, a Waze link, a dialable phone and WhatsApp', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={full}
        productType="coupon"
        productName="ארוחה זוגית"
        whatsappEnabled
        ask={askFor(full, true, 'ארוחה זוגית')}
      />,
    )
    expect(html).toContain('מסעדת השף הגדול')
    expect(html).toContain('דיזנגוף 100, תל אביב')
    expect(html).toContain('waze.com/ul?q=')
    expect(html).toContain('tel:+97231234567')
    expect(html).toContain('https://wa.me/972501234567')
  })

  it('puts the product name in the prepared WhatsApp message', () => {
    // A business selling forty deals cannot answer "היי, יש פרטים?".
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={full}
        productType="coupon"
        productName="ארוחה זוגית"
        whatsappEnabled
        ask={askFor(full, true, 'ארוחה זוגית')}
      />,
    )
    expect(html).toContain(encodeURIComponent('ארוחה זוגית'))
  })

  it('prints no empty rows for the 11 suppliers that have no contact data', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={{ id: 'a', name: 'אלקטרו פלוס' }} productType="physical" />,
    )
    expect(html).toContain('אלקטרו פלוס')
    expect(html).not.toContain('tel:')
    expect(html).not.toContain('wa.me')
    expect(html).not.toContain('waze.com')
  })

  it('keeps the placeholder when there is no supplier at all', () => {
    const html = renderToStaticMarkup(<SupplierInfo supplier={null} productType="physical" />)
    expect(html).toContain('פרטי הספק יתעדכנו בקרוב')
  })

  it('offers no Waze when only the city is known', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={{ id: 'a', name: 'ספא רוגע', city: 'חיפה' }} productType="coupon" />,
    )
    expect(html).toContain('חיפה')
    expect(html).not.toContain('waze.com')
  })

  it('tells a subscription buyer it renews, not that it ships', () => {
    // The regression this pins: the prop union used to spell the third type
    // `subscription`, which is not the enum member. `recurring` fell through to
    // the physical branch and promised delivery of a monthly subscription.
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={{ id: 'a', name: 'חדר כושר' }} productType="recurring" />,
    )
    expect(html).toContain('מתחדש אוטומטית')
    expect(html).not.toContain('נשלח ומסופק')
  })

  it('gives each of the three sale types its own fulfilment sentence', () => {
    const note = (productType: 'coupon' | 'physical' | 'recurring') =>
      renderToStaticMarkup(
        <SupplierInfo supplier={{ id: 'a', name: 'ספק' }} productType={productType} />,
      )

    expect(note('coupon')).toContain('בבית העסק')
    expect(note('physical')).toContain('נשלח ומסופק')
    expect(note('recurring')).toContain('לבטל בכל עת')
  })

  it('never leaks the commission fields, whatever else it prints', () => {
    // The margin is the one supplier field a shopper must not see
    // (ShippingInfo.tsx makes the same call). The query selects a named list
    // rather than `*`; this is the assertion at the other end of it.
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={{ ...full, ...({ commission_percent: 17.5 } as Record<string, unknown>) }}
        productType="physical"
      />,
    )
    expect(html).not.toContain('17.5')
  })
})

describe('the WhatsApp opt-in', () => {
  const reachable = {
    id: 's1',
    name: 'מסעדת הדגים',
    whatsapp: '0524635550',
    contact_phone: '03-1234567',
  }

  it('shows no WhatsApp link until the product opts in', () => {
    // The default. `whatsapp_enabled` is false for all 80 products until an
    // admin ticks it, and the column does not exist yet at all -- so an
    // omitted prop must mean silence, not a published phone number.
    // Section 94: the page still offers "ask", but it reaches customer service,
    // never the supplier's own number.
    const ask = askFor(reachable, false, null)
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={reachable} productType="coupon" ask={ask} />,
    )
    expect(html).toContain('data-via="customer_service"')
    expect(html).not.toContain('data-via="supplier"')
  })

  it('shows it once the product opts in', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={reachable}
        productType="coupon"
        whatsappEnabled
        ask={askFor(reachable, true, null)}
      />,
    )
    expect(html).toContain('wa.me/972524635550')
    expect(html).toContain('data-via="supplier"')
  })

  it('still shows nothing when there is no WhatsApp-capable number', () => {
    // The flag is consent, not a number. All five filled contact_phone values
    // in production are landlines, which have no WhatsApp account: a link
    // there opens WhatsApp only to say the number is not on it.
    const landlineOnly = { id: 's2', name: 'ספא רוגע', contact_phone: '03-1234567' }
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={landlineOnly}
        productType="coupon"
        whatsappEnabled
        ask={askFor(landlineOnly, true, null)}
      />,
    )
    // No supplier link; the fallback reaches customer service and says so.
    expect(html).toContain('data-via="customer_service"')
    expect(html).toContain('03-1234567')
  })

  it('falls back to the empty-state line rather than an empty list', () => {
    // A supplier whose ONLY reachable detail is a WhatsApp number that is not
    // opted in would otherwise render a heading over an empty <ul>.
    // Empty rather than null: `name` is non-nullable on the row, and
    // `buildSupplierContact` trims '' to null, which is the state this covers.
    const whatsappOnly = { id: 's3', name: '', whatsapp: '0524635550' }
    const html = renderToStaticMarkup(<SupplierInfo supplier={whatsappOnly} productType="coupon" />)
    expect(html).toContain('יתעדכנו בקרוב')
  })
})

/**
 * Pending 242 adds `suppliers.google_reviews_url`. The link is the one trust
 * signal on the block that the site does not author, so it renders only for
 * a URL on a Google host; anything else is dropped before it becomes a link
 * under the words "ביקורות בגוגל".
 */
describe('SupplierInfo Google reviews link', () => {
  const base = {
    id: 'a',
    name: 'מסעדת השף הגדול',
    city: 'תל אביב',
    address: 'דיזנגוף 100',
    contact_phone: '03-1234567',
    whatsapp: null,
  }

  it('links the reviews page when the stored URL is on a Google host', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={{ ...base, google_reviews_url: 'https://maps.app.goo.gl/AbCdEf' }}
        productType="coupon"
      />,
    )
    expect(html).toContain('data-testid="supplier-google-reviews"')
    expect(html).toContain('href="https://maps.app.goo.gl/AbCdEf"')
    expect(html).toContain('ביקורות בגוגל')
  })

  it('renders no reviews link for a foreign host, an http URL, or no URL at all', () => {
    for (const url of ['https://notgoogle.com/reviews', 'http://www.google.com/maps', null]) {
      const html = renderToStaticMarkup(
        <SupplierInfo supplier={{ ...base, google_reviews_url: url }} productType="physical" />,
      )
      expect(html, String(url)).not.toContain('supplier-google-reviews')
      expect(html, String(url)).not.toContain('ביקורות בגוגל')
    }
  })

  it('counts the reviews link as a visible detail, so it is not hidden behind the placeholder', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo
        supplier={{
          id: 'b',
          name: '',
          google_reviews_url: 'https://g.page/r/AbCdEf/review',
        }}
        productType="coupon"
      />,
    )
    expect(html).toContain('supplier-google-reviews')
    expect(html).not.toContain('פרטי הספק יתעדכנו בקרוב')
  })

  describe('the verified badge', () => {
    const full = { id: 'a', name: 'מסעדת השף הגדול', city: 'תל אביב', address: 'דיזנגוף 100' }

    it('is absent unless the loader decided verified from evidence', () => {
      expect(
        renderToStaticMarkup(<SupplierInfo supplier={full} productType="physical" />),
      ).not.toContain('supplier-verified')
      expect(
        renderToStaticMarkup(
          <SupplierInfo supplier={{ ...full, verified: false }} productType="physical" />,
        ),
      ).not.toContain('supplier-verified')
    })

    it('sits beside the supplier name when verified', () => {
      const html = renderToStaticMarkup(
        <SupplierInfo supplier={{ ...full, verified: true }} productType="coupon" />,
      )
      expect(html).toContain('data-testid="supplier-verified"')
      expect(html).toContain('ספק מאומת')
      // The badge follows the name link, inside the same list item.
      expect(html.indexOf('ספק מאומת')).toBeGreaterThan(html.indexOf(full.name))
    })
  })
})
