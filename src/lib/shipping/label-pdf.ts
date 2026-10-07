import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bidiVisual } from '@/lib/invoices/pdf'
import { type CarrierId, carrierEntry, carrierService } from '@/lib/shipping/carrier-registry'
import type { ParcelAddress } from '@/lib/shipping/providers/types'

/**
 * The A6 shipping label the platform prints itself.
 *
 * Used whenever a carrier does not hand back a PDF of its own: always under
 * the mock, and for any real carrier whose answer is a tracking number alone.
 * It carries what a courier's scanner and a courier's driver need: the
 * tracking number as a QR code and in large Latin digits, the recipient in
 * Hebrew, the sender, the service, the parcel weight and the order reference.
 *
 * Hebrew is shaped with the same `bidiVisual` the invoice uses: pdf-lib lays
 * glyphs out left to right, so logical Hebrew is reversed per run and the
 * numbers inside it are kept the right way round. Fonts are the Heebo files
 * already in the repo for the invoice.
 */

export interface ShippingLabelInput {
  carrierId: CarrierId
  serviceCode: string
  trackingNumber: string
  orderRef: string
  recipient: ParcelAddress
  sender: { name: string; addressLine: string; phone: string | null }
  weightGrams: number
  pieces: number
  createdAt: Date
}

export const LABEL_WIDTH_PT = 297.64
export const LABEL_HEIGHT_PT = 419.53

let cachedFonts: { regular: Uint8Array; bold: Uint8Array } | null = null

function loadFonts(): { regular: Uint8Array; bold: Uint8Array } {
  if (!cachedFonts) {
    cachedFonts = {
      regular: new Uint8Array(
        readFileSync(join(process.cwd(), 'src/assets/fonts/Heebo-Regular.ttf')),
      ),
      bold: new Uint8Array(readFileSync(join(process.cwd(), 'src/assets/fonts/Heebo-Bold.ttf'))),
    }
  }
  return cachedFonts
}

export function labelFileName(trackingNumber: string): string {
  return `label-${trackingNumber.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`
}

export function recipientLines(address: ParcelAddress): string[] {
  const streetParts = [address.street, address.streetNumber].filter(Boolean).join(' ')
  const unitParts = [
    address.entrance ? `כניסה ${address.entrance}` : null,
    address.floor ? `קומה ${address.floor}` : null,
    address.apartment ? `דירה ${address.apartment}` : null,
  ].filter((p): p is string => Boolean(p))
  const cityLine = [address.city, address.zip].filter(Boolean).join(' ')
  return [
    address.fullName,
    streetParts,
    ...(unitParts.length > 0 ? [unitParts.join(', ')] : []),
    cityLine,
    ...(address.phone ? [`טלפון: ${address.phone}`] : []),
    ...(address.notes ? [address.notes.slice(0, 80)] : []),
  ].filter((line) => line.trim() !== '')
}

export function weightLabel(grams: number): string {
  if (grams >= 1000) {
    const kg = Math.floor(grams / 1000)
    const rest = Math.round((grams % 1000) / 100)
    return rest === 0 ? `${kg} ק"ג` : `${kg}.${rest} ק"ג`
  }
  return `${grams} גרם`
}

export async function renderShippingLabelPdf(input: ShippingLabelInput): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkitModule, qrModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
    import('qrcode'),
  ])
  const fontkit = fontkitModule.default
  const QRCode = qrModule.default

  const entry = carrierEntry(input.carrierId)
  const service = carrierService(input.carrierId, input.serviceCode)

  const pdf = await PDFDocument.create()
  pdf.setTitle(`תווית משלוח ${input.trackingNumber}`)
  pdf.setLanguage('he-IL')
  pdf.registerFontkit(fontkit)
  const fonts = loadFonts()
  const regular = await pdf.embedFont(fonts.regular, { subset: true })
  const bold = await pdf.embedFont(fonts.bold, { subset: true })
  const black = rgb(0.05, 0.05, 0.05)
  const grey = rgb(0.4, 0.4, 0.4)

  const page = pdf.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT])
  const margin = 14
  const right = LABEL_WIDTH_PT - margin

  const drawRtl = (text: string, y: number, size: number, isBold = false, colour = black) => {
    const font = isBold ? bold : regular
    const visual = bidiVisual(text)
    const width = font.widthOfTextAtSize(visual, size)
    page.drawText(visual, { x: right - width, y, size, font, color: colour })
  }
  const drawLtr = (text: string, x: number, y: number, size: number, isBold = false) => {
    page.drawText(text, { x, y, size, font: isBold ? bold : regular, color: black })
  }

  // Header: carrier and service.
  let y = LABEL_HEIGHT_PT - margin - 16
  drawRtl(entry.label, y, 15, true)
  y -= 16
  drawRtl(service.label, y, 10, false, grey)
  page.drawLine({
    start: { x: margin, y: y - 6 },
    end: { x: right, y: y - 6 },
    thickness: 0.8,
    color: black,
  })

  // QR code of the tracking number, left column.
  const dataUrl = await QRCode.toDataURL(input.trackingNumber, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 220,
  })
  const png = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
  const qr = await pdf.embedPng(new Uint8Array(png))
  const qrSize = 92
  const qrY = y - 12 - qrSize
  page.drawImage(qr, { x: margin, y: qrY, width: qrSize, height: qrSize })

  // Recipient, right column beside the QR.
  let ry = y - 22
  drawRtl('אל:', ry, 9, false, grey)
  ry -= 13
  for (const line of recipientLines(input.recipient).slice(0, 6)) {
    drawRtl(line, ry, 10.5, line === input.recipient.fullName)
    ry -= 13
  }

  // Tracking number, large, Latin, under the QR.
  y = Math.min(qrY, ry) - 16
  drawLtr(input.trackingNumber, margin, y, 15, true)
  y -= 12
  drawLtr(`REF ${input.orderRef}`, margin, y, 8)

  page.drawLine({
    start: { x: margin, y: y - 8 },
    end: { x: right, y: y - 8 },
    thickness: 0.5,
    color: grey,
  })
  y -= 24

  // Parcel facts.
  drawRtl(`משקל: ${weightLabel(input.weightGrams)} · חבילות: ${input.pieces}`, y, 9.5)
  y -= 14
  drawRtl(
    `הזמנה ${input.orderRef} · ${input.createdAt.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
    y,
    9.5,
  )
  y -= 22

  // Sender.
  drawRtl('מאת:', y, 9, false, grey)
  y -= 13
  drawRtl(input.sender.name, y, 10, true)
  y -= 13
  drawRtl(input.sender.addressLine, y, 9.5)
  if (input.sender.phone) {
    y -= 13
    drawRtl(`טלפון: ${input.sender.phone}`, y, 9.5)
  }

  // Footer.
  drawRtl('תווית הודפסה על ידי KenyonExpress', margin + 2, 7.5, false, grey)

  return pdf.save()
}
