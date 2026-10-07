import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InvoiceCustomer,
  InvoiceDocumentLine,
  InvoiceDocumentType,
} from '@/lib/invoices/document'
import type { InvoiceIssuer } from '@/lib/invoices/issuer'

/**
 * The platform's own tax-document PDF, in Hebrew, rendered with pdf-lib.
 *
 * SINCE STEP 42 THIS IS THE DOCUMENT OF RECORD, not a fallback. The number
 * printed on it is the platform's own sequential number (228's
 * `fn_next_invoice_number`, one series per terminal and document type), the
 * bytes are what is archived in R2 and attached to the customer's email, and
 * the provider's document, when there is one, is printed as the clearing
 * reference. `server/payments/invoices.ts` is the only producer; the account
 * route re-renders the same input as a marked copy when no archived file
 * exists.
 *
 * WHAT AN ISRAELI TAX DOCUMENT HAS TO CARRY, and where each item is here
 * (תקנות מס הכנסה (ניהול פנקסי חשבונות), סעיפים 9 ו-9א, and הוראות מסמך
 * ממוחשב):
 *
 *   - the issuer's name, address and registration number (ח.פ / עוסק
 *     מורשה): the header, from `InvoiceIssuer`;
 *   - the document's title and its sequential number: the title line;
 *   - "מקור" on the first print and "העתק" on every later one: `copy`;
 *   - the words "מסמך ממוחשב" on a computer-issued document: the footer;
 *   - the date of issue: the meta block, in Asia/Jerusalem;
 *   - the customer's name: the "לכבוד" line;
 *   - a description, quantity and price per line: the table;
 *   - the amount before VAT, the VAT rate and amount, and the total: the
 *     totals block, except on a coupon receipt, which states no VAT because
 *     the VAT event has not occurred (`isTaxableDocument`);
 *   - for the receipt half of a חשבונית מס/קבלה: the means of payment and the
 *     clearing reference: the meta block, from `payment`;
 *   - for a credit note: the document it reverses: `relatedDocumentNumber`.
 *
 * The strings are composed by `composeInvoiceText` as a plain data structure
 * and the renderer only draws them, so what the document says can be tested
 * without parsing a PDF. pdf-lib has no text extraction, and a test that can
 * only check the byte count is a test that cannot catch "העתק" printed on an
 * original.
 *
 * WHY THE BIDI PASS IS WRITTEN OUT BY HAND. pdf-lib draws text in logical
 * order, left to right, with no bidi algorithm - the same gap that made every
 * Satori-rendered Hebrew OG card come out backwards with a 200 and a valid
 * PNG. Hebrew is a non-joining script, so correct rendering needs exactly one
 * thing: visual reordering. `bidiVisual` does that one thing and is exported
 * so a test can hold it still.
 *
 * FONTS. Heebo carries the Hebrew block and U+20AA (₪) and already lives in
 * the repo for the site itself. Read from disk with a literal path so Next's
 * file tracing bundles the TTFs into the serverless output.
 */

// ---------------------------------------------------------------------------
// Bidi
// ---------------------------------------------------------------------------

// Written as escapes on purpose: U+FB1D is a composed letter that an editor
// normalising to NFC splits into two code points, which silently widens the
// range to everything between U+05B4 and U+FB4F, the shekel sign included.
const RTL_CHAR = /[\u0590-\u05FF\uFB1D-\uFB4F]/
// Digits, Latin, ₪ and % travel with the number they annotate; a sign or a
// dot inside "-₪12.50" stays attached instead of drifting to the far side.
const LTR_CHAR = /[A-Za-z0-9₪%+.-]/

const MIRRORED: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
}

type Strong = 'rtl' | 'ltr'

function classify(ch: string): Strong | 'neutral' {
  if (RTL_CHAR.test(ch)) return 'rtl'
  if (LTR_CHAR.test(ch)) return 'ltr'
  return 'neutral'
}

function reverseMirrored(text: string): string {
  return [...text]
    .reverse()
    .map((ch) => MIRRORED[ch] ?? ch)
    .join('')
}

/**
 * Logical-order text to the visual order an LTR-only renderer must draw for an
 * RTL paragraph.
 *
 * The simplification relative to UAX#9: every character is rtl, ltr or
 * neutral; a neutral run takes the direction of its neighbours when they
 * agree and the paragraph's (rtl) when they do not; runs are then emitted in
 * reverse order, rtl runs reversed character-by-character with paired
 * brackets mirrored. That is the whole algorithm this document needs: the
 * strings are product names, labels and amounts, not arbitrary text.
 */
export function bidiVisual(logical: string): string {
  const chars = [...logical]
  if (chars.length === 0) return logical

  const resolved: Strong[] = new Array(chars.length)
  for (let i = 0; i < chars.length; i++) {
    const cls = classify(chars[i] as string)
    if (cls !== 'neutral') {
      resolved[i] = cls
      continue
    }
    let prev: Strong | null = null
    for (let j = i - 1; j >= 0; j--) {
      const c = classify(chars[j] as string)
      if (c !== 'neutral') {
        prev = c
        break
      }
    }
    let next: Strong | null = null
    for (let j = i + 1; j < chars.length; j++) {
      const c = classify(chars[j] as string)
      if (c !== 'neutral') {
        next = c
        break
      }
    }
    resolved[i] = prev !== null && prev === next ? prev : 'rtl'
  }

  const runs: { direction: Strong; text: string }[] = []
  for (let i = 0; i < chars.length; i++) {
    const direction = resolved[i] as Strong
    const last = runs[runs.length - 1]
    if (last && last.direction === direction) last.text += chars[i] as string
    else runs.push({ direction, text: chars[i] as string })
  }

  return runs
    .reverse()
    .map((run) => (run.direction === 'rtl' ? reverseMirrored(run.text) : run.text))
    .join('')
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * `₪1,234.56`, built by hand rather than through Intl: the he-IL formatter
 * decorates its output with direction marks that have no glyph in the
 * embedded font and would surface as tofu on the printed page.
 */
export function formatAmountForPdf(valueAgorot: number): string {
  if (!Number.isSafeInteger(valueAgorot)) {
    throw new TypeError('PDF amounts are integer agorot')
  }
  const sign = valueAgorot < 0 ? '-' : ''
  const absolute = Math.abs(valueAgorot)
  const whole = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${sign}₪${whole}.${fraction}`
}

function jerusalemParts(value: Date, withTime: boolean): Map<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).formatToParts(value)
  return new Map(parts.map((p) => [p.type, p.value]))
}

/** `10.09.2026`, the day in Israel, which is the day the document is dated. */
export function formatDateForPdf(value: Date): string {
  const p = jerusalemParts(value, false)
  return `${p.get('day')}.${p.get('month')}.${p.get('year')}`
}

/** `10.09.2026 15:04`, for the "printed at" footer line. */
export function formatDateTimeForPdf(value: Date): string {
  const p = jerusalemParts(value, true)
  // en-GB answers "24" for midnight under hour12:false in some ICU builds.
  const hour = p.get('hour') === '24' ? '00' : p.get('hour')
  return `${p.get('day')}.${p.get('month')}.${p.get('year')} ${hour}:${p.get('minute')}`
}

const TITLES: Record<InvoiceDocumentType, string> = {
  tax_invoice_receipt: 'חשבונית מס/קבלה',
  coupon_receipt: 'קבלה',
  credit_note: 'חשבונית זיכוי',
}

/** The document's title in Hebrew, the same string the email subject uses. */
export function invoiceTitle(documentType: InvoiceDocumentType): string {
  return TITLES[documentType]
}

/**
 * The attachment and archive file name for a document, from its printed
 * number only. `KE-INV-000042.pdf`: no order id and no customer name, because
 * a file name travels further than the file (mail subjects, download lists,
 * support tickets) and the number is the one identifier that is meant to.
 */
export function invoicePdfFileName(documentNumber: string): string {
  const safe = documentNumber.replace(/[^\w.-]/g, '_')
  return `${safe}.pdf`
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

/**
 * "מקור" is printed on the first rendering of a document - the one archived
 * and emailed at issue time - and "העתק" on every rendering after it, which
 * is what the account route produces on demand. A document carrying two
 * originals is the thing the marking exists to prevent.
 */
export type InvoiceCopyKind = 'original' | 'copy'

export interface InvoicePdfPayment {
  /** Only cards reach a document: a wallet-only order has nothing to receipt. */
  method: 'card'
  /** The terminal's deal id, printed as the clearing reference. */
  transactionId: string | null
}

export interface InvoicePdfInput {
  documentType: InvoiceDocumentType
  /** The number printed as the document's own, e.g. `KE-INV-000042`. */
  documentNumber: string
  /** The provider's number for the same sale, printed as the reference. */
  providerDocumentNumber: string | null
  issuedAt: Date
  issuer: InvoiceIssuer
  customer: InvoiceCustomer
  lines: readonly InvoiceDocumentLine[]
  totalAgorot: number
  netAgorot: number
  vatAgorot: number
  vatPercent: number
  /** The order id; its first 8 characters are the human order reference. */
  reference: string
  /** Defaults to `original`. See `InvoiceCopyKind`. */
  copy?: InvoiceCopyKind
  /** How the money moved, for the receipt half of the document. */
  payment?: InvoicePdfPayment | null
  /** On a credit note: the sale document it reverses, when it was issued. */
  relatedDocumentNumber?: string | null
  /** When this rendering happened. Defaults to `issuedAt`. */
  generatedAt?: Date
}

export interface InvoicePdfTotal {
  label: string
  valueAgorot: number
  emphasis: boolean
}

export interface InvoicePdfText {
  title: string
  copyLabel: string
  issuerLines: string[]
  metaLines: string[]
  customerLines: string[]
  columns: { description: string; quantity: string; unit: string; total: string }
  rows: { description: string; quantity: string; unit: string; total: string }[]
  totals: InvoicePdfTotal[]
  notes: string[]
  footerLines: string[]
}

const COPY_LABELS: Record<InvoiceCopyKind, string> = { original: 'מקור', copy: 'העתק' }

/**
 * Everything the document says, as strings, before a glyph is drawn.
 *
 * Pure, so the legal content of the page - which number, which marking,
 * which VAT line, which reference - is asserted directly in tests, and so
 * the renderer below is nothing but geometry.
 */
export function composeInvoiceText(input: InvoicePdfInput): InvoicePdfText {
  const copy = input.copy ?? 'original'
  const taxable = input.documentType !== 'coupon_receipt'

  const issuerLines = [input.issuer.businessName]
  if (input.issuer.taxId) issuerLines.push(`עוסק מורשה/ח.פ ${input.issuer.taxId}`)
  if (input.issuer.address) issuerLines.push(input.issuer.address)

  const metaLines = [
    `תאריך הפקה: ${formatDateForPdf(input.issuedAt)}`,
    `הזמנה: ${input.reference.slice(0, 8).toUpperCase()}`,
  ]
  if (input.documentType === 'credit_note') {
    metaLines.push(
      input.relatedDocumentNumber
        ? `כנגד ${TITLES.tax_invoice_receipt} ${input.relatedDocumentNumber}`
        : 'כנגד תשלום שהוחזר ללקוח/ה',
    )
  }
  if (input.payment) {
    metaLines.push(
      input.documentType === 'credit_note' ? 'הוחזר ל: כרטיס אשראי' : 'אמצעי תשלום: כרטיס אשראי',
    )
    if (input.payment.transactionId) {
      metaLines.push(`אסמכתת סליקה: ${input.payment.transactionId}`)
    }
  }
  if (input.providerDocumentNumber) {
    metaLines.push(`מסמך סולק: ${input.providerDocumentNumber}`)
  }

  const customerLines = [`לכבוד: ${input.customer.name?.trim() || 'לקוח/ה'}`]
  const contact = [input.customer.email, input.customer.phone]
    .filter((v): v is string => !!v && v.trim() !== '')
    .join('  |  ')
  if (contact) customerLines.push(contact)

  const rows = input.lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unit: formatAmountForPdf(line.unitPriceAgorot),
    total: formatAmountForPdf(line.totalAgorot),
  }))

  const totals: InvoicePdfTotal[] = []
  if (taxable) {
    totals.push({ label: 'סה"כ לפני מע"מ', valueAgorot: input.netAgorot, emphasis: false })
    totals.push({
      label: `מע"מ ${input.vatPercent}%`,
      valueAgorot: input.vatAgorot,
      emphasis: false,
    })
  }
  totals.push({
    label:
      input.documentType === 'credit_note'
        ? 'סה"כ זיכוי'
        : taxable
          ? 'סה"כ כולל מע"מ'
          : 'סה"כ ששולם',
    valueAgorot: input.totalAgorot,
    emphasis: true,
  })

  const notes: string[] = []
  if (input.documentType === 'coupon_receipt') {
    notes.push('קבלה על תשלום מראש. אינה חשבונית מס.')
  }
  if (input.documentType === 'tax_invoice_receipt' && input.payment) {
    notes.push('התקבל בתשלום מלא. מסמך זה משמש גם כקבלה.')
  }

  const footerLines = [
    'מסמך ממוחשב',
    `הופק ב-${formatDateTimeForPdf(input.generatedAt ?? input.issuedAt)}`,
  ]

  return {
    title: `${TITLES[input.documentType]} ${input.documentNumber}`,
    copyLabel: COPY_LABELS[copy],
    issuerLines,
    metaLines,
    customerLines,
    columns: { description: 'תיאור', quantity: 'כמות', unit: 'מחיר ליחידה', total: 'סה"כ' },
    rows,
    totals,
    notes,
    footerLines,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const FOOTER_HEIGHT = 36

// Column right edges, in an RTL table: description hugs the right margin,
// totals sit leftmost.
const COL_DESCRIPTION_RIGHT = PAGE_WIDTH - MARGIN
const COL_QUANTITY_RIGHT = 250
const COL_UNIT_RIGHT = 185
const COL_TOTAL_RIGHT = 105
const DESCRIPTION_MAX_WIDTH = COL_DESCRIPTION_RIGHT - COL_QUANTITY_RIGHT - 12

let cachedFonts: { regular: Uint8Array; bold: Uint8Array } | null = null

function loadFonts(): { regular: Uint8Array; bold: Uint8Array } {
  if (!cachedFonts) {
    // Copied into plain Uint8Arrays: pdf-lib's validator rejects a Node
    // Buffer when the test realm's Uint8Array is not the one it captured.
    cachedFonts = {
      regular: new Uint8Array(
        readFileSync(join(process.cwd(), 'src/assets/fonts/Heebo-Regular.ttf')),
      ),
      bold: new Uint8Array(readFileSync(join(process.cwd(), 'src/assets/fonts/Heebo-Bold.ttf'))),
    }
  }
  return cachedFonts
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const text = composeInvoiceText(input)

  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ])
  const fontkit = fontkitModule.default

  const pdf = await PDFDocument.create()
  pdf.setTitle(text.title)
  pdf.setAuthor(input.issuer.businessName)
  pdf.setSubject(`${text.title} (${text.copyLabel})`)
  pdf.setLanguage('he-IL')
  pdf.registerFontkit(fontkit)
  const fonts = loadFonts()
  const regular = await pdf.embedFont(fonts.regular, { subset: true })
  const bold = await pdf.embedFont(fonts.bold, { subset: true })

  const black = rgb(0.1, 0.1, 0.1)
  const grey = rgb(0.45, 0.45, 0.45)

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  type Font = typeof regular

  const drawRightAligned = (
    value: string,
    rightX: number,
    atY: number,
    font: Font,
    size: number,
    color = black,
  ): void => {
    const visual = bidiVisual(value)
    page.drawText(visual, {
      x: rightX - font.widthOfTextAtSize(visual, size),
      y: atY,
      size,
      font,
      color,
    })
  }

  const drawLeftAligned = (
    value: string,
    leftX: number,
    atY: number,
    font: Font,
    size: number,
    color = black,
  ): void => {
    page.drawText(bidiVisual(value), { x: leftX, y: atY, size, font, color })
  }

  const fitToWidth = (value: string, font: Font, size: number, maxWidth: number): string => {
    if (font.widthOfTextAtSize(bidiVisual(value), size) <= maxWidth) return value
    let candidate = value
    while (candidate.length > 1) {
      candidate = candidate.slice(0, -1)
      const trimmed = `${candidate.trimEnd()}…`
      if (font.widthOfTextAtSize(bidiVisual(trimmed), size) <= maxWidth) return trimmed
    }
    return '…'
  }

  const floor = MARGIN + FOOTER_HEIGHT

  const ensureRoom = (needed: number): void => {
    if (y - needed >= floor) return
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  const rule = (): void => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: grey,
    })
  }

  // Issuer header, with the original/copy marking opposite it. The marking is
  // the one thing on the page a reader checks before the number.
  drawLeftAligned(text.copyLabel, MARGIN, y, bold, 14, grey)
  for (const [i, line] of text.issuerLines.entries()) {
    if (i === 0) {
      drawRightAligned(line, PAGE_WIDTH - MARGIN, y, bold, 16)
      y -= 20
    } else {
      drawRightAligned(line, PAGE_WIDTH - MARGIN, y, regular, 10, grey)
      y -= 14
    }
  }
  y -= 12

  // Title and number
  drawRightAligned(text.title, PAGE_WIDTH - MARGIN, y, bold, 14)
  y -= 22

  // Meta
  for (const line of text.metaLines) {
    drawRightAligned(line, PAGE_WIDTH - MARGIN, y, regular, 10)
    y -= 14
  }
  y -= 6

  // Customer
  for (const [i, line] of text.customerLines.entries()) {
    drawRightAligned(
      line,
      PAGE_WIDTH - MARGIN,
      y,
      regular,
      i === 0 ? 10 : 9,
      i === 0 ? black : grey,
    )
    y -= 14
  }
  y -= 10

  // Table header
  const drawTableHeader = (): void => {
    drawRightAligned(text.columns.description, COL_DESCRIPTION_RIGHT, y, bold, 10)
    drawRightAligned(text.columns.quantity, COL_QUANTITY_RIGHT, y, bold, 10)
    drawRightAligned(text.columns.unit, COL_UNIT_RIGHT, y, bold, 10)
    drawRightAligned(text.columns.total, COL_TOTAL_RIGHT, y, bold, 10)
    y -= 6
    rule()
    y -= 14
  }
  drawTableHeader()

  for (const row of text.rows) {
    if (y < floor + 40) {
      ensureRoom(PAGE_HEIGHT)
      drawTableHeader()
    }
    const description = fitToWidth(row.description, regular, 10, DESCRIPTION_MAX_WIDTH)
    drawRightAligned(description, COL_DESCRIPTION_RIGHT, y, regular, 10)
    drawRightAligned(row.quantity, COL_QUANTITY_RIGHT, y, regular, 10)
    drawRightAligned(row.unit, COL_UNIT_RIGHT, y, regular, 10)
    drawRightAligned(row.total, COL_TOTAL_RIGHT, y, regular, 10)
    y -= 15
  }

  y -= 4
  ensureRoom(40 + text.totals.length * 18 + text.notes.length * 14)
  rule()
  y -= 18

  // Totals. A coupon receipt has no VAT lines: the advance's VAT event has not
  // occurred yet (see `isTaxableDocument`), so the split would be a claim the
  // document must not make. `composeInvoiceText` already left them out.
  const totalsRight = COL_UNIT_RIGHT + 30
  for (const total of text.totals) {
    const font = total.emphasis ? bold : regular
    const size = total.emphasis ? 12 : 10
    drawRightAligned(total.label, totalsRight, y, font, size)
    drawRightAligned(formatAmountForPdf(total.valueAgorot), COL_TOTAL_RIGHT, y, font, size)
    y -= total.emphasis ? 20 : 15
  }

  for (const note of text.notes) {
    drawRightAligned(note, PAGE_WIDTH - MARGIN, y, regular, 9, grey)
    y -= 14
  }

  // Footer on every page: the computerized-document statement, when this
  // rendering was produced, and the page count, which is what tells a reader
  // holding one sheet of a two-page invoice that there is another.
  const pages = pdf.getPages()
  for (const [index, footerPage] of pages.entries()) {
    const footerY = MARGIN - 6
    footerPage.drawLine({
      start: { x: MARGIN, y: footerY + 14 },
      end: { x: PAGE_WIDTH - MARGIN, y: footerY + 14 },
      thickness: 0.5,
      color: grey,
    })
    const right = bidiVisual(text.footerLines.join('  |  '))
    footerPage.drawText(right, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(right, 8),
      y: footerY,
      size: 8,
      font: regular,
      color: grey,
    })
    const left = bidiVisual(`עמוד ${index + 1} מתוך ${pages.length}`)
    footerPage.drawText(left, { x: MARGIN, y: footerY, size: 8, font: regular, color: grey })
  }

  return pdf.save()
}
