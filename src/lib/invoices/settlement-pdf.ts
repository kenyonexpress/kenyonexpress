import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/money'
import { rightAlignedX, toVisual } from '@/lib/pdf/hebrew'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import type { SettlementStatement } from './settlement-statement'

/**
 * A supplier's monthly settlement statement, in Hebrew, as a PDF.
 *
 * WHY A PDF AND NOT ONLY THE CSV THAT ALREADY EXISTS
 *
 * They are for different people. The CSV is for a machine and for a person
 * reconciling in a spreadsheet. The PDF is what a supplier hands to their
 * bookkeeper next to the month's invoice: it has a header, a period, a total,
 * and it does not change when somebody sorts a column.
 *
 * THE TWO THINGS THAT MAKE A HEBREW PDF DIFFERENT
 *
 * (1) `pdf-lib`'s standard fonts are WinAnsi-encoded and cannot draw a single
 * Hebrew character -- `qr-pdf.ts` hit this first and solved it by having
 * nothing Hebrew to draw. Heebo is already in the repository for the web font,
 * so it is embedded here through `@pdf-lib/fontkit`. Subsetting is on, so the
 * file carries only the glyphs it uses rather than the whole face.
 *
 * (2) Text must be reordered before it is drawn. `drawText` paints glyphs in
 * the order the string holds them; a browser reorders Hebrew for display and a
 * PDF viewer does not, because the PDF already IS the display. Everything
 * Hebrew goes through `toVisual` -- see `lib/pdf/hebrew.ts` for what that does
 * to the numbers, which is nothing, deliberately.
 *
 * THE MONEY IS FORMATTED BY THE SAME FUNCTION THE SCREEN USES
 *
 * `formatIls` over integer agorot, so a total on this page cannot disagree with
 * the total on `/supplier/payouts`. A second formatter here would be a second
 * answer, and the first time they differed it would be in a document a
 * supplier had already filed.
 */

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = 46
const INK = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.85, 0.85, 0.85)

const FONT_DIR = join(process.cwd(), 'src/assets/fonts')

/** Right edge of the text column: everything in this document is right-aligned. */
const RIGHT = A4.width - MARGIN

interface Drawer {
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
}

/** Draw one right-aligned line of possibly-Hebrew text. */
function line(
  d: Drawer,
  text: string,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; rightEdge?: number } = {},
): void {
  const size = opts.size ?? 10
  const font = opts.bold ? d.bold : d.regular
  // Measured on the LOGICAL string and drawn from the VISUAL one. Both contain
  // the same glyphs, so the width is the same either way; measuring first is
  // what lets the caller reason in reading order.
  const x = rightAlignedX(font, text, size, opts.rightEdge ?? RIGHT)
  d.page.drawText(toVisual(text), { x, y, size, font, color: opts.color ?? INK })
}

export interface SettlementPdfInput {
  statement: SettlementStatement
  /** Printed in the footer so a supplier can tell two downloads apart. */
  generatedAt: Date
}

export async function buildSettlementPdf(input: SettlementPdfInput): Promise<Uint8Array> {
  const { statement } = input

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  // `subset: true` keeps the file to the glyphs actually used. A statement is
  // downloaded once a month by every supplier; shipping the whole Heebo face in
  // each one is a megabyte nobody reads.
  const regular = await doc.embedFont(readFileSync(join(FONT_DIR, 'Heebo-Regular.ttf')), {
    subset: true,
  })
  const bold = await doc.embedFont(readFileSync(join(FONT_DIR, 'Heebo-Bold.ttf')), {
    subset: true,
  })

  const page = doc.addPage([A4.width, A4.height])
  const d: Drawer = { page, regular, bold }

  let y = A4.height - MARGIN

  line(d, 'דוח התחשבנות חודשי', y, { size: 20, bold: true })
  y -= 26
  line(d, 'KenyonExpress', y, { size: 11, color: MUTED })
  y -= 26

  line(d, statement.supplierName, y, { size: 13, bold: true })
  y -= 16
  line(d, `חודש ${statement.month}`, y, { size: 11, color: MUTED })
  y -= 24

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: RIGHT, y },
    thickness: 1,
    color: RULE,
  })
  y -= 20

  // The column heads, right to left in reading order: product, gross, fee, due.
  // Their x positions are LEFT edges of right-aligned cells, so the numbers line
  // up on their last digit -- which is the only alignment that lets a column of
  // money be read down.
  const COL = { product: RIGHT, gross: RIGHT - 210, fee: RIGHT - 310, due: RIGHT - 410 }

  line(d, 'מוצר', y, { size: 10, bold: true, rightEdge: COL.product })
  line(d, 'ברוטו', y, { size: 10, bold: true, rightEdge: COL.gross })
  line(d, 'עמלה', y, { size: 10, bold: true, rightEdge: COL.fee })
  line(d, 'לתשלום', y, { size: 10, bold: true, rightEdge: COL.due })
  y -= 6
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.5, color: RULE })
  y -= 16

  for (const row of statement.lines) {
    if (y < MARGIN + 80) {
      // One page is enough for a month at this catalogue's size, and a
      // continuation page with no header is worse than a truncation that says
      // so. The CSV is the complete record and the footer points at it.
      line(d, '… ועוד שורות. הרשימה המלאה בקובץ ה-CSV.', y, { size: 9, color: MUTED })
      y -= 14
      break
    }
    // Truncated by WIDTH, not by character count: a Hebrew product name and a
    // Latin one of the same length occupy very different space.
    let name = row.productName
    while (regular.widthOfTextAtSize(name, 10) > 175 && name.length > 1) {
      name = name.slice(0, -1)
    }
    if (name !== row.productName) name = `${name}…`

    line(d, name, y, { size: 10, rightEdge: COL.product })
    line(d, formatIls(agorot(row.grossAgorot)), y, { size: 10, rightEdge: COL.gross })
    line(d, formatIls(agorot(row.platformFeeAgorot)), y, { size: 10, rightEdge: COL.fee })
    line(d, formatIls(agorot(row.supplierPayoutAgorot)), y, {
      size: 10,
      bold: true,
      rightEdge: COL.due,
    })
    y -= 15
  }

  y -= 8
  page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 1, color: RULE })
  y -= 20

  line(d, 'סה"כ', y, { size: 11, bold: true, rightEdge: COL.product })
  line(d, formatIls(agorot(statement.grossAgorot)), y, {
    size: 11,
    bold: true,
    rightEdge: COL.gross,
  })
  line(d, formatIls(agorot(statement.platformFeeAgorot)), y, {
    size: 11,
    bold: true,
    rightEdge: COL.fee,
  })
  line(d, formatIls(agorot(statement.supplierPayoutAgorot)), y, {
    size: 12,
    bold: true,
    rightEdge: COL.due,
  })
  y -= 26

  // The reversal line, and only when there is one. A statement whose payout
  // column reads zero on a sale the supplier remembers making has to say where
  // the money went, or the supplier calls to ask -- and the answer is not in
  // the document. Printed as a separate row rather than folded into the total,
  // because a refund is an event with its own date and not a smaller sale.
  if (statement.reversedPayoutAgorot > 0) {
    // The sign is carried by the WORD and not by a `-` glyph. `toVisual`
    // resolves a leading neutral against the paragraph, which is RTL here, so a
    // minus sign in front of an amount can land on the far side of it -- and a
    // credit that renders as a charge is the one mistake this row exists to
    // prevent. `בניכוי` says it in a character class that has a direction.
    line(d, `בניכוי זיכויים (${statement.refundedCount} שורות)`, y, {
      size: 10,
      rightEdge: COL.product,
      color: MUTED,
    })
    line(d, formatIls(agorot(statement.reversedPayoutAgorot)), y, {
      size: 10,
      rightEdge: COL.due,
      color: MUTED,
    })
    y -= 20
  }

  line(d, `${statement.lines.length} שורות, מתוכן ${statement.settledCount} סולקו`, y, {
    size: 9,
    color: MUTED,
  })
  y -= 14

  // Said on the document rather than left to be assumed. The platform's fee is
  // taken from the sale, and a supplier reading a total without knowing whether
  // VAT is inside it cannot file it.
  line(d, 'הסכומים כוללים מע"מ. המסמך אינו חשבונית ואינו מהווה אסמכתא לצורכי מס.', y, {
    size: 9,
    color: MUTED,
  })
  y -= 14
  line(d, `הופק ב-${input.generatedAt.toISOString().slice(0, 10)}`, y, { size: 9, color: MUTED })

  return doc.save()
}
