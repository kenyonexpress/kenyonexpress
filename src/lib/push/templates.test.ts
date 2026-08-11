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

  it('lists exactly the three transactional kinds', () => {
    expect([...PUSHABLE_KINDS]).toEqual(['voucher_issued', 'voucher_expiring', 'cashback_credited'])
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
