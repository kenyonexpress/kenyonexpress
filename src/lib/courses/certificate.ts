import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rightAlignedX, textWidth, toVisual } from '@/lib/pdf/hebrew'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'

/**
 * The certificate a finished course produces.
 *
 * =========================================================================
 * IT GOES THROUGH `toVisual`, AND THAT IS NOT OPTIONAL
 * =========================================================================
 *
 * `pdf-lib` draws glyphs in the order it is given them and applies no bidi
 * algorithm at all. Hebrew handed to it straight comes out reversed - and it
 * comes out reversed in a valid PDF, with no error, which is exactly how
 * [79] shipped three Open Graph cards reading `סרפסקא ןוינק` before anybody
 * downloaded one and looked.
 *
 * So every Hebrew string on this page is reordered by `lib/pdf/hebrew.ts`
 * before it is drawn, the same as the settlement statement and the coupon PDF.
 * The test beside this file asserts it on the reordering rather than on the
 * bytes, because a PDF that renders backwards is a PDF that parses perfectly.
 *
 * =========================================================================
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 * =========================================================================
 *
 * "Completed the course" and nothing more. No grade, no hours of study, no
 * accreditation, no signature of a person. A certificate is a claim about
 * somebody's competence and this system knows exactly one fact: which lessons
 * were marked complete, and when the last one was. Printing anything else would
 * be inventing it, and a certificate is the document most likely to be shown to
 * an employer.
 */

const FONT_DIR = join(process.cwd(), 'src/assets/fonts')

/** A4 landscape. A certificate is hung on a wall, not filed in a folder. */
const PAGE = { width: 841.89, height: 595.28 }
const MARGIN = 56

export interface CertificateInput {
  /** The learner's name as they gave it. Printed verbatim. */
  learnerName: string
  courseTitle: string
  /** When the LAST lesson was completed. See `courseProgress`. */
  completedAt: Date
  /** Printed small, so two downloads of the same certificate are the same document. */
  certificateId: string
}

export async function buildCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const regular = await doc.embedFont(readFileSync(join(FONT_DIR, 'Heebo-Regular.ttf')), {
    subset: true,
  })
  const bold = await doc.embedFont(readFileSync(join(FONT_DIR, 'Heebo-Bold.ttf')), {
    subset: true,
  })

  const page = doc.addPage([PAGE.width, PAGE.height])
  const ink = rgb(0.2, 0.24, 0.28)
  const faint = rgb(0.55, 0.58, 0.6)

  // A border, so a screenshot of the middle of it is obviously not the document.
  page.drawRectangle({
    x: MARGIN / 2,
    y: MARGIN / 2,
    width: PAGE.width - MARGIN,
    height: PAGE.height - MARGIN,
    borderColor: faint,
    borderWidth: 1.5,
  })

  const line = (text: string, size: number, y: number, isBold = false, colour = ink) => {
    const font = isBold ? bold : regular
    const width = textWidth(font, text, size)
    page.drawText(toVisual(text), {
      x: (PAGE.width - width) / 2,
      y,
      size,
      font,
      color: colour,
    })
  }

  line('תעודת סיום', 34, PAGE.height - 140, true)
  line('מוענקת ל', 16, PAGE.height - 200, false, faint)
  line(input.learnerName, 30, PAGE.height - 250, true)
  line('על השלמת הקורס', 16, PAGE.height - 300, false, faint)
  line(input.courseTitle, 22, PAGE.height - 345, true)

  const completed = input.completedAt.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  line(`הושלם בתאריך ${completed}`, 14, PAGE.height - 405, false, faint)

  // The id is Latin and a uuid, so it is NOT reordered - `toVisual` leaves a
  // string with no RTL character alone, and this relies on that rather than
  // skipping the call, so one code path draws every string on the page.
  const idText = `מזהה: ${input.certificateId}`
  page.drawText(toVisual(idText), {
    x: rightAlignedX(regular, idText, 8, PAGE.width - MARGIN),
    y: MARGIN,
    size: 8,
    font: regular,
    color: faint,
  })

  line('קניון אקספרס', 12, MARGIN + 4, false, faint)

  return doc.save()
}
