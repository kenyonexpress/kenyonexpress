import { agorot } from '@/lib/money'
import type { OrderDetail } from '@/server/queries/orders'
import { describe, expect, it } from 'vitest'
import {
  OrderNotPaidError,
  buildOrderReceipt,
  receiptFileName,
  renderOrderReceiptPdf,
} from './receipt-pdf'

const ISSUER = {
  accountId: 'platform',
  businessName: 'KenyonExpress',
  taxId: '515000000',
  address: 'תל אביב',
}

const CUSTOMER = { name: 'דנה כהן', email: 'dana@example.com', phone: '0501234567' }

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'paid',
    settlementStatus: 'paid',
    createdAt: '2026-09-10T11:58:00Z',
    paidAt: '2026-09-10T12:00:00Z',
    subtotalAgorot: agorot(55_000),
    totalAgorot: agorot(54_000),
    walletAppliedAgorot: agorot(1_000),
    addressId: 'addr-1',
    invoice: { documentNumber: 'KE-INV-000042', issuedAt: '2026-09-10T12:01:00Z' },
    lines: [
      {
        id: 'line-1',
        productId: 'p1',
        productName: 'ארוחה זוגית',
        productSlug: 'meal',
        productImage: null,
        productType: 'coupon',
        quantity: 1,
        unitPriceAgorot: agorot(15_000),
        totalAgorot: agorot(15_000),
        paidOnSiteAgorot: agorot(4_000),
        balanceDueAgorot: agorot(11_000),
        settlementStatus: 'paid',
        itemStatus: 'issued',
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
        supplier: null,
        vouchers: [
          {
            code: '12345678',
            status: 'issued',
            expiresAt: '2026-12-10T00:00:00Z',
            collectAmountAgorot: agorot(11_000),
            faceValueAgorot: agorot(15_000),
            qrDataUrl: null,
            usedAt: null,
          },
        ],
      },
      {
        id: 'line-2',
        productId: 'p2',
        productName: 'מכונת קפה',
        productSlug: 'coffee',
        productImage: null,
        productType: 'physical',
        quantity: 2,
        unitPriceAgorot: agorot(20_000),
        totalAgorot: agorot(40_000),
        paidOnSiteAgorot: agorot(40_000),
        // A physical line never carries a balance; a stray value must not print.
        balanceDueAgorot: agorot(500),
        settlementStatus: 'paid',
        itemStatus: 'paid',
        carrier: null,
        trackingNumber: null,
        shippedAt: null,
        deliveredAt: null,
        supplier: null,
        vouchers: [],
      },
    ],
    ...overrides,
  }
}

describe('buildOrderReceipt', () => {
  it('maps the order the account page shows into the printed receipt', () => {
    const receipt = buildOrderReceipt(detail(), {
      issuer: ISSUER,
      customer: CUSTOMER,
      shippingAddress: {
        street: 'דיזנגוף',
        street_number: '12',
        apartment: '4',
        floor: null,
        city: 'תל אביב',
        zip: '6473424',
      },
    })
    expect(receipt.reference).toBe('11111111')
    expect(receipt.paidAt.toISOString()).toBe('2026-09-10T12:00:00.000Z')
    expect(receipt.subtotalAgorot).toBe(55_000)
    expect(receipt.walletAppliedAgorot).toBe(1_000)
    expect(receipt.totalAgorot).toBe(54_000)
    expect(receipt.invoiceNumber).toBe('KE-INV-000042')
    expect(receipt.shippingAddress).toBe('דיזנגוף 12, דירה 4, תל אביב, 6473424')
    expect(receipt.lines.map((l) => l.voucherCodes)).toEqual([['12345678'], []])
  })

  it('sums the balance owed at the business from coupon lines only', () => {
    const receipt = buildOrderReceipt(detail(), { issuer: ISSUER, customer: CUSTOMER })
    expect(receipt.balanceDueAtBusinessAgorot).toBe(11_000)
    expect(receipt.lines[1]?.balanceDueAgorot).toBe(0)
  })

  it('prints no shipping address on a coupon-only order', () => {
    const couponOnly = detail({ lines: detail().lines.slice(0, 1) })
    const receipt = buildOrderReceipt(couponOnly, {
      issuer: ISSUER,
      customer: CUSTOMER,
      shippingAddress: { street: 'דיזנגוף', street_number: '12', city: 'תל אביב' },
    })
    expect(receipt.shippingAddress).toBeNull()
  })

  it('refuses an unpaid order, because a receipt says money moved', () => {
    expect(() =>
      buildOrderReceipt(detail({ paidAt: null }), { issuer: ISSUER, customer: CUSTOMER }),
    ).toThrow(OrderNotPaidError)
  })

  it('names the file by the order reference', () => {
    expect(receiptFileName('11111111-1111-4111-8111-111111111111')).toBe(
      'kenyonexpress-receipt-11111111.pdf',
    )
  })
})

describe('renderOrderReceiptPdf', () => {
  it('produces a reloadable one-page PDF with the Hebrew font embedded', async () => {
    const receipt = buildOrderReceipt(detail(), {
      issuer: ISSUER,
      customer: CUSTOMER,
      shippingAddress: { street: 'דיזנגוף', street_number: '12', city: 'תל אביב' },
    })
    const bytes = await renderOrderReceiptPdf(receipt)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const { PDFDocument } = await import('pdf-lib')
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(1)
    expect(reloaded.getTitle()).toBe('אישור הזמנה 11111111')
    // An embedded font subset dwarfs an empty page.
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it('spills a long order onto a second page instead of drawing below the margin', async () => {
    const base = detail()
    const firstLine = base.lines[1]
    if (!firstLine) throw new Error('fixture')
    const lines = Array.from({ length: 60 }, (_, i) => ({
      ...firstLine,
      id: `line-${i}`,
      productName: `פריט ${i + 1}`,
    }))
    const receipt = buildOrderReceipt(detail({ lines }), { issuer: ISSUER, customer: CUSTOMER })
    const bytes = await renderOrderReceiptPdf(receipt)
    const { PDFDocument } = await import('pdf-lib')
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBeGreaterThan(1)
  })
})
