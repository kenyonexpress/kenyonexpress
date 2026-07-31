import {
  buildNotification,
  buildOrderPaidEmail,
  buildSupplierSaleEmail,
  buildVoucherRedeemedEmail,
} from '@/lib/email/notifications'
import { describe, expect, it } from 'vitest'

const SITE = 'https://kenyonexpress.co.il'

describe('buildOrderPaidEmail', () => {
  const payload = {
    order_id: '79f488aa-549a-40dd-af80-eb66d886668f',
    order_ref: '79F488AA',
    customer_name: 'דנה',
    total_agorot: 81_700,
    item_count: 2,
  }

  it('states the reference and the total the customer actually paid', () => {
    const mail = buildOrderPaidEmail(payload, SITE)
    expect(mail.subject).toContain('79F488AA')
    expect(mail.text).toContain('₪817.00')
    expect(mail.html).toContain('₪817.00')
  })

  it('reads the amount as agorot and never divides it a second time', () => {
    // 81700 agorot is ₪817.00. A builder that treated the payload as shekels
    // would say ₪81,700.00, which is the failure this asserts against.
    const mail = buildOrderPaidEmail(payload, SITE)
    expect(mail.text).not.toContain('81,700')
    expect(mail.text).not.toContain('₪8.17')
  })

  it('greets by name when there is one and stays polite when there is not', () => {
    expect(buildOrderPaidEmail(payload, SITE).text).toContain('שלום דנה')
    expect(buildOrderPaidEmail({ ...payload, customer_name: null }, SITE).text).toContain('שלום,')
  })

  it('links the account orders page on the configured origin', () => {
    expect(buildOrderPaidEmail(payload, SITE).html).toContain(
      'https://kenyonexpress.co.il/account/orders',
    )
  })

  it('does not produce a double slash from a trailing slash in the origin', () => {
    const mail = buildOrderPaidEmail(payload, 'https://kenyonexpress.co.il/')
    expect(mail.html).not.toContain('.co.il//account')
  })

  it('survives a payload with nothing in it rather than throwing at send time', () => {
    const mail = buildOrderPaidEmail({}, SITE)
    expect(mail.subject).toBeTruthy()
    expect(mail.text).toContain('₪0.00')
  })
})

describe('buildSupplierSaleEmail', () => {
  const payload = {
    order_id: '79f488aa-549a-40dd-af80-eb66d886668f',
    order_ref: '79F488AA',
    supplier_name: 'טעמים גורמה',
    amount_agorot: 36_000,
    lines: [
      { product_name: 'ארוחה בשרית', quantity: 2, product_type: 'coupon' },
      { product_name: 'קינוח', quantity: 1, product_type: 'physical' },
    ],
  }

  it('lists every line with its quantity, in one email for the supplier', () => {
    const mail = buildSupplierSaleEmail(payload, SITE)
    expect(mail.text).toContain('ארוחה בשרית × 2')
    expect(mail.text).toContain('קינוח × 1')
    expect(mail.html).toContain('טעמים גורמה')
  })

  // The split, the commission and the counter balance are three other numbers.
  // Calling this one a payout in a message to a business starts a dispute.
  it('calls the amount the order value and never a payout', () => {
    const mail = buildSupplierSaleEmail(payload, SITE)
    expect(mail.text).toContain('סכום ההזמנה אצלכם: ₪360.00')
    expect(mail.text).not.toContain('תשלום לספק')
    expect(mail.text).not.toContain('עמלה')
  })

  it('explains the counter step only when a coupon was actually sold', () => {
    expect(buildSupplierSaleEmail(payload, SITE).text).toContain('נגבית מהלקוח במקום')
    const physicalOnly = {
      ...payload,
      lines: [{ product_name: 'קינוח', quantity: 1, product_type: 'physical' }],
    }
    expect(buildSupplierSaleEmail(physicalOnly, SITE).text).not.toContain('נגבית מהלקוח במקום')
  })

  it('treats a missing or malformed line list as no lines, not as a crash', () => {
    const mail = buildSupplierSaleEmail({ ...payload, lines: undefined }, SITE)
    expect(mail.subject).toContain('79F488AA')
  })

  it('never renders a quantity below one', () => {
    const mail = buildSupplierSaleEmail(
      { ...payload, lines: [{ product_name: 'פריט', quantity: 0, product_type: 'physical' }] },
      SITE,
    )
    expect(mail.text).toContain('פריט × 1')
  })
})

describe('buildVoucherRedeemedEmail', () => {
  const payload = {
    voucher_id: '57002c6d-f917-4adc-804e-65e6c4bde594',
    code: 'PRQBE23456',
    product_name: 'ארוחה בשרית',
    supplier_name: 'טעמים גורמה',
    redeemed_at: '2026-07-31T16:06:38.997Z',
    collected_agorot: 18_000,
  }

  it('says what was redeemed, where, and how much was collected', () => {
    const mail = buildVoucherRedeemedEmail(payload, SITE)
    expect(mail.subject).toContain('ארוחה בשרית')
    expect(mail.text).toContain('טעמים גורמה')
    expect(mail.text).toContain('₪180.00')
  })

  it('groups the code the way the counter reads it aloud', () => {
    expect(buildVoucherRedeemedEmail(payload, SITE).text).toContain('PRQBE-23456')
  })

  // Its second job is security: this is how somebody learns a coupon they still
  // hold was redeemed by somebody else.
  it('tells the customer what to do if it was not them', () => {
    const mail = buildVoucherRedeemedEmail(payload, SITE)
    expect(mail.text).toContain('אם לא אתם מימשתם')
    expect(mail.html).toContain('אם לא אתם מימשתם')
  })

  it('omits an unparseable timestamp instead of printing Invalid Date', () => {
    const mail = buildVoucherRedeemedEmail({ ...payload, redeemed_at: 'not-a-date' }, SITE)
    expect(mail.text).not.toContain('Invalid')
    expect(mail.html).not.toContain('Invalid')
  })

  it('drops the collected line for a fully prepaid coupon rather than showing zero', () => {
    const mail = buildVoucherRedeemedEmail({ ...payload, collected_agorot: 0 }, SITE)
    expect(mail.text).not.toContain('נגבה בבית העסק')
  })
})

describe('buildNotification', () => {
  it('dispatches each kind the outbox CHECK constraint allows', () => {
    for (const kind of ['order_paid', 'supplier_sale', 'voucher_redeemed']) {
      expect(buildNotification(kind, {}, SITE)).not.toBeNull()
    }
  })

  // The drain parks an unrenderable row immediately instead of retrying it
  // five times, which is only correct if this reports the gap rather than
  // inventing an email for it.
  it('returns null for a kind it has no template for', () => {
    expect(buildNotification('marketing_blast', {}, SITE)).toBeNull()
  })

  it('escapes markup coming out of the database', () => {
    const mail = buildNotification(
      'supplier_sale',
      { supplier_name: '<script>alert(1)</script>', lines: [] },
      SITE,
    )
    expect(mail?.html).not.toContain('<script>')
    expect(mail?.html).toContain('&lt;script&gt;')
  })
})
