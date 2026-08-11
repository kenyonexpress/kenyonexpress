import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SupplierInfo from './SupplierInfo'

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
    const html = renderToStaticMarkup(<SupplierInfo supplier={reachable} productType="coupon" />)
    expect(html).not.toContain('wa.me')
    expect(html).not.toContain('בוואטסאפ')
  })

  it('shows it once the product opts in', () => {
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={reachable} productType="coupon" whatsappEnabled />,
    )
    expect(html).toContain('wa.me/972524635550')
  })

  it('still shows nothing when there is no WhatsApp-capable number', () => {
    // The flag is consent, not a number. All five filled contact_phone values
    // in production are landlines, which have no WhatsApp account: a link
    // there opens WhatsApp only to say the number is not on it.
    const landlineOnly = { id: 's2', name: 'ספא רוגע', contact_phone: '03-1234567' }
    const html = renderToStaticMarkup(
      <SupplierInfo supplier={landlineOnly} productType="coupon" whatsappEnabled />,
    )
    expect(html).not.toContain('wa.me')
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
