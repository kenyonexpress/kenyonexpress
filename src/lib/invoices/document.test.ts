import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VAT_PERCENT,
  buildInvoiceDocument,
  buildOrderInvoiceLines,
  resolveVatPercent,
  splitVatInclusive,
} from './document'

/**
 * The document, before anything is sent anywhere.
 *
 * The wire format of Cardcom's document module could not be measured from this
 * machine ([55](ג): no credentials, and `InvoiceHead`/`InvoiceLines` appear in
 * no document in this repo), so this file is where the feature is actually
 * pinned down: what a document SAYS, and what it refuses to say.
 */
describe('splitVatInclusive', () => {
  it('extracts VAT from a VAT-inclusive total rather than adding it', () => {
    // ₪118.00 at 18% is ₪100.00 + ₪18.00, not ₪118 + ₪21.24.
    expect(splitVatInclusive(11_800, 18)).toEqual({ netAgorot: 10_000, vatAgorot: 1_800 })
  })

  it('always splits into two integers that add back to the total', () => {
    for (const total of [1, 7, 99, 333, 1_234, 99_999, 1_000_001]) {
      const { netAgorot, vatAgorot } = splitVatInclusive(total, 18)
      expect(Number.isSafeInteger(netAgorot)).toBe(true)
      expect(Number.isSafeInteger(vatAgorot)).toBe(true)
      // This is the invariant the CHECK on `invoices` enforces in the database.
      expect(netAgorot + vatAgorot).toBe(total)
    }
  })

  it('handles the rate change: the same total splits differently at 17', () => {
    expect(splitVatInclusive(11_700, 17)).toEqual({ netAgorot: 10_000, vatAgorot: 1_700 })
    expect(splitVatInclusive(11_700, 18).vatAgorot).toBe(1_785)
  })

  it('refuses a non-integer total, because agorot are the unit', () => {
    expect(() => splitVatInclusive(100.5, 18)).toThrow(TypeError)
  })
})

describe('resolveVatPercent', () => {
  it('defaults to the standard rate when unset', () => {
    expect(resolveVatPercent({} as unknown as NodeJS.ProcessEnv)).toBe(DEFAULT_VAT_PERCENT)
    expect(resolveVatPercent({ INVOICE_VAT_PERCENT: '  ' } as unknown as NodeJS.ProcessEnv)).toBe(
      DEFAULT_VAT_PERCENT,
    )
  })

  it('takes an override, so a rate change is a variable and not a deploy', () => {
    expect(resolveVatPercent({ INVOICE_VAT_PERCENT: '17' } as unknown as NodeJS.ProcessEnv)).toBe(
      17,
    )
  })

  it('throws on nonsense instead of falling back', () => {
    // A silent fallback would issue every document of the day at the wrong rate
    // and nothing would say so.
    expect(() =>
      resolveVatPercent({ INVOICE_VAT_PERCENT: 'ten' } as unknown as NodeJS.ProcessEnv),
    ).toThrow()
    expect(() =>
      resolveVatPercent({ INVOICE_VAT_PERCENT: '120' } as unknown as NodeJS.ProcessEnv),
    ).toThrow()
  })
})

describe('buildInvoiceDocument', () => {
  const customer = { name: 'דנה', email: 'dana@example.com', phone: '0500000000' }

  it('builds a document whose lines add up to the money that moved', () => {
    const doc = buildInvoiceDocument({
      documentType: 'tax_invoice_receipt',
      customer,
      lines: [
        { description: 'ספא', quantity: 2, totalAgorot: 10_000 },
        { description: 'זיכוי מיתרת הארנק', quantity: 1, totalAgorot: -1_000 },
      ],
      chargedAgorot: 9_000,
      reference: 'order-1',
    })

    expect(doc.totalAgorot).toBe(9_000)
    expect(doc.netAgorot + doc.vatAgorot).toBe(9_000)
    expect(doc.lines[0]).toMatchObject({ quantity: 2, unitPriceAgorot: 5_000, totalAgorot: 10_000 })
  })

  it('REFUSES when the lines do not sum to the charge', () => {
    // The whole point. This runs after the card has been charged, so the only
    // alternative to refusing is issuing a tax document that misstates a sale.
    expect(() =>
      buildInvoiceDocument({
        documentType: 'tax_invoice_receipt',
        customer,
        lines: [{ description: 'ספא', quantity: 1, totalAgorot: 10_000 }],
        chargedAgorot: 9_000,
        reference: 'order-1',
      }),
    ).toThrow(/9000 was charged/)
  })

  it('prints one unit at the line total when the quantity does not divide it', () => {
    // 999 over 2 units is 499.5 agorot each, and a printed unit price that does
    // not multiply back to the line is a document a reader cannot check.
    const doc = buildInvoiceDocument({
      documentType: 'tax_invoice_receipt',
      customer,
      lines: [{ description: 'פריט', quantity: 2, totalAgorot: 999 }],
      chargedAgorot: 999,
      reference: 'order-1',
    })
    expect(doc.lines[0]).toMatchObject({ quantity: 1, unitPriceAgorot: 999, totalAgorot: 999 })
  })

  it('refuses a zero or negative document total', () => {
    for (const chargedAgorot of [0, -100]) {
      expect(() =>
        buildInvoiceDocument({
          documentType: 'credit_note',
          customer,
          lines: [{ description: 'זיכוי', quantity: 1, totalAgorot: chargedAgorot }],
          chargedAgorot,
          reference: 'order-1',
        }),
      ).toThrow(RangeError)
    }
  })

  it('keeps the rate it was given, so a reprint is not recomputed at a new one', () => {
    const doc = buildInvoiceDocument({
      documentType: 'tax_invoice_receipt',
      customer,
      lines: [{ description: 'ספא', quantity: 1, totalAgorot: 11_700 }],
      chargedAgorot: 11_700,
      vatPercent: 17,
      reference: 'order-1',
    })
    expect(doc.vatPercent).toBe(17)
    expect(doc.vatAgorot).toBe(1_700)
  })
})

describe('buildOrderInvoiceLines', () => {
  it('says what a coupon line is instead of showing a price nobody paid', () => {
    const lines = buildOrderInvoiceLines({
      lines: [
        {
          productName: 'ארוחה זוגית',
          productType: 'coupon',
          quantity: 1,
          paidOnSiteAgorot: 5_000,
          balanceDueAgorot: 7_000,
        },
      ],
      walletAppliedAgorot: 0,
      discountAgorot: 0,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.description).toContain('יתרה לתשלום בבית העסק')
    expect(lines[0]?.totalAgorot).toBe(5_000)
  })

  it('names the wallet credit and the discount separately, and last', () => {
    const lines = buildOrderInvoiceLines({
      lines: [
        {
          productName: 'מגבת',
          productType: 'physical',
          quantity: 3,
          paidOnSiteAgorot: 9_000,
          balanceDueAgorot: 0,
        },
      ],
      walletAppliedAgorot: 1_000,
      discountAgorot: 500,
    })
    expect(lines.map((l) => l.totalAgorot)).toEqual([9_000, -500, -1_000])
    // Naming them keeps the item at the price the customer was actually
    // charged for it; folding them into the item would misstate the product.
    expect(lines[1]?.description).toBe('הנחת מבצע')
    expect(lines[2]?.description).toBe('זיכוי מיתרת הארנק')
  })

  it('drops a line that took no money on the site', () => {
    const lines = buildOrderInvoiceLines({
      lines: [
        {
          productName: 'קופון 100% בבית העסק',
          productType: 'coupon',
          quantity: 1,
          paidOnSiteAgorot: 0,
          balanceDueAgorot: 12_000,
        },
      ],
      walletAppliedAgorot: 0,
      discountAgorot: 0,
    })
    expect(lines).toEqual([])
  })

  it('an order with a wallet credit and a discount still adds up to the charge', () => {
    const paidOnSite = 9_000
    const wallet = 1_000
    const discount = 500
    const charged = paidOnSite - wallet - discount
    const doc = buildInvoiceDocument({
      documentType: 'tax_invoice_receipt',
      customer: { name: null, email: null, phone: null },
      lines: buildOrderInvoiceLines({
        lines: [
          {
            productName: 'מגבת',
            productType: 'physical',
            quantity: 1,
            paidOnSiteAgorot: paidOnSite,
            balanceDueAgorot: 0,
          },
        ],
        walletAppliedAgorot: wallet,
        discountAgorot: discount,
      }),
      chargedAgorot: charged,
      reference: 'order-1',
    })
    expect(doc.totalAgorot).toBe(7_500)
  })
})
