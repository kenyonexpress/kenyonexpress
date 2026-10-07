import { describe, expect, it } from 'vitest'
import { labelFileName, recipientLines, renderShippingLabelPdf, weightLabel } from './label-pdf'

const recipient = {
  fullName: 'דנה כהן',
  phone: '050-1234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  streetNumber: '100',
  apartment: '4',
  floor: '2',
  entrance: 'ב',
  zip: '6433222',
  notes: 'להשאיר אצל השכן',
}

describe('shipping label', () => {
  it('writes the recipient the way a driver reads an Israeli address', () => {
    expect(recipientLines(recipient)).toEqual([
      'דנה כהן',
      'דיזנגוף 100',
      'כניסה ב, קומה 2, דירה 4',
      'תל אביב 6433222',
      'טלפון: 050-1234567',
      'להשאיר אצל השכן',
    ])
    expect(
      recipientLines({
        ...recipient,
        apartment: null,
        floor: null,
        entrance: null,
        notes: null,
        phone: null,
        zip: null,
      }),
    ).toEqual(['דנה כהן', 'דיזנגוף 100', 'תל אביב'])
  })

  it('formats weight in kilograms past a thousand grams', () => {
    expect(weightLabel(500)).toBe('500 גרם')
    expect(weightLabel(1000)).toBe('1 ק"ג')
    expect(weightLabel(1500)).toBe('1.5 ק"ג')
  })

  it('names the file from the tracking number only', () => {
    expect(labelFileName('KEMOCK-CH-ABC/..-1')).toBe('label-KEMOCK-CH-ABC___-1.pdf')
  })

  it('renders a one-page A6 PDF with Hebrew text embedded', async () => {
    const bytes = await renderShippingLabelPdf({
      carrierId: 'chita',
      serviceCode: 'express',
      trackingNumber: 'KEMOCK-CH-ABCDEF-123456',
      orderRef: 'A1B2C3D4',
      recipient,
      sender: { name: 'KenyonExpress', addressLine: 'הרצל 1, תל אביב', phone: '03-1234567' },
      weightGrams: 1500,
      pieces: 1,
      createdAt: new Date('2026-10-08T10:00:00Z'),
    })
    const head = Buffer.from(bytes.slice(0, 5)).toString()
    expect(head).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(5000)
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const [w, h] = doc.getPage(0).getSize()
      ? [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]
      : [0, 0]
    expect(Math.round(w)).toBe(298)
    expect(Math.round(h)).toBe(420)
  }, 20_000)
})
