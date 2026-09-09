// @vitest-environment node
//
// NODE, NOT JSDOM, and the reason is already documented in
// `lib/invoices/settlement-pdf.test.ts`: `PDFDocument.embedFont` type checks
// with `instanceof Uint8Array`, and under the shared jsdom environment a Buffer
// from `node:fs` belongs to a different realm than jsdom's `Uint8Array` - so the
// check fails and pdf-lib reports the font as "of type NaN". This test hit
// exactly that on its first run.
import { buildCertificatePdf } from '@/lib/courses/certificate'
import { toVisual } from '@/lib/pdf/hebrew'
import { describe, expect, it } from 'vitest'

/**
 * The certificate.
 *
 * WHAT IS ASSERTED AND WHAT IS NOT. Not the bytes: a PDF that renders Hebrew
 * backwards parses perfectly and passes every structural check, which is how
 * [79] shipped three Open Graph cards reading `סרפסקא ןוינק`. What is asserted
 * is that the document builds at all, and separately that the reordering the
 * page depends on does what the page assumes.
 */
describe('buildCertificatePdf', () => {
  it('produces a PDF', async () => {
    const bytes = await buildCertificatePdf({
      learnerName: 'ישראל ישראלי',
      courseTitle: 'קורס בישול',
      completedAt: new Date('2026-09-09T12:00:00Z'),
      certificateId: '11111111-1111-4111-8111-111111111111',
    })
    expect(bytes.length).toBeGreaterThan(1000)
    // %PDF-
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('handles a Latin name without reversing it', async () => {
    // The page draws every string through one code path, so a Latin learner
    // name goes through `toVisual` too and must come out untouched.
    expect(toVisual('Israel Israeli')).toBe('Israel Israeli')
    const bytes = await buildCertificatePdf({
      learnerName: 'Israel Israeli',
      courseTitle: 'Cooking',
      completedAt: new Date('2026-09-09T12:00:00Z'),
      certificateId: 'abc',
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('reorders Hebrew rather than drawing it logically', () => {
    // The assertion the whole page rests on. `pdf-lib` applies no bidi pass, so
    // Hebrew handed to it straight is drawn backwards - in a valid PDF, with no
    // error anywhere.
    expect(toVisual('תעודת סיום')).not.toBe('תעודת סיום')
    expect(toVisual(toVisual('תעודת סיום'))).toBe('תעודת סיום')
  })
})
