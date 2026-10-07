import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import {
  bidiVisual,
  composeInvoiceText,
  formatAmountForPdf,
  formatDateTimeForPdf,
  invoicePdfFileName,
  renderInvoicePdf,
} from './pdf'

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

/**
 * What the document SAYS, held still as strings. pdf-lib cannot read text
 * back out of a page, so the legal content - the marking, the number, the
 * VAT lines, the reference - is asserted on the composed model the renderer
 * draws from, and the render below only proves the bytes are a real PDF.
 */
describe('composeInvoiceText', () => {
  it('marks the first rendering as the original and every later one as a copy', () => {
    expect(composeInvoiceText(baseInput()).copyLabel).toBe('מקור')
    expect(composeInvoiceText({ ...baseInput(), copy: 'original' }).copyLabel).toBe('מקור')
    expect(composeInvoiceText({ ...baseInput(), copy: 'copy' }).copyLabel).toBe('העתק')
  })

  it('titles the document with its own sequential number', () => {
    expect(composeInvoiceText(baseInput()).title).toBe('חשבונית מס/קבלה KE-INV-000042')
    expect(
      composeInvoiceText({
        ...baseInput(),
        documentType: 'credit_note',
        documentNumber: 'KE-CRN-000003',
      }).title,
    ).toBe('חשבונית זיכוי KE-CRN-000003')
  })

  it('carries the issuer registration, the issue date in Israel and the order reference', () => {
    const text = composeInvoiceText(baseInput())
    expect(text.issuerLines).toEqual(['KenyonExpress', 'עוסק מורשה/ח.פ 515000000', 'תל אביב'])
    // 12:00Z on 10.09 is 15:00 in Jerusalem, same day.
    expect(text.metaLines).toContain('תאריך הפקה: 10.09.2026')
    expect(text.metaLines).toContain('הזמנה: 11111111')
    expect(text.metaLines).toContain('מסמך סולק: A-4471')
  })

  it('omits the tax-id and address lines an issuer does not have, rather than printing blanks', () => {
    const text = composeInvoiceText({
      ...baseInput(),
      issuer: { ...ISSUER, taxId: null, address: null },
    })
    expect(text.issuerLines).toEqual(['KenyonExpress'])
  })

  it('states the means of payment and the clearing reference on the receipt half', () => {
    const text = composeInvoiceText({
      ...baseInput(),
      payment: { method: 'card', transactionId: 'deal-77' },
    })
    expect(text.metaLines).toContain('אמצעי תשלום: כרטיס אשראי')
    expect(text.metaLines).toContain('אסמכתת סליקה: deal-77')
    expect(text.notes).toContain('התקבל בתשלום מלא. מסמך זה משמש גם כקבלה.')
  })

  it('breaks the gross into net, VAT at the stored rate, and total on a tax invoice', () => {
    const text = composeInvoiceText(baseInput())
    expect(text.totals).toEqual([
      { label: 'סה"כ לפני מע"מ', valueAgorot: 7_627, emphasis: false },
      { label: 'מע"מ 18%', valueAgorot: 1_373, emphasis: false },
      { label: 'סה"כ כולל מע"מ', valueAgorot: 9_000, emphasis: true },
    ])
  })

  it('states no VAT on a coupon receipt and says why', () => {
    const text = composeInvoiceText({
      ...baseInput(),
      documentType: 'coupon_receipt',
      netAgorot: 9_000,
      vatAgorot: 0,
    })
    expect(text.totals).toEqual([{ label: 'סה"כ ששולם', valueAgorot: 9_000, emphasis: true }])
    expect(text.notes).toContain('קבלה על תשלום מראש. אינה חשבונית מס.')
  })

  it('names the invoice a credit note reverses, and says so when it cannot', () => {
    const named = composeInvoiceText({
      ...baseInput(),
      documentType: 'credit_note',
      documentNumber: 'KE-CRN-000001',
      relatedDocumentNumber: 'KE-INV-000042',
      payment: { method: 'card', transactionId: 'deal-77' },
    })
    expect(named.metaLines).toContain('כנגד חשבונית מס/קבלה KE-INV-000042')
    expect(named.metaLines).toContain('הוחזר ל: כרטיס אשראי')
    expect(named.totals.at(-1)).toEqual({ label: 'סה"כ זיכוי', valueAgorot: 9_000, emphasis: true })

    const unnamed = composeInvoiceText({
      ...baseInput(),
      documentType: 'credit_note',
      relatedDocumentNumber: null,
    })
    expect(unnamed.metaLines).toContain('כנגד תשלום שהוחזר ללקוח/ה')
  })

  it('declares itself a computerized document and dates the printout, not the issue', () => {
    const text = composeInvoiceText({
      ...baseInput(),
      generatedAt: new Date('2026-10-08T07:30:00Z'),
    })
    expect(text.footerLines[0]).toBe('מסמך ממוחשב')
    expect(text.footerLines[1]).toBe('הופק ב-08.10.2026 10:30')
    expect(formatDateTimeForPdf(new Date('2026-09-10T12:00:00Z'))).toBe('10.09.2026 15:00')
  })

  it('lays every line out as description, quantity, unit price and total', () => {
    const text = composeInvoiceText(baseInput())
    expect(text.rows[0]).toEqual({
      description: 'ארוחה זוגית — קופון (יתרה לתשלום בבית העסק)',
      quantity: '2',
      unit: '₪50.00',
      total: '₪100.00',
    })
    expect(text.rows[1]?.total).toBe('-₪10.00')
  })
})

describe('invoicePdfFileName', () => {
  it('is the printed number and nothing else', () => {
    expect(invoicePdfFileName('KE-INV-000042')).toBe('KE-INV-000042.pdf')
    expect(invoicePdfFileName('weird/number name')).toBe('weird_number_name.pdf')
  })
})

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

  it('stamps the title and the copy marking into the document metadata', async () => {
    const bytes = await renderInvoicePdf({ ...baseInput(), copy: 'copy' })
    const { PDFDocument } = await import('pdf-lib')
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getTitle()).toBe('חשבונית מס/קבלה KE-INV-000042')
    expect(reloaded.getSubject()).toContain('העתק')
  })
})
