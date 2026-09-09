// @vitest-environment node
//
// NODE, NOT JSDOM, AND IT IS NOT A PREFERENCE. `PDFDocument.embedFont` type
// checks its argument with `instanceof Uint8Array`, and under the shared jsdom
// environment a Buffer from `node:fs` belongs to a different realm than jsdom's
// `Uint8Array` -- so the check fails and pdf-lib reports the font as "of type
// NaN". The route this file covers runs in Node, so the test runs where the
// code does.
import type { PayoutBreakdownLine } from '@/lib/supplier/dashboard'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildSettlementPdf } from './settlement-pdf'
import { buildSettlementStatement } from './settlement-statement'

/**
 * The Hebrew PDF, built for real.
 *
 * These are integration cases on purpose. The reordering has its own unit tests
 * in `lib/pdf/hebrew.test.ts`; what cannot be unit tested is whether pdf-lib
 * will actually EMBED Heebo and encode Hebrew codepoints, which is the step
 * that fails with `WinAnsi cannot encode "ש" (0x05e9)` and fails at request
 * time, in a download, on a supplier's machine.
 */

const line = (over: Partial<PayoutBreakdownLine> = {}): PayoutBreakdownLine => ({
  orderItemId: 'item-1',
  productName: 'עיסוי מפנק לגבר 45 דקות',
  productType: 'physical',
  platformPercent: 30,
  grossAgorot: 10_000,
  platformFeeAgorot: 3_000,
  supplierPayoutAgorot: 7_000,
  reversedPayoutAgorot: 0,
  settlementStatus: 'settled',
  paidAt: '2026-09-15T10:00:00Z',
  ...over,
})

const statement = (lines: PayoutBreakdownLine[]) =>
  buildSettlementStatement({ month: '2026-09', supplierName: 'סוויטה ספא בוטיק', lines })

describe('building the statement PDF', () => {
  it('embeds a Hebrew font and produces a loadable document', async () => {
    // The whole point. pdf-lib's standard fonts throw on the first Hebrew
    // character; if the fontkit registration or the font file were missing,
    // this line would be where a supplier's download 500s instead.
    const bytes = await buildSettlementPdf({
      statement: statement([line()]),
      generatedAt: new Date('2026-10-01T09:00:00Z'),
    })

    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')

    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('produces a document for a month with no lines rather than throwing', async () => {
    // A supplier can ask for a quiet month, and an empty statement that says so
    // is a better answer than a 500 that reads as a broken feature.
    const bytes = await buildSettlementPdf({
      statement: statement([]),
      generatedAt: new Date('2026-10-01T09:00:00Z'),
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('survives a product name long enough to need truncating', async () => {
    // Truncation is by WIDTH, not character count, so a Hebrew name and a Latin
    // one of the same length are cut differently. The loop that does it walks
    // backwards and must terminate on a single-character name.
    const bytes = await buildSettlementPdf({
      statement: statement([line({ productName: 'א'.repeat(400) }), line({ productName: 'x' })]),
      generatedAt: new Date('2026-10-01T09:00:00Z'),
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })

  it('does not run off the page when a month has more lines than fit', async () => {
    const bytes = await buildSettlementPdf({
      statement: statement(Array.from({ length: 200 }, (_, i) => line({ orderItemId: `i${i}` }))),
      generatedAt: new Date('2026-10-01T09:00:00Z'),
    })
    const reloaded = await PDFDocument.load(bytes)
    // One page, with the overflow said in a line rather than drawn past the
    // margin. The CSV is the complete record and the footer points at it.
    expect(reloaded.getPageCount()).toBe(1)
  })
})
