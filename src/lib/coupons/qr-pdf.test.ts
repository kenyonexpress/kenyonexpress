import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { CODES_PER_PAGE, buildCouponQrPdf } from './qr-pdf'
import { generateUnitCodes } from './unit-codes'

describe('buildCouponQrPdf', () => {
  it('produces a loadable PDF with one page per 12 codes', async () => {
    const codes = generateUnitCodes(CODES_PER_PAGE + 1)
    const bytes = await buildCouponQrPdf({
      campaignCode: 'SUMMER20',
      origin: 'https://kenyonexpress.co.il',
      codes,
    })

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(2)
  })

  it('fits a single code on a single page', async () => {
    const bytes = await buildCouponQrPdf({
      campaignCode: 'WINTER',
      origin: 'https://kenyonexpress.co.il',
      codes: generateUnitCodes(1),
    })
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
  })

  it('refuses an empty batch instead of emitting a blank document', async () => {
    await expect(
      buildCouponQrPdf({ campaignCode: 'X20', origin: 'https://example.com', codes: [] }),
    ).rejects.toThrow()
  })
})
