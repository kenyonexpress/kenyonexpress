import { describe, expect, it } from 'vitest'
import { PUSHABLE_KINDS, buildPushContent, daysInHebrew } from './templates'

const SITE = 'https://kenyonexpress.co.il'

describe('daysInHebrew', () => {
  it('uses the dual, because "2 ימים" is not how anyone says it', () => {
    expect(daysInHebrew(2)).toBe('בעוד יומיים')
  })

  it('collapses today and tomorrow to words rather than counts', () => {
    expect(daysInHebrew(0)).toBe('היום')
    expect(daysInHebrew(-3)).toBe('היום')
    expect(daysInHebrew(1)).toBe('מחר')
  })

  it('counts from three up', () => {
    expect(daysInHebrew(7)).toBe('בעוד 7 ימים')
  })
})

describe('buildPushContent gating', () => {
  it('pushes nothing for a kind that has no template', () => {
    // The outbox also carries supplier and admin mail. A customer's lock screen
    // is not where a supplier sale alert belongs, and this null is the only
    // thing standing between the two.
    expect(buildPushContent('supplier_sale', { supplier_name: 'עסק' }, SITE)).toBeNull()
    expect(buildPushContent('low_stock', { product_name: 'x' }, SITE)).toBeNull()
    expect(buildPushContent('anything_new', {}, SITE)).toBeNull()
    // Two customer kinds that are deliberately not pushes: the welcome has no
    // event and no order, and a gift recipient has no account to subscribe.
    expect(buildPushContent('welcome', { full_name: 'דנה' }, SITE)).toBeNull()
    expect(buildPushContent('voucher_gifted', { code: 'x' }, SITE)).toBeNull()
  })

  it('lists exactly the eleven customer kinds that may reach a lock screen', () => {
    // A deliberate diff. The outbox carries every notification the system owes,
    // including supplier and admin alerts, and this list is the gate that keeps
    // them off a customer's phone. Q09: everything a customer is owed that is
    // not one of the five mails is a push linking to the order page.
    expect([...PUSHABLE_KINDS]).toEqual([
      'order_paid',
      'voucher_issued',
      'voucher_expiring',
      'voucher_redeemed',
      'refund_completed',
      'cashback_credited',
      'voucher_expiry_credited',
      'referral_bonus_credited',
      'order_shipped',
      'price_drop',
      'back_in_stock',
    ])
    for (const kind of PUSHABLE_KINDS) {
      expect(buildPushContent(kind, {}, SITE)).not.toBeUndefined()
    }
  })

  it('always hands the service worker a same-origin path, never an absolute URL', () => {
    // `public/sw.js` opens `url` only when it starts with `/`. Every template
    // used to put an https link there, so every click landed on the home page.
    const rich = {
      order_id: 'o1',
      order_ref: 'ORDER1',
      total_agorot: 5000,
      refunded_agorot: 1000,
      amount_agorot: 250,
      days_remaining: 3,
      voucher_id: 'v1',
      product_name: 'עיסוי',
      product_slug: 'massage',
      saved_agorot: 2000,
      now_agorot: 1500,
      vouchers: [{ id: 'v1', product_name: 'עיסוי' }],
    }
    for (const kind of PUSHABLE_KINDS) {
      const content = buildPushContent(kind, rich, SITE)
      expect(content, kind).not.toBeNull()
      const url = content?.data.url
      expect(typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'), kind).toBe(
        true,
      )
      expect(content?.data.link, kind).toBe(`https://kenyonexpress.co.il${url}`)
    }
  })

  it('links the order page whenever the payload names an order', () => {
    const withOrder = {
      order_id: 'o1',
      total_agorot: 100,
      refunded_agorot: 100,
      amount_agorot: 100,
    }
    for (const kind of [
      'order_paid',
      'voucher_issued',
      'voucher_redeemed',
      'refund_completed',
      'cashback_credited',
      'order_shipped',
    ]) {
      expect(buildPushContent(kind, withOrder, SITE)?.data.url, kind).toBe('/account/orders/o1')
    }
    // No order named: the list, not the home page.
    expect(buildPushContent('order_paid', {}, SITE)?.data.url).toBe('/account/orders')
    expect(buildPushContent('voucher_redeemed', {}, SITE)?.data.url).toBe('/account/orders')
  })
})

describe('order_paid', () => {
  it('states the total as shekels from agorot and sends the customer to the order', () => {
    const content = buildPushContent(
      'order_paid',
      { order_id: 'o1', order_ref: 'ORDER1', total_agorot: 34_990 },
      SITE,
    )
    expect(content?.title).toBe('ההזמנה שלך התקבלה')
    expect(content?.body).toContain('₪349.90')
    expect(content?.data.path).toBe('/orders/o1')
    expect(content?.data.url).toBe('/account/orders/o1')
  })
})

describe('refund_completed', () => {
  it('says cancelled rather than refunded when no money moved', () => {
    const content = buildPushContent(
      'refund_completed',
      { order_id: 'o1', cancel_only: true },
      SITE,
    )
    expect(content?.title).toBe('ההזמנה שלך בוטלה')
    expect(content?.body).not.toContain('₪')
  })

  it('names the amount that went back to the card', () => {
    const content = buildPushContent(
      'refund_completed',
      { order_id: 'o1', refunded_agorot: 12_500 },
      SITE,
    )
    expect(content?.title).toBe('ההחזר שלך בוצע')
    expect(content?.body).toContain('₪125')
  })
})

describe('wallet credits that are not cashback', () => {
  it('sends nothing for a zero or missing credit', () => {
    expect(buildPushContent('voucher_expiry_credited', {}, SITE)).toBeNull()
    expect(buildPushContent('referral_bonus_credited', { amount_agorot: 0 }, SITE)).toBeNull()
  })

  it('never says cashback, and never says card', () => {
    const expiry = buildPushContent(
      'voucher_expiry_credited',
      { amount_agorot: 9900, product_name: 'עיסוי' },
      SITE,
    )
    expect(expiry?.title).toBe('₪99 חזרו לארנק שלך')
    expect(expiry?.body).toContain('פג')
    expect(`${expiry?.title} ${expiry?.body}`).not.toContain('קאשבק')
    expect(`${expiry?.title} ${expiry?.body}`).not.toContain('כרטיס')
    expect(expiry?.data.url).toBe('/account/wallet')

    const referrer = buildPushContent(
      'referral_bonus_credited',
      { amount_agorot: 2000, role: 'referrer' },
      SITE,
    )
    expect(referrer?.body).toContain('הזמנתם')
    expect(`${referrer?.title}`).not.toContain('קאשבק')
  })
})

describe('back_in_stock', () => {
  it('refuses without a product name and links the product with one', () => {
    expect(buildPushContent('back_in_stock', { product_slug: 'x' }, SITE)).toBeNull()
    const content = buildPushContent(
      'back_in_stock',
      { product_name: 'עיסוי', product_slug: 'massage' },
      SITE,
    )
    expect(content?.title).toBe('עיסוי חזר למלאי')
    expect(content?.data.url).toBe('/product/massage')
  })
})

describe('voucher_issued', () => {
  it('names the product and deep-links straight to that coupon', () => {
    const content = buildPushContent(
      'voucher_issued',
      { order_id: 'o1', vouchers: [{ id: 'v1', product_name: 'ארוחה זוגית' }] },
      SITE,
    )
    expect(content?.title).toBe('הקופון שלך מוכן')
    expect(content?.body).toContain('ארוחה זוגית')
    expect(content?.data.path).toBe('/coupons/v1')
    // The web click goes to the ORDER page (Q09): that is where the coupon,
    // the receipt and the cancellation form all live.
    expect(content?.data.url).toBe('/account/orders/o1')
    expect(content?.data.link).toBe('https://kenyonexpress.co.il/account/orders/o1')
  })

  it('counts instead of naming one when the order held several', () => {
    const content = buildPushContent(
      'voucher_issued',
      {
        vouchers: [
          { id: 'v1', product_name: 'א' },
          { id: 'v2', product_name: 'ב' },
        ],
      },
      SITE,
    )
    expect(content?.title).toBe('הקופונים שלך מוכנים')
    expect(content?.body).toContain('2 קופונים')
    // Naming one of two reads as though the other failed, so the link goes to
    // the list rather than to an arbitrary member of it.
    expect(content?.data.path).toBe('/coupons')
  })

  it('still says something useful with no voucher detail at all', () => {
    const content = buildPushContent('voucher_issued', {}, SITE)
    expect(content?.body).toBe('הקופון שלך מוכן ומחכה בדף ההזמנה.')
    expect(content?.data.path).toBe('/coupons')
  })
})

describe('voucher_expiring', () => {
  it('refuses to send without a day count', () => {
    // "Your coupon is expiring" with no deadline is a nag, not a notice.
    expect(buildPushContent('voucher_expiring', { product_name: 'x' }, SITE)).toBeNull()
  })

  it('says tomorrow in the title on the last day', () => {
    const content = buildPushContent(
      'voucher_expiring',
      { voucher_id: 'v9', days_remaining: 1, product_name: 'עיסוי', supplier_name: 'ספא' },
      SITE,
    )
    expect(content?.title).toBe('הקופון שלך פג מחר')
    expect(content?.body).toContain('עיסוי')
    expect(content?.body).toContain('ספא')
    expect(content?.data.path).toBe('/coupons/v9')
  })

  it('accepts a numeric string, because jsonb round-trips are not typed', () => {
    const content = buildPushContent('voucher_expiring', { days_remaining: '7' }, SITE)
    expect(content?.title).toBe('הקופון שלך פג בעוד 7 ימים')
  })
})

describe('cashback_credited', () => {
  it('formats agorot as shekels without ever dividing into a float', () => {
    expect(buildPushContent('cashback_credited', { amount_agorot: 1250 }, SITE)?.title).toBe(
      'נכנס לך קאשבק של ₪12.50',
    )
    expect(buildPushContent('cashback_credited', { amount_agorot: 1200 }, SITE)?.title).toBe(
      'נכנס לך קאשבק של ₪12',
    )
    expect(buildPushContent('cashback_credited', { amount_agorot: 5 }, SITE)?.title).toBe(
      'נכנס לך קאשבק של ₪0.05',
    )
  })

  it('sends nothing for a zero or missing credit', () => {
    expect(buildPushContent('cashback_credited', { amount_agorot: 0 }, SITE)).toBeNull()
    expect(buildPushContent('cashback_credited', {}, SITE)).toBeNull()
  })

  it('links the order that earned it, and the wallet when no order is named', () => {
    const content = buildPushContent('cashback_credited', { amount_agorot: 100 }, SITE)
    expect(content?.data.path).toBe('/wallet')
    expect(content?.data.url).toBe('/account/wallet')
    expect(
      buildPushContent('cashback_credited', { amount_agorot: 100, order_id: 'o1' }, SITE)?.data.url,
    ).toBe('/account/orders/o1')
  })
})
