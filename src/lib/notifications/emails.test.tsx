import { parseIls } from '@/lib/money'
import { formatAgorot, formatCouponCode, formatCouponDate } from '@/lib/vouchers/coupon-view'
import { describe, expect, it } from 'vitest'
import * as edgeFormat from '../../../supabase/functions/_shared/emails/format.ts'
import * as edgeMoney from '../../../supabase/functions/_shared/money.ts'
import {
  renderCustomerCouponOrder,
  renderCustomerPhysicalOrder,
  renderSupplierNewOrder,
  renderVoucherExpiring,
} from '../../../supabase/functions/_shared/emails/render.ts'

/**
 * The Edge templates, rendered in CI.
 *
 * These files ship to Deno and are never imported by the Next app, so without
 * this suite nothing would ever compile them: a typo in a template would be
 * discovered by a customer, in an inbox, after a charge. They are imported by
 * relative path because they live outside `src/`, and the bare
 * `@react-email/*` specifiers they use resolve here through node_modules and in
 * production through `supabase/functions/deno.json` — same versions, pinned in
 * both places.
 *
 * The parity block is the other half. `format.ts` and `money.ts` under
 * `_shared` are deliberate twins of modules inside `src/`, because an Edge
 * bundle cannot reach the `@/` alias. A twin that is never compared is a fork,
 * so they are compared here.
 */

const SITE = 'https://kenyonexpress.co.il'

describe('parity with the modules these Edge twins copy', () => {
  const amounts = [0, 1, 99, 100, 2200, 12345, 199_99, -500]

  it('formats money exactly as coupon-view does', () => {
    for (const value of amounts) {
      expect(edgeFormat.formatAgorot(value)).toBe(formatAgorot(value))
    }
    expect(edgeFormat.formatAgorot(null)).toBe(formatAgorot(null))
    expect(edgeFormat.formatAgorot(Number.NaN)).toBe(formatAgorot(Number.NaN))
  })

  it('groups a coupon code exactly as coupon-view does', () => {
    for (const code of ['ABCDEFGHIJ', 'abc-de fgh', '12345', '1234567890123']) {
      expect(edgeFormat.formatCouponCode(code)).toBe(formatCouponCode(code))
    }
  })

  it('formats a date exactly as coupon-view does', () => {
    for (const iso of ['2026-09-03T00:00:00.000Z', '2026-01-31T22:00:00.000Z']) {
      expect(edgeFormat.formatCouponDate(iso)).toBe(formatCouponDate(iso))
    }
    expect(edgeFormat.formatCouponDate(null)).toBe(formatCouponDate(null))
    expect(edgeFormat.formatCouponDate('nonsense')).toBe(formatCouponDate('nonsense'))
  })

  it('converts ILS to agorot exactly as money.ts does, without a float multiply', () => {
    for (const value of ['0', '1', '19.99', '0.05', '1234.50', '-7.25']) {
      expect(edgeMoney.ilsToAgorot(value)).toBe(parseIls(value))
    }
    // The value that makes `x * 100` wrong: 19.99 * 100 is 1998.9999999999998.
    expect(edgeMoney.ilsToAgorot(19.99)).toBe(1999)
  })

  it('answers null where money.ts throws, because a template must still render', () => {
    expect(edgeMoney.ilsToAgorot('nonsense')).toBeNull()
    expect(edgeMoney.ilsToAgorot(null)).toBeNull()
    expect(() => parseIls('nonsense')).toThrow()
  })
})

describe('agorotFromRow', () => {
  it('prefers the integer column over the decimal one', () => {
    expect(edgeMoney.agorotFromRow({ a: 1999, b: '20.00' }, 'a', 'b')).toBe(1999)
  })

  it('falls back to the ILS spelling when the agorot column is absent', () => {
    // The lineage split 095's trigger reads out of to_jsonb for the same reason.
    expect(edgeMoney.agorotFromRow({ total_price_ils: 19.99 }, 'total_price_agorot', 'total_price_ils')).toBe(1999)
  })

  it('is null, not zero, when neither column is readable', () => {
    expect(edgeMoney.agorotFromRow({}, 'a', 'b')).toBeNull()
    expect(edgeMoney.agorotFromRow(null, 'a', 'b')).toBeNull()
  })
})

describe('formatAddress', () => {
  it('reads in the order an Israeli courier does', () => {
    expect(
      edgeFormat.formatAddress({
        street: 'הרצל',
        streetNumber: '12',
        apartment: '4',
        floor: '2',
        entrance: 'ב',
        city: 'תל אביב',
        zip: '6100000',
      }),
    ).toBe('הרצל 12, כניסה ב, קומה 2, דירה 4, תל אביב, 6100000')
  })

  it('never prints the word null for a missing part', () => {
    const line = edgeFormat.formatAddress({ street: 'הרצל', city: 'חיפה' })
    expect(line).toBe('הרצל, חיפה')
    expect(line).not.toContain('null')
    expect(line).not.toContain('undefined')
  })

  it('is empty for no address at all', () => {
    expect(edgeFormat.formatAddress(null)).toBe('')
  })
})

describe('formatDaysRemaining', () => {
  it('uses the Hebrew singular and dual rather than a bare number', () => {
    expect(edgeFormat.formatDaysRemaining(0)).toBe('היום')
    expect(edgeFormat.formatDaysRemaining(1)).toBe('מחר')
    expect(edgeFormat.formatDaysRemaining(2)).toBe('בעוד יומיים')
    expect(edgeFormat.formatDaysRemaining(3)).toBe('בעוד 3 ימים')
  })
})

const COUPON = {
  id: 'v-1',
  code: 'ABCDEFGHIJ',
  productName: 'ארוחה זוגית',
  supplierName: 'מסעדת הים',
  supplierAddress: 'הרצל 12, תל אביב',
  supplierPhone: '03-1234567',
  faceValueAgorot: 20000,
  couponPriceAgorot: 2200,
  remainingDueAgorot: 17800,
  expiresAt: '2026-09-03T00:00:00.000Z',
  offerValidUntil: '2026-12-31T00:00:00.000Z',
  qrCid: 'qr-v-1',
}

describe('CustomerCouponOrder', () => {
  it('carries the code, the balance owed and the deadline', async () => {
    const email = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: 'דנה',
      orderRef: 'AB12CD34',
      vouchers: [COUPON],
    })

    expect(email.subject).toContain('ארוחה זוגית')
    expect(email.html).toContain('ABCDE-FGHIJ')
    expect(email.html).toContain('לתשלום בבית העסק')
    expect(email.html).toContain(formatAgorot(17800))
    expect(email.html).toContain(formatCouponDate(COUPON.expiresAt))
    expect(email.html).toContain('מסעדת הים')
    expect(email.html).toContain('הרצל 12, תל אביב')
    expect(email.html).toContain(`${SITE}/coupon/v-1`)
  })

  it('references the QR by cid, never as a data URI', async () => {
    const email = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: null,
      orderRef: 'AB12CD34',
      vouchers: [COUPON],
    })

    expect(email.html).toContain('cid:qr-v-1')
    // The failure mode the whole attachment design exists to avoid.
    expect(email.html).not.toContain('data:image')
  })

  it('still renders the code when the QR could not be encoded', async () => {
    const email = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: null,
      orderRef: 'AB12CD34',
      vouchers: [{ ...COUPON, qrCid: null }],
    })

    expect(email.html).not.toContain('cid:')
    expect(email.html).toContain('ABCDE-FGHIJ')
    expect(email.html).toContain(`${SITE}/coupon/v-1`)
  })

  it('shows the offer end only when it differs from the deadline', async () => {
    const differs = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: null,
      orderRef: 'AB12CD34',
      vouchers: [COUPON],
    })
    expect(differs.html).toContain('תוקף המבצע')

    const same = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: null,
      orderRef: 'AB12CD34',
      vouchers: [{ ...COUPON, offerValidUntil: COUPON.expiresAt }],
    })
    expect(same.html).not.toContain('תוקף המבצע')
  })

  it('gives every coupon in a basket its own QR handle', async () => {
    const email = await renderCustomerCouponOrder({
      siteUrl: SITE,
      customerName: null,
      orderRef: 'AB12CD34',
      vouchers: [COUPON, { ...COUPON, id: 'v-2', code: 'ZZZZZYYYYY', qrCid: 'qr-v-2' }],
    })

    expect(email.html).toContain('cid:qr-v-1')
    expect(email.html).toContain('cid:qr-v-2')
    expect(email.subject).toContain('2 קופונים')
  })
})

describe('SupplierNewOrder', () => {
  const base = {
    siteUrl: SITE,
    supplierName: 'מסעדת הים',
    orderRef: 'AB12CD34',
    customerName: 'דנה כהן',
    customerPhone: '050-1234567',
    amountAgorot: 15000,
    notes: null,
  }

  it('is a picking slip: what to pack, who it goes to, where', async () => {
    const email = await renderSupplierNewOrder({
      ...base,
      lines: [{ productName: 'כיסא עץ', quantity: 2, productType: 'physical', sku: 'X-1' }],
      shippingAddress: { street: 'הרצל', streetNumber: '12', city: 'תל אביב' },
    })

    expect(email.subject).toContain('הזמנה חדשה למשלוח')
    expect(email.html).toContain('כיסא עץ')
    expect(email.html).toContain('כמות: 2')
    expect(email.html).toContain('דנה כהן')
    expect(email.html).toContain('הרצל 12, תל אביב')
    expect(email.html).toContain(formatAgorot(15000))
  })

  it('omits the shipping block for a coupon-only sale', async () => {
    const email = await renderSupplierNewOrder({
      ...base,
      lines: [{ productName: 'ארוחה זוגית', quantity: 1, productType: 'coupon', sku: null }],
      shippingAddress: null,
    })

    expect(email.subject).toContain('מכירה חדשה')
    expect(email.html).not.toContain('כתובת למשלוח')
  })

  it('says so out loud when a physical line has no address', async () => {
    const email = await renderSupplierNewOrder({
      ...base,
      lines: [{ productName: 'כיסא עץ', quantity: 1, productType: 'physical', sku: null }],
      shippingAddress: null,
    })

    expect(email.html).toContain('כתובת למשלוח')
    expect(email.html).toContain('לא נמסרה כתובת למשלוח')
  })
})

describe('CustomerPhysicalOrder', () => {
  it('leads with the address, because that is what a customer opens it to check', async () => {
    const email = await renderCustomerPhysicalOrder({
      siteUrl: SITE,
      customerName: 'דנה',
      orderId: 'order-1',
      orderRef: 'AB12CD34',
      lines: [{ productName: 'כיסא עץ', quantity: 1, totalAgorot: 19900 }],
      totalAgorot: 19900,
      shippingAddress: { street: 'הרצל', streetNumber: '12', city: 'תל אביב' },
      recipientName: 'דנה כהן',
      recipientPhone: '050-1234567',
    })

    expect(email.subject).toContain('AB12CD34')
    const addressAt = email.html.indexOf('כתובת למשלוח')
    const itemsAt = email.html.indexOf('מה הזמנת')
    expect(addressAt).toBeGreaterThan(-1)
    expect(addressAt).toBeLessThan(itemsAt)
    expect(email.html).toContain('הרצל 12, תל אביב')
    expect(email.html).toContain(`${SITE}/account/orders/order-1`)
  })

  it('promises no delivery date, because the project stores none', async () => {
    const email = await renderCustomerPhysicalOrder({
      siteUrl: SITE,
      customerName: null,
      orderId: 'order-1',
      orderRef: 'AB12CD34',
      lines: [{ productName: 'כיסא עץ', quantity: 1, totalAgorot: null }],
      totalAgorot: null,
      shippingAddress: null,
    })

    expect(email.html).toMatch(/זמן האספקה נקבע על ידי בית העסק/)
    expect(email.html).toContain('לא נשמרה כתובת למשלוח')
  })
})

describe('VoucherExpiring', () => {
  it('puts the days remaining in the subject and the date beside it', async () => {
    const email = await renderVoucherExpiring({
      siteUrl: SITE,
      customerName: null,
      voucherId: 'v-1',
      code: 'ABCDEFGHIJ',
      productName: 'ארוחה זוגית',
      supplierName: 'מסעדת הים',
      supplierAddress: 'הרצל 12',
      supplierPhone: '03-1234567',
      expiresAt: '2026-09-03T00:00:00.000Z',
      daysRemaining: 3,
      remainingDueAgorot: 17800,
    })

    expect(email.subject).toContain('בעוד 3 ימים')
    expect(email.subject).toContain(formatCouponDate('2026-09-03T00:00:00.000Z'))
    expect(email.html).toContain('ABCDE-FGHIJ')
    expect(email.html).toContain(formatAgorot(17800))
    expect(email.html).toContain(`${SITE}/coupon/v-1`)
  })

  it('says מחר rather than "בעוד 1 ימים" on the last day', async () => {
    const email = await renderVoucherExpiring({
      siteUrl: SITE,
      customerName: 'דנה',
      voucherId: 'v-1',
      code: 'ABCDEFGHIJ',
      productName: null,
      supplierName: null,
      supplierAddress: null,
      supplierPhone: null,
      expiresAt: '2026-09-03T00:00:00.000Z',
      daysRemaining: 1,
      remainingDueAgorot: null,
    })

    expect(email.subject).toContain('מחר')
    expect(email.subject).not.toContain('1 ימים')
  })
})

describe('every template, as a message', () => {
  async function all() {
    return [
      await renderCustomerCouponOrder({
        siteUrl: SITE,
        customerName: 'דנה',
        orderRef: 'AB12CD34',
        vouchers: [COUPON],
      }),
      await renderCustomerPhysicalOrder({
        siteUrl: SITE,
        customerName: 'דנה',
        orderId: 'order-1',
        orderRef: 'AB12CD34',
        lines: [{ productName: 'כיסא עץ', quantity: 1, totalAgorot: 19900 }],
        totalAgorot: 19900,
        shippingAddress: { street: 'הרצל', streetNumber: '12', city: 'תל אביב' },
      }),
      await renderSupplierNewOrder({
        siteUrl: SITE,
        supplierName: 'מסעדת הים',
        orderRef: 'AB12CD34',
        customerName: 'דנה',
        customerPhone: null,
        lines: [{ productName: 'כיסא עץ', quantity: 1, productType: 'physical', sku: null }],
        amountAgorot: 15000,
        shippingAddress: { street: 'הרצל', streetNumber: '12', city: 'תל אביב' },
      }),
      await renderVoucherExpiring({
        siteUrl: SITE,
        customerName: 'דנה',
        voucherId: 'v-1',
        code: 'ABCDEFGHIJ',
        productName: 'ארוחה זוגית',
        supplierName: 'מסעדת הים',
        supplierAddress: null,
        supplierPhone: null,
        expiresAt: '2026-09-03T00:00:00.000Z',
        daysRemaining: 3,
        remainingDueAgorot: 17800,
      }),
    ]
  }

  it('is RTL and Hebrew', async () => {
    for (const email of await all()) {
      expect(email.html).toContain('dir="rtl"')
      expect(email.html).toContain('lang="he"')
    }
  })

  it('wears the site brand colour and not the older #f5c518 the src builders use', async () => {
    for (const email of await all()) {
      expect(email.html.toLowerCase()).toContain('#fed700')
      expect(email.html.toLowerCase()).not.toContain('#f5c518')
    }
  })

  it('asks for Heebo and names a real fallback behind it', async () => {
    for (const email of await all()) {
      expect(email.html).toContain('Heebo')
      expect(email.html).toContain('Arial')
    }
  })

  it('carries the logo by absolute URL, with alt text for images-off', async () => {
    for (const email of await all()) {
      expect(email.html).toContain(`${SITE}/logo.png`)
      expect(email.html).toContain('alt="KenyonExpress"')
    }
  })

  it('has a non-empty plain-text alternative, which spam filters score on', async () => {
    for (const email of await all()) {
      expect(email.text.trim().length).toBeGreaterThan(40)
      expect(email.text).not.toContain('<div')
    }
  })

  it('has a subject that is not empty and not a placeholder', async () => {
    for (const email of await all()) {
      expect(email.subject.trim().length).toBeGreaterThan(4)
      expect(email.subject).not.toContain('undefined')
      expect(email.subject).not.toContain('null')
    }
  })

  it('never prints undefined or NaN into the body', async () => {
    for (const email of await all()) {
      expect(email.html).not.toContain('undefined')
      expect(email.html).not.toContain('NaN')
    }
  })
})
