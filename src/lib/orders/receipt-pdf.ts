import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InvoiceIssuer } from '@/lib/invoices/issuer'
import { bidiVisual, formatAmountForPdf } from '@/lib/invoices/pdf'
import { type Agorot, agorot, sumAgorot } from '@/lib/money'
import type { OrderDetail } from '@/server/queries/orders'

/**
 * The order confirmation as a PDF: what was bought, what was paid on the
 * site, what is still owed at the business, and the coupon codes issued.
 *
 * WHAT THIS IS AND IS NOT. It is the customer's copy of the confirmation
 * screen, available for as long as the order exists and downloadable from
 * the account. It is NOT the tax document: that one is issued by the
 * provider through `server/payments/invoices.ts`, carries a number from a
 * legal series, and can lag the payment by minutes or fail and queue. A
 * shopper who has just paid should not have to wait for that queue to hold
 * something in their hand, and the footer says plainly which of the two this
 * is. When the tax document exists its number is printed as a reference.
 *
 * WHY IT IS BUILT FROM `OrderDetail`. That is the one read of an order that
 * is already scoped to the signed-in owner, already resolves the money
 * columns across both schema generations, and already carries the vouchers.
 * Building the receipt from anything else would be a second, unguarded read
 * of the same rows. `buildOrderReceipt` is pure so the mapping can be tested
 * without a database, and `renderOrderReceiptPdf` draws only what it is
 * handed.
 *
 * Same renderer discipline as the invoice: Heebo from disk, integer agorot
 * in, `bidiVisual` on every string, because pdf-lib has no bidi pass.
 */

export interface OrderReceiptLine {
  description: string
  quantity: number
  unitPriceAgorot: Agorot
  totalAgorot: Agorot
  /** Still to be paid at the business, for a coupon line. Zero otherwise. */
  balanceDueAgorot: Agorot
  voucherCodes: string[]
}

export interface OrderReceipt {
  orderId: string
  /** The human reference: first eight characters, upper-cased. */
  reference: string
  paidAt: Date
  issuer: InvoiceIssuer
  customer: { name: string | null; email: string | null; phone: string | null }
  /** One line, or null for a coupon-only order. */
  shippingAddress: string | null
  lines: OrderReceiptLine[]
  subtotalAgorot: Agorot
  walletAppliedAgorot: Agorot
  /** Paid on the site, across every method. */
  totalAgorot: Agorot
  /** Sum of the lines' balances, owed at the business on redemption. */
  balanceDueAtBusinessAgorot: Agorot
  /** The tax document's number when it has been issued. */
  invoiceNumber: string | null
}

export interface OrderReceiptExtras {
  issuer: InvoiceIssuer
  customer: { name: string | null; email: string | null; phone: string | null }
  shippingAddress?: {
    full_name?: string | null
    phone?: string | null
    street?: string | null
    street_number?: string | null
    apartment?: string | null
    floor?: string | null
    city?: string | null
    zip?: string | null
  } | null
}

export class OrderNotPaidError extends Error {
  constructor(orderId: string) {
    super(`order ${orderId} has no paid_at; a receipt describes a payment`)
    this.name = 'OrderNotPaidError'
  }
}

export function receiptReference(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

export function receiptFileName(orderId: string): string {
  return `kenyonexpress-receipt-${receiptReference(orderId)}.pdf`
}

function addressLine(address: OrderReceiptExtras['shippingAddress']): string | null {
  if (!address) return null
  const street = [address.street, address.street_number]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ')
  const unit = [
    address.apartment ? `דירה ${address.apartment}` : null,
    address.floor ? `קומה ${address.floor}` : null,
  ].filter((part): part is string => part !== null)
  const parts = [street, ...unit, address.city, address.zip]
    .filter((part): part is string => !!part && part.trim() !== '')
    .map((part) => part.trim())
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * The receipt for a paid order. Throws for an unpaid one: a receipt is a
 * statement that money moved, and printing one for a pending order is a
 * document that says something false.
 */
export function buildOrderReceipt(detail: OrderDetail, extras: OrderReceiptExtras): OrderReceipt {
  if (!detail.paidAt) throw new OrderNotPaidError(detail.id)

  const lines: OrderReceiptLine[] = detail.lines.map((line) => ({
    description: line.productName,
    quantity: line.quantity,
    unitPriceAgorot: line.unitPriceAgorot,
    totalAgorot: line.totalAgorot,
    balanceDueAgorot: line.productType === 'coupon' ? line.balanceDueAgorot : agorot(0),
    voucherCodes: line.vouchers.map((voucher) => voucher.code),
  }))

  const hasPhysical = detail.lines.some((line) => line.productType === 'physical')

  return {
    orderId: detail.id,
    reference: receiptReference(detail.id),
    paidAt: new Date(detail.paidAt),
    issuer: extras.issuer,
    customer: extras.customer,
    shippingAddress: hasPhysical ? addressLine(extras.shippingAddress) : null,
    lines,
    subtotalAgorot: detail.subtotalAgorot,
    walletAppliedAgorot: detail.walletAppliedAgorot,
    totalAgorot: detail.totalAgorot,
    balanceDueAtBusinessAgorot: sumAgorot(lines.map((line) => line.balanceDueAgorot)),
    invoiceNumber: detail.invoice?.documentNumber ?? null,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48

const COL_DESCRIPTION_RIGHT = PAGE_WIDTH - MARGIN
const COL_QUANTITY_RIGHT = 250
const COL_UNIT_RIGHT = 185
const COL_TOTAL_RIGHT = 105
const DESCRIPTION_MAX_WIDTH = COL_DESCRIPTION_RIGHT - COL_QUANTITY_RIGHT - 12

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

function formatDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`
}

/** Groups an 8-digit code as 1234-5678 for reading aloud at a counter. */
function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

export async function renderOrderReceiptPdf(receipt: OrderReceipt): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ])
  const fontkit = fontkitModule.default

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(`אישור הזמנה ${receipt.reference}`)
  pdf.setProducer('KenyonExpress')
  const fonts = loadFonts()
  const regular = await pdf.embedFont(fonts.regular, { subset: true })
  const bold = await pdf.embedFont(fonts.bold, { subset: true })

  const black = rgb(0.1, 0.1, 0.1)
  const grey = rgb(0.45, 0.45, 0.45)

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  type Font = typeof regular

  const drawRightAligned = (
    text: string,
    rightX: number,
    atY: number,
    font: Font,
    size: number,
    color = black,
  ): void => {
    const visual = bidiVisual(text)
    page.drawText(visual, {
      x: rightX - font.widthOfTextAtSize(visual, size),
      y: atY,
      size,
      font,
      color,
    })
  }

  const fitToWidth = (text: string, font: Font, size: number, maxWidth: number): string => {
    if (font.widthOfTextAtSize(bidiVisual(text), size) <= maxWidth) return text
    let candidate = text
    while (candidate.length > 1) {
      candidate = candidate.slice(0, -1)
      const trimmed = `${candidate.trimEnd()}…`
      if (font.widthOfTextAtSize(bidiVisual(trimmed), size) <= maxWidth) return trimmed
    }
    return '…'
  }

  const rule = (): void => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: grey,
    })
  }

  const drawTableHeader = (): void => {
    drawRightAligned('פריט', COL_DESCRIPTION_RIGHT, y, bold, 10)
    drawRightAligned('כמות', COL_QUANTITY_RIGHT, y, bold, 10)
    drawRightAligned('מחיר ליחידה', COL_UNIT_RIGHT, y, bold, 10)
    drawRightAligned('סה"כ', COL_TOTAL_RIGHT, y, bold, 10)
    y -= 6
    rule()
    y -= 14
  }

  const ensureRoom = (needed: number): void => {
    if (y - needed >= MARGIN) return
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
    drawTableHeader()
  }

  // Issuer
  drawRightAligned(receipt.issuer.businessName, PAGE_WIDTH - MARGIN, y, bold, 16)
  y -= 20
  if (receipt.issuer.taxId) {
    drawRightAligned(`עוסק/ח.פ ${receipt.issuer.taxId}`, PAGE_WIDTH - MARGIN, y, regular, 10, grey)
    y -= 14
  }
  if (receipt.issuer.address) {
    drawRightAligned(receipt.issuer.address, PAGE_WIDTH - MARGIN, y, regular, 10, grey)
    y -= 14
  }
  y -= 12

  // Title
  drawRightAligned(`אישור הזמנה ${receipt.reference}`, PAGE_WIDTH - MARGIN, y, bold, 14)
  drawRightAligned('מסמך ממוחשב', MARGIN + 90, y, regular, 9, grey)
  y -= 22

  // Meta
  drawRightAligned(`שולם ב: ${formatDateTime(receipt.paidAt)}`, PAGE_WIDTH - MARGIN, y, regular, 10)
  y -= 14
  if (receipt.invoiceNumber) {
    drawRightAligned(
      `חשבונית מס/קבלה: ${receipt.invoiceNumber}`,
      PAGE_WIDTH - MARGIN,
      y,
      regular,
      10,
    )
    y -= 14
  }
  y -= 6

  // Customer
  const customerName = receipt.customer.name?.trim() || 'לקוח/ה'
  drawRightAligned(`לכבוד: ${customerName}`, PAGE_WIDTH - MARGIN, y, regular, 10)
  y -= 14
  const contact = [receipt.customer.email, receipt.customer.phone]
    .filter((v): v is string => !!v && v.trim() !== '')
    .join('  |  ')
  if (contact) {
    drawRightAligned(contact, PAGE_WIDTH - MARGIN, y, regular, 9, grey)
    y -= 14
  }
  if (receipt.shippingAddress) {
    drawRightAligned(
      `כתובת למשלוח: ${receipt.shippingAddress}`,
      PAGE_WIDTH - MARGIN,
      y,
      regular,
      10,
    )
    y -= 14
  }
  y -= 10

  drawTableHeader()

  for (const line of receipt.lines) {
    ensureRoom(40)
    const description = fitToWidth(line.description, regular, 10, DESCRIPTION_MAX_WIDTH)
    drawRightAligned(description, COL_DESCRIPTION_RIGHT, y, regular, 10)
    drawRightAligned(String(line.quantity), COL_QUANTITY_RIGHT, y, regular, 10)
    drawRightAligned(formatAmountForPdf(line.unitPriceAgorot), COL_UNIT_RIGHT, y, regular, 10)
    drawRightAligned(formatAmountForPdf(line.totalAgorot), COL_TOTAL_RIGHT, y, regular, 10)
    y -= 15

    if (line.balanceDueAgorot > 0) {
      ensureRoom(20)
      drawRightAligned(
        `לתשלום בבית העסק במימוש: ${formatAmountForPdf(line.balanceDueAgorot)}`,
        COL_DESCRIPTION_RIGHT - 12,
        y,
        regular,
        9,
        grey,
      )
      y -= 14
    }
    for (const code of line.voucherCodes) {
      ensureRoom(20)
      drawRightAligned(`קוד קופון: ${formatCode(code)}`, COL_DESCRIPTION_RIGHT - 12, y, regular, 9)
      y -= 14
    }
  }

  y -= 4
  ensureRoom(110)
  rule()
  y -= 18

  // Totals, in the same order and with the same words as the account page,
  // so the printed copy and the screen never disagree about a label.
  const totalsRight = COL_UNIT_RIGHT + 30
  drawRightAligned('סכום ביניים', totalsRight, y, regular, 10)
  drawRightAligned(formatAmountForPdf(receipt.subtotalAgorot), COL_TOTAL_RIGHT, y, regular, 10)
  y -= 15
  if (receipt.walletAppliedAgorot > 0) {
    drawRightAligned('שולם מהארנק', totalsRight, y, regular, 10)
    drawRightAligned(
      formatAmountForPdf(-receipt.walletAppliedAgorot),
      COL_TOTAL_RIGHT,
      y,
      regular,
      10,
    )
    y -= 15
  }
  drawRightAligned('סך הכל שולם באתר', totalsRight, y, bold, 12)
  drawRightAligned(formatAmountForPdf(receipt.totalAgorot), COL_TOTAL_RIGHT, y, bold, 12)
  y -= 18
  if (receipt.balanceDueAtBusinessAgorot > 0) {
    drawRightAligned('יתרה לתשלום בבית העסק', totalsRight, y, regular, 10)
    drawRightAligned(
      formatAmountForPdf(receipt.balanceDueAtBusinessAgorot),
      COL_TOTAL_RIGHT,
      y,
      regular,
      10,
    )
    y -= 15
  }
  y -= 8

  drawRightAligned(
    'אישור הזמנה. חשבונית המס/קבלה מונפקת בנפרד ונשלחת במייל.',
    PAGE_WIDTH - MARGIN,
    y,
    regular,
    9,
    grey,
  )
  y -= 13
  drawRightAligned(
    'התשלום בכרטיס בוצע באמצעות Cardcom. פרטי הכרטיס אינם נשמרים באתר.',
    PAGE_WIDTH - MARGIN,
    y,
    regular,
    9,
    grey,
  )

  return pdf.save()
}
