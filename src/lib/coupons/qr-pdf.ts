import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { buildCouponApplyUrl } from './unit-codes'

/**
 * The printable sheet for a QR coupon batch: A4 pages, 12 codes per page,
 * each cell a QR over its 8-digit code, with a light border to cut along.
 *
 * LATIN AND DIGITS ONLY, DELIBERATELY. pdf-lib's standard fonts are
 * WinAnsi-encoded and cannot draw Hebrew; embedding a Hebrew font means
 * shipping and subsetting a font file for a sheet whose payload is QR images
 * and digit strings. The batch label therefore appears in the admin UI and the
 * download filename, never inside the PDF. Everything drawn here (campaign
 * code, host, unit codes) is already constrained to Latin/digits by the
 * campaign code CHECK (096) and the unit code CHECK (182).
 */

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 40
const HEADER_HEIGHT = 34
const COLUMNS = 3
const ROWS = 4
export const CODES_PER_PAGE = COLUMNS * ROWS

const QR_SIZE = 118
const CELL_BORDER = rgb(0.78, 0.78, 0.78)
const INK = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.45, 0.45, 0.45)

export type CouponQrPdfInput = {
  /** The campaign's typed code, drawn as the sheet header. Latin per 096. */
  campaignCode: string
  /** Public origin the QR URLs point at. */
  origin: string
  /** The 8-digit unit codes, one cell each. */
  codes: string[]
}

/** The whole document as bytes, ready for a download response. */
export async function buildCouponQrPdf(input: CouponQrPdfInput): Promise<Uint8Array> {
  if (input.codes.length === 0) throw new Error('buildCouponQrPdf: empty batch')

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const gridWidth = A4.width - MARGIN * 2
  const gridHeight = A4.height - MARGIN * 2 - HEADER_HEIGHT
  const cellWidth = gridWidth / COLUMNS
  const cellHeight = gridHeight / ROWS

  const host = input.origin.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  for (let start = 0; start < input.codes.length; start += CODES_PER_PAGE) {
    const page = doc.addPage([A4.width, A4.height])
    const pageCodes = input.codes.slice(start, start + CODES_PER_PAGE)

    page.drawText(input.campaignCode, {
      x: MARGIN,
      y: A4.height - MARGIN - 14,
      size: 14,
      font: bold,
      color: INK,
    })
    page.drawText(host, {
      x: A4.width - MARGIN - font.widthOfTextAtSize(host, 10),
      y: A4.height - MARGIN - 13,
      size: 10,
      font,
      color: MUTED,
    })

    for (const [index, code] of pageCodes.entries()) {
      const column = index % COLUMNS
      const row = Math.floor(index / COLUMNS)
      const cellX = MARGIN + column * cellWidth
      // pdf-lib's origin is bottom-left; rows fill from the top.
      const cellY = A4.height - MARGIN - HEADER_HEIGHT - (row + 1) * cellHeight

      page.drawRectangle({
        x: cellX,
        y: cellY,
        width: cellWidth,
        height: cellHeight,
        borderColor: CELL_BORDER,
        borderWidth: 0.5,
      })

      // toDataURL rather than toBuffer: the latter exists only in qrcode's
      // node build, and the bundler is free to resolve the browser one.
      const dataUrl = await QRCode.toDataURL(buildCouponApplyUrl(input.origin, code), {
        margin: 0,
        width: 236,
        errorCorrectionLevel: 'M',
      })
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const png = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
      const image = await doc.embedPng(png)

      const qrX = cellX + (cellWidth - QR_SIZE) / 2
      const qrY = cellY + (cellHeight - QR_SIZE) / 2 + 10
      page.drawImage(image, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE })

      const codeSize = 15
      page.drawText(code, {
        x: cellX + (cellWidth - bold.widthOfTextAtSize(code, codeSize)) / 2,
        y: qrY - 24,
        size: codeSize,
        font: bold,
        color: INK,
      })
    }
  }

  return doc.save()
}
