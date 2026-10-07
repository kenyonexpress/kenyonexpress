import { describe, expect, it } from 'vitest'
import {
  buildReturnReceivedCustomerNotice,
  buildReturnReceivedOwnerNotice,
  buildReturnRejectedNotice,
} from './notices'

const base = {
  rma: 'RMA-261008-8F3C2A1B',
  orderRef: 'ABCD1234',
  reasonCode: 'changed_mind' as const,
  destination: 'original_method' as const,
  note: null,
  requestedAgorot: 10_000,
  feeAgorot: 500,
  refundAgorot: 9_500,
  hasPhysical: true,
  refundDueBy: '2026-10-22T10:00:00.000Z',
  customerName: 'דנה',
  customerEmail: 'dana@example.com',
  appUrl: 'https://kenyonexpress.co.il',
}

describe('the customer’s receipt of the request', () => {
  it('names the RMA in the subject and keys idempotency on it', () => {
    const notice = buildReturnReceivedCustomerNotice(base)
    expect(notice.subject).toContain('RMA-261008-8F3C2A1B')
    expect(notice.idempotencyKey).toBe('return-received:RMA-261008-8F3C2A1B')
  })

  it('states the fee, the expected refund and the statutory deadline', () => {
    const { text } = buildReturnReceivedCustomerNotice(base)
    expect(text).toContain('דמי ביטול')
    expect(text).toContain('95.00')
    expect(text).toContain('100.00')
    expect(text).toContain('14 יום')
    expect(text).toContain('/account/return')
  })

  it('says no fee on store credit and skips the parcel line for a coupon', () => {
    const { text } = buildReturnReceivedCustomerNotice({
      ...base,
      destination: 'wallet',
      feeAgorot: 0,
      refundAgorot: 10_000,
      hasPhysical: false,
    })
    expect(text).toContain('ללא דמי ביטול')
    expect(text).not.toContain('הוראות להחזרת המוצר')
  })

  it('tells a physical-goods customer not to ship before instructions', () => {
    const { text } = buildReturnReceivedCustomerNotice(base)
    expect(text).toContain('אין צורך לשלוח דבר')
  })

  it('escapes the customer’s note in the HTML body', () => {
    const { html, text } = buildReturnReceivedCustomerNotice({ ...base, note: '<b>x</b>' })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).not.toContain('<b>x</b>')
    expect(text).toContain('<b>x</b>')
    expect(html).toContain('dir="rtl"')
  })
})

describe('the owner’s copy', () => {
  it('carries who asked and links the admin queue', () => {
    const notice = buildReturnReceivedOwnerNotice(base)
    expect(notice.text).toContain('דנה')
    expect(notice.text).toContain('dana@example.com')
    expect(notice.text).toContain('/admin/orders/returns')
    expect(notice.idempotencyKey).toBe('return-received-owner:RMA-261008-8F3C2A1B')
  })
})

describe('the rejection', () => {
  it('quotes the admin’s reason and offers a way to contest', () => {
    const notice = buildReturnRejectedNotice({
      rma: base.rma,
      orderRef: base.orderRef,
      reason: 'המוצר הוחזר אחרי 14 יום',
      customerName: null,
      appUrl: base.appUrl,
    })
    expect(notice.subject).toContain('לא אושרה')
    expect(notice.text).toContain('המוצר הוחזר אחרי 14 יום')
    expect(notice.text).toContain('/contact')
    expect(notice.idempotencyKey).toBe('return-rejected:RMA-261008-8F3C2A1B')
  })
})
