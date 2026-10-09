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
 * WHY THIS EXISTS WHEN THE PROVIDER ALSO MAKES ONE. The provider's PDF is the
 * primary document and is mirrored into R2 when it can be fetched. But the
 * legacy document endpoint can answer with a number and no fetchable PDF, and
 * a customer whose order page says "invoice" and serves nothing is owed more
 * than a log line. This renderer produces the document from the same
 * `InvoiceDocument` the provider call was built from, so the two can never
 * disagree about the money.
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

const RTL_CHAR = /[֐-׿יִ-ﭏ]/
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

function formatDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(value)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}.${get('month')}.${get('year')}`
}

const TITLES: Record<InvoiceDocumentType, string> = {
  tax_invoice_receipt: 'חשבונית מס/קבלה',
  coupon_receipt: 'קבלה',
  credit_note: 'חשבונית זיכוי',
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

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
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48

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
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ])
  const fontkit = fontkitModule.default

  const pdf = await PDFDocument.create()
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

  const ensureRoom = (needed: number): void => {
    if (y - needed >= MARGIN) return
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  // Issuer header
  drawRightAligned(input.issuer.businessName, PAGE_WIDTH - MARGIN, y, bold, 16)
  y -= 20
  if (input.issuer.taxId) {
    drawRightAligned(`עוסק/ח.פ ${input.issuer.taxId}`, PAGE_WIDTH - MARGIN, y, regular, 10, grey)
    y -= 14
  }
  if (input.issuer.address) {
    drawRightAligned(input.issuer.address, PAGE_WIDTH - MARGIN, y, regular, 10, grey)
    y -= 14
  }
  y -= 12

  // Title and number
  drawRightAligned(
    `${TITLES[input.documentType]} ${input.documentNumber}`,
    PAGE_WIDTH - MARGIN,
    y,
    bold,
    14,
  )
  drawRightAligned('מסמך ממוחשב', MARGIN + 90, y, regular, 9, grey)
  y -= 22

  // Meta
  drawRightAligned(`תאריך: ${formatDate(input.issuedAt)}`, PAGE_WIDTH - MARGIN, y, regular, 10)
  y -= 14
  drawRightAligned(
    `הזמנה: ${input.reference.slice(0, 8).toUpperCase()}`,
    PAGE_WIDTH - MARGIN,
    y,
    regular,
    10,
  )
  y -= 14
  if (input.providerDocumentNumber) {
    drawRightAligned(
      `אסמכתת סליקה: ${input.providerDocumentNumber}`,
      PAGE_WIDTH - MARGIN,
      y,
      regular,
      10,
    )
    y -= 14
  }
  y -= 6

  // Customer
  const customerName = input.customer.name?.trim() || 'לקוח/ה'
  drawRightAligned(`לכבוד: ${customerName}`, PAGE_WIDTH - MARGIN, y, regular, 10)
  y -= 14
  const contact = [input.customer.email, input.customer.phone]
    .filter((v): v is string => !!v && v.trim() !== '')
    .join('  |  ')
  if (contact) {
    drawRightAligned(contact, PAGE_WIDTH - MARGIN, y, regular, 9, grey)
    y -= 14
  }
  y -= 10

  // Table header
  const drawTableHeader = (): void => {
    drawRightAligned('תיאור', COL_DESCRIPTION_RIGHT, y, bold, 10)
    drawRightAligned('כמות', COL_QUANTITY_RIGHT, y, bold, 10)
    drawRightAligned('מחיר ליחידה', COL_UNIT_RIGHT, y, bold, 10)
    drawRightAligned('סה"כ', COL_TOTAL_RIGHT, y, bold, 10)
    y -= 6
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: grey,
    })
    y -= 14
  }
  drawTableHeader()

  for (const line of input.lines) {
    if (y < MARGIN + 40) {
      ensureRoom(PAGE_HEIGHT)
      drawTableHeader()
    }
    const description = fitToWidth(line.description, regular, 10, DESCRIPTION_MAX_WIDTH)
    drawRightAligned(description, COL_DESCRIPTION_RIGHT, y, regular, 10)
    drawRightAligned(String(line.quantity), COL_QUANTITY_RIGHT, y, regular, 10)
    drawRightAligned(formatAmountForPdf(line.unitPriceAgorot), COL_UNIT_RIGHT, y, regular, 10)
    drawRightAligned(formatAmountForPdf(line.totalAgorot), COL_TOTAL_RIGHT, y, regular, 10)
    y -= 15
  }

  y -= 4
  ensureRoom(80)
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.7,
    color: grey,
  })
  y -= 18

  // Totals. A coupon receipt states no VAT: the advance's VAT event has not
  // occurred yet (see `isTaxableDocument`), so the split lines would be a
  // claim the document must not make.
  const totalsRight = COL_UNIT_RIGHT + 30
  if (input.documentType !== 'coupon_receipt') {
    drawRightAligned('סה"כ לפני מע"מ', totalsRight, y, regular, 10)
    drawRightAligned(formatAmountForPdf(input.netAgorot), COL_TOTAL_RIGHT, y, regular, 10)
    y -= 15
    drawRightAligned(`מע"מ ${input.vatPercent}%`, totalsRight, y, regular, 10)
    drawRightAligned(formatAmountForPdf(input.vatAgorot), COL_TOTAL_RIGHT, y, regular, 10)
    y -= 15
  }
  const totalLabel = input.documentType === 'credit_note' ? 'סה"כ זיכוי' : 'סה"כ ששולם'
  drawRightAligned(totalLabel, totalsRight, y, bold, 12)
  drawRightAligned(formatAmountForPdf(input.totalAgorot), COL_TOTAL_RIGHT, y, bold, 12)
  y -= 20

  if (input.documentType === 'coupon_receipt') {
    drawRightAligned(
      'קבלה על תשלום מראש. אינה חשבונית מס.',
      PAGE_WIDTH - MARGIN,
      y,
      regular,
      9,
      grey,
    )
  }

  return pdf.save()
}
