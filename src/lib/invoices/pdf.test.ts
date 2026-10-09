import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { bidiVisual, formatAmountForPdf, renderInvoicePdf } from './pdf'

/**
 * The renderer draws through pdf-lib, which has no bidi pass - the same gap
 * that shipped every Satori-rendered Hebrew OG card backwards with a 200 and
 * a valid PNG. `bidiVisual` is the whole defence, so it is held still here
 * character by character, and the render itself is proven to produce a real,
 * reloadable PDF rather than merely bytes.
 */

describe('bidiVisual', () => {
  it('reverses pure Hebrew', () => {
    expect(bidiVisual('שלום')).toBe('םולש')
  })

  it('keeps pure LTR strings untouched', () => {
    expect(bidiVisual('KE-INV-000042')).toBe('KE-INV-000042')
  })

  it('keeps a number with its annotations as one LTR unit inside RTL text', () => {
    // The percent and the currency sign travel with their digits; without
    // that, the amount reads backwards on the printed page.
    expect(bidiVisual('מע"מ 18%')).toBe('18% מ"עמ')
    expect(bidiVisual('סה"כ ₪90.00')).toBe('₪90.00 כ"הס')
  })

  it('mirrors paired brackets when reversing an RTL run', () => {
    // Reversing flips the paren order; mirroring the glyphs is what keeps the
    // pair pointing the right way visually.
    expect(bidiVisual('קופון (יתרה)')).toBe('(הרתי) ןופוק')
  })

  it('resolves neutrals between agreeing neighbours to that side', () => {
    // The space between two Hebrew words is part of the Hebrew run.
    expect(bidiVisual('ארוחה זוגית')).toBe('תיגוז החורא')
  })
})

describe('formatAmountForPdf', () => {
  it('formats agorot as shekels with grouping', () => {
    expect(formatAmountForPdf(9_000)).toBe('₪90.00')
    expect(formatAmountForPdf(123_456_789)).toBe('₪1,234,567.89')
    expect(formatAmountForPdf(5)).toBe('₪0.05')
  })

  it('keeps the sign attached', () => {
    expect(formatAmountForPdf(-1_000)).toBe('-₪10.00')
  })

  it('refuses non-integer money, like everything on this path', () => {
    expect(() => formatAmountForPdf(90.5)).toThrow(TypeError)
  })
})

const ISSUER = {
  accountId: 'platform',
  businessName: 'KenyonExpress',
  taxId: '515000000',
  address: 'תל אביב',
}

function baseInput() {
  return {
    documentType: 'tax_invoice_receipt' as const,
    documentNumber: 'KE-INV-000042',
    providerDocumentNumber: 'A-4471',
    issuedAt: new Date('2026-09-10T12:00:00Z'),
    issuer: ISSUER,
    customer: { name: 'דנה כהן', email: 'dana@example.com', phone: '0501234567' },
    lines: [
      {
        description: 'ארוחה זוגית — קופון (יתרה לתשלום בבית העסק)',
        quantity: 2,
        unitPriceAgorot: agorot(5_000),
        totalAgorot: agorot(10_000),
      },
      {
        description: 'זיכוי מיתרת הארנק',
        quantity: 1,
        unitPriceAgorot: agorot(-1_000),
        totalAgorot: agorot(-1_000),
      },
    ],
    totalAgorot: 9_000,
    netAgorot: 7_627,
    vatAgorot: 1_373,
    vatPercent: 18,
    reference: '11111111-1111-4111-8111-111111111111',
  }
}

describe('renderInvoicePdf', () => {
  it('produces a reloadable one-page PDF with the Hebrew font embedded', async () => {
    const bytes = await renderInvoicePdf(baseInput())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    // Reloading through pdf-lib is the cheapest structural proof there is:
    // a truncated or mis-encoded document refuses to parse.
    const { PDFDocument } = await import('pdf-lib')
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(1)

    // An embedded font subset dwarfs an empty page; a document this small
    // would mean the Hebrew never made it in.
    expect(bytes.length).toBeGreaterThan(10_000)
  })

  it('renders every document type, including the VAT-silent coupon receipt', async () => {
    for (const documentType of ['coupon_receipt', 'credit_note'] as const) {
      const bytes = await renderInvoicePdf({
        ...baseInput(),
        documentType,
        lines: [
          {
            description: 'ארוחה זוגית — קופון',
            quantity: 1,
            unitPriceAgorot: agorot(9_000),
            totalAgorot: agorot(9_000),
          },
        ],
        netAgorot: documentType === 'coupon_receipt' ? 9_000 : 7_627,
        vatAgorot: documentType === 'coupon_receipt' ? 0 : 1_373,
      })
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    }
  })

  it('truncates an over-long description instead of colliding with the numbers', async () => {
    const bytes = await renderInvoicePdf({
      ...baseInput(),
      lines: [
        {
          description: `מוצר עם שם ארוך במיוחד ${'שחוזר על עצמו '.repeat(20)}`,
          quantity: 1,
          unitPriceAgorot: agorot(9_000),
          totalAgorot: agorot(9_000),
        },
      ],
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('spills a long order onto a second page instead of drawing below the margin', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({
      description: `פריט ${i + 1}`,
      quantity: 1,
      unitPriceAgorot: agorot(150),
      totalAgorot: agorot(150),
    }))
    const bytes = await renderInvoicePdf({
      ...baseInput(),
      lines,
      totalAgorot: 9_000,
    })
    const { PDFDocument } = await import('pdf-lib')
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBeGreaterThan(1)
  })
})
