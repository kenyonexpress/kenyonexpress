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

  /**
   * The pair a customer can receive about one coupon: the warning, then what
   * happened to the money when the warning was not acted on. They must not both
   * point at the coupon list -- there is nothing to do on a dead coupon's page,
   * and the money is on the wallet page.
   */
  it('sends the expiry credit to the wallet and the expiry warning to the coupons', () => {
    const warn = buildInAppContent('voucher_expiring', { days_remaining: 3 })
    expect(warn?.href).toBe('/account/coupons')

    const credited = buildInAppContent('voucher_expiry_credited', { amount_agorot: 10_800 })
    expect(credited?.title_he).toBe('הכסף על קופון שפג חזר אליך')
    expect(credited?.body_he).toBe('₪108 נוספו לארנק.')
    expect(credited?.href).toBe('/account/wallet')
  })

  /** ₪0 נוספו לארנק is not a notification, it is a bug report. */
  it('writes no expiry-credit row when nothing was paid online', () => {
    expect(buildInAppContent('voucher_expiry_credited', { amount_agorot: 0 })).toBeNull()
    expect(buildInAppContent('voucher_expiry_credited', {})).toBeNull()
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

  it('reads the key the enqueuer actually writes', () => {
    // THIS TEST USED TO PASS WITH `days_left`, AND THAT IS THE WHOLE POINT.
    // `enqueue_expiring_voucher_notices` writes `days_remaining` -- measured
    // against production 2026-09-10, and the email and push legs both read
    // that name. In-app read `days_left`, so `days` was always null and the
    // body always said "it expires today", including for the seven-day bucket.
    // The test asserted the same wrong key as the code, so both agreed and
    // neither described the queue.
    expect(buildInAppContent('voucher_expiring', { days_remaining: 7 })?.body_he).toBe(
      'הוא פג בעוד 7 ימים.',
    )
    expect(buildInAppContent('voucher_expiring', { days_left: 7 })?.body_he).not.toBe(
      'הוא פג בעוד 7 ימים.',
    )
  })

  it('does not say "0 days left" when a voucher expires today', () => {
    // A reminder that says "in 0 days" is how a reminder stops being read.
    expect(buildInAppContent('voucher_expiring', { days_remaining: 0 })?.body_he).toBe(
      'הוא פג היום.',
    )
  })

  it('uses the Hebrew dual rather than a suffix', () => {
    // "נותרו 1 ימים" and "נותרו 2 ימים" both read wrong to a speaker, and this
    // body is read by a customer deciding whether to go today.
    expect(buildInAppContent('voucher_expiring', { days_remaining: 1 })?.body_he).toBe(
      'הוא פג מחר.',
    )
    expect(buildInAppContent('voucher_expiring', { days_remaining: 2 })?.body_he).toBe(
      'הוא פג בעוד יומיים.',
    )
  })

  it('fills the refund body from the key refundOrder enqueues', () => {
    // `refundOrder` writes `refunded_agorot`; this builder read
    // `amount_agorot`, which is `cashback_credited`'s key, so every refund
    // notification arrived with an empty body.
    expect(buildInAppContent('refund_completed', { refunded_agorot: 9_500 })?.body_he).toBe(
      '₪95 חזרו אליך.',
    )
  })

  it('names the carrier from the shipments envelope', () => {
    // `tg_orders_notify_shipped` writes `shipments: [{carrier, tracking_number}]`
    // and no top-level `tracking_number`. The tracking number itself stays off
    // the body: a long LTR number inside an RTL sentence renders in a
    // plausible but wrong order, and a wrong one sends the customer to a
    // courier's site to be told it does not exist.
    const content = buildInAppContent('order_shipped', {
      shipments: [{ carrier: 'צ׳יטה', tracking_number: 'RR123456789IL' }],
    })
    expect(content?.body_he).toBe('נשלח עם צ׳יטה. פרטי המעקב בעמוד ההזמנה.')
    expect(content?.body_he).not.toContain('RR123456789IL')
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
