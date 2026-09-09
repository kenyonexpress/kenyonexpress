import { describe, expect, it } from 'vitest'
import { IN_APP_KINDS, buildInAppContent, isInAppKind } from './in-app'

/**
 * The in-app centre's content, and the boundary that keeps operator figures out
 * of a shopper's bell.
 */
describe('the in-app allowlist', () => {
  // These go to a business or to a fixed operator address. One of them in a
  // customer's bell publishes an internal figure to a stranger, so this is the
  // test that matters most in the file.
  const OPERATOR_KINDS = [
    'supplier_sale',
    'invoice_dead',
    'low_stock',
    'reconciliation_gap',
    'settlement_gap',
  ]

  it.each(OPERATOR_KINDS)('refuses the operator kind %s', (kind) => {
    expect(isInAppKind(kind)).toBe(false)
    expect(buildInAppContent(kind, { amount_agorot: 410200 })).toBeNull()
  })

  it('refuses a kind nobody has heard of, rather than defaulting to showing it', () => {
    expect(buildInAppContent('some_future_kind', {})).toBeNull()
  })

  it('builds content for every kind it claims to accept', () => {
    // A kind on the list with no case in the switch would return null forever
    // and be a notification nobody ever gets. price_drop is the one exception
    // and it is covered separately: it refuses a payload that is not a drop.
    for (const kind of IN_APP_KINDS) {
      const payload =
        kind === 'price_drop' ? { saved_agorot: 20000, now_agorot: 15000 } : { amount_agorot: 500 }
      expect(buildInAppContent(kind, payload), `${kind} built nothing`).not.toBeNull()
    }
  })
})

describe('the content itself', () => {
  it('states the amount for a cashback credit', () => {
    const c = buildInAppContent('cashback_credited', { amount_agorot: 1250 })
    expect(c?.title_he).toBe('נכנס לך קאשבק')
    expect(c?.body_he).toBe('₪12.50 נוספו לארנק.')
    expect(c?.href).toBe('/account/wallet')
  })

  it('presents a refund as a positive amount even when the payload signs it', () => {
    // The journal stores a refund as a negative movement. "‏-₪50 חזרו אליך" is
    // a sentence that reads as money leaving.
    const c = buildInAppContent('refund_completed', { amount_agorot: -5000 })
    expect(c?.body_he).toBe('₪50 חזרו אליך.')
  })

  it('pluralises the voucher title on the count actually present', () => {
    expect(buildInAppContent('voucher_issued', { vouchers: [{}, {}, {}] })?.title_he).toBe(
      '3 שוברים מוכנים לך',
    )
    expect(buildInAppContent('voucher_issued', { vouchers: [{}] })?.title_he).toBe('השובר שלך מוכן')
  })

  it('does not say "0 days left" when a voucher expires today', () => {
    // A reminder that says "in 0 days" is how a reminder stops being read.
    expect(buildInAppContent('voucher_expiring', { days_left: 0 })?.body_he).toBe('הוא פג היום.')
    expect(buildInAppContent('voucher_expiring', { days_left: 7 })?.body_he).toBe(
      'נותרו 7 ימים למימוש.',
    )
  })

  it('refuses a price_drop whose payload is not a drop', () => {
    // A rise, or an equal price, would render as "the price dropped" over two
    // numbers that say otherwise.
    expect(buildInAppContent('price_drop', { saved_agorot: 100, now_agorot: 200 })).toBeNull()
    expect(buildInAppContent('price_drop', { saved_agorot: 100, now_agorot: 100 })).toBeNull()
    expect(buildInAppContent('price_drop', { saved_agorot: 100 })).toBeNull()
  })

  it('links to the product when it knows the slug, and to the wishlist when it does not', () => {
    const withSlug = buildInAppContent('back_in_stock', {
      product_name: 'עיסוי',
      product_slug: 'massage',
    })
    expect(withSlug?.href).toBe('/product/massage')
    expect(buildInAppContent('back_in_stock', {})?.href).toBe('/account/wishlist')
  })

  it('never returns an absolute URL, so the link cannot leave the site', () => {
    // The row is rendered into a <Link>. A host here would be a place for an
    // open redirect to hide.
    for (const kind of IN_APP_KINDS) {
      const payload =
        kind === 'price_drop' ? { saved_agorot: 20000, now_agorot: 15000 } : { amount_agorot: 500 }
      const href = buildInAppContent(kind, payload)?.href
      if (href !== null && href !== undefined) {
        expect(href.startsWith('/'), `${kind} -> ${href}`).toBe(true)
        expect(href.startsWith('//'), `${kind} -> ${href}`).toBe(false)
      }
    }
  })

  it('survives a payload with nothing in it rather than rendering undefined', () => {
    const c = buildInAppContent('order_paid', {})
    expect(c?.title_he).toBe('ההזמנה שלך התקבלה')
    expect(c?.body_he).toBeNull()
  })
})
