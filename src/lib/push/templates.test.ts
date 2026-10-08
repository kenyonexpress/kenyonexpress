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
    expect(buildPushContent('order_paid', { order_id: 'o1' }, SITE)).toBeNull()
    expect(buildPushContent('voucher_redeemed', {}, SITE)).toBeNull()
    expect(buildPushContent('anything_new', {}, SITE)).toBeNull()
  })

  it('lists exactly the seven kinds that may reach a lock screen', () => {
    // A deliberate diff. The outbox carries every notification the system owes,
    // including supplier and admin alerts, and this list is the gate that keeps
    // them off a customer's phone.
    expect([...PUSHABLE_KINDS]).toEqual([
      'voucher_issued',
      'voucher_expiring',
      'cashback_credited',
      'order_shipped',
      'order_delivered',
      'price_drop',
      'back_in_stock',
    ])
    for (const kind of PUSHABLE_KINDS) {
      expect(buildPushContent(kind, {}, SITE)).not.toBeUndefined()
    }
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
    expect(content?.data.url).toBe('https://kenyonexpress.co.il/account/coupons')
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
    expect(content?.body).toBe('הקופון שלך מוכן ומחכה באפליקציה.')
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

  it('links into the wallet', () => {
    const content = buildPushContent('cashback_credited', { amount_agorot: 100 }, SITE)
    expect(content?.data.path).toBe('/wallet')
    expect(content?.data.url).toBe('https://kenyonexpress.co.il/account/wallet')
  })
})

describe('order_delivered', () => {
  it('says the order arrived and links to that order', () => {
    const content = buildPushContent(
      'order_delivered',
      { order_id: 'o-77', order_ref: 'O-77', item_count: 3 },
      SITE,
    )
    expect(content?.title).toBe('ההזמנה שלך נמסרה')
    expect(content?.body).toContain('3 הפריטים שהזמנת')
    expect(content?.data.path).toBe('/orders/o-77')
    expect(content?.data.url).toBe('https://kenyonexpress.co.il/account/orders/o-77')
  })

  it('uses the dual and the singular, like a person would', () => {
    expect(buildPushContent('order_delivered', { item_count: 1 }, SITE)?.body).toContain(
      'הפריט שהזמנת אצלך',
    )
    expect(buildPushContent('order_delivered', { item_count: 2 }, SITE)?.body).toContain(
      'שני הפריטים שהזמנת אצלך',
    )
  })

  it('still sends with no item count rather than inventing one', () => {
    const content = buildPushContent('order_delivered', {}, SITE)
    expect(content?.body).toContain('ההזמנה אצלך')
    expect(content?.data.path).toBe('/')
  })

  it('shares a tag with order_shipped so delivered replaces shipped on the lock screen', () => {
    const shipped = buildPushContent('order_shipped', { order_id: 'o-77' }, SITE)
    const delivered = buildPushContent('order_delivered', { order_id: 'o-77' }, SITE)
    expect(shipped?.data.tag).toBe('order:o-77')
    expect(delivered?.data.tag).toBe('order:o-77')
  })
})

describe('back_in_stock', () => {
  it('names the product, quotes the integer price and deep-links to it', () => {
    const content = buildPushContent(
      'back_in_stock',
      { product_name: 'תיק גב', slug: 'backpack', product_id: 'p9', price_agorot: 15000 },
      SITE,
    )
    expect(content?.title).toBe('תיק גב חזר למלאי')
    expect(content?.body).toBe('המחיר עכשיו ₪150. הכמות מוגבלת.')
    expect(content?.data.url).toBe(`${SITE}/product/backpack`)
    expect(content?.data.tag).toBe('back-in-stock:p9')
  })

  it('refuses a payload with no product name, and copes without a price', () => {
    expect(buildPushContent('back_in_stock', { price_agorot: 100 }, SITE)).toBeNull()
    const noPrice = buildPushContent('back_in_stock', { product_name: 'תיק' }, SITE)
    expect(noPrice?.body).toBe('הכמות מוגבלת, כדאי להזדרז.')
    expect(noPrice?.data.url).toBe(`${SITE}/products`)
  })
})

describe('tags', () => {
  it('stamps one per object so re-sends collapse instead of stacking', () => {
    expect(
      buildPushContent('price_drop', { saved_agorot: 100, now_agorot: 50, product_id: 'p1' }, SITE)
        ?.data.tag,
    ).toBe('price-drop:p1')
    expect(
      buildPushContent('cashback_credited', { amount_agorot: 100, order_id: 'o1' }, SITE)?.data.tag,
    ).toBe('cashback:o1')
    expect(
      buildPushContent('voucher_expiring', { days_remaining: 3, voucher_id: 'v1' }, SITE)?.data.tag,
    ).toBe('voucher-expiring:v1')
  })

  it('omits the tag when the object is unknown, rather than sending one that collapses everything', () => {
    expect(buildPushContent('order_shipped', {}, SITE)?.data).not.toHaveProperty('tag')
    expect(
      buildPushContent('cashback_credited', { amount_agorot: 100 }, SITE)?.data,
    ).not.toHaveProperty('tag')
  })
})
