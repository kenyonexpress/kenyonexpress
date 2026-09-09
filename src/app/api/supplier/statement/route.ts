import { formatIls } from '@/lib/account/format'
import { buildSettlementPdf } from '@/lib/invoices/settlement-pdf'
import {
  buildSettlementStatement,
  isMonthKey,
  monthsWithActivity,
} from '@/lib/invoices/settlement-statement'
import { agorot } from '@/lib/money'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type CsvColumn, csvHeaders, toCsv } from '@/lib/reports/csv'
import {
  type PayoutBreakdownLine,
  SETTLEMENT_LABEL_HE,
  toPayoutBreakdown,
} from '@/lib/supplier/dashboard'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { getSupplierSales } from '@/server/queries/supplier'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * One calendar month of a supplier's settlement, as CSV or as PDF.
 *
 * WHAT THIS IS NOT. `/api/supplier/payouts/csv` exports the settlement
 * breakdown, and it exports ALL of it -- every line the supplier has ever sold,
 * every time. That is right for "let me look at everything" and wrong for what
 * a supplier needs each month, which is a statement they hand to a bookkeeper
 * next to the month's invoice. Israeli bookkeeping runs on the calendar month.
 *
 * A ROUTE AND NOT A SERVER ACTION, for the reason the reports CSV and the QR
 * sheet already give: the browser has to be handed a file, and an `<a href>` is
 * the whole feature.
 *
 * THE GUARD IS RE-CHECKED HERE. This is a plain GET at a guessable URL and
 * behind it are commission terms and payout amounts. `owner`, matching
 * `/supplier/payouts` and the all-time CSV -- the same rows, so the same gate.
 * `requireSupplierRole` redirects, which is correct here: a signed-out request
 * to a download lands on a login page rather than saving a file called
 * `statement`.
 *
 * Both formats come from the SAME `buildSettlementStatement`, so a PDF handed
 * to an accountant and a CSV opened in a spreadsheet cannot disagree about the
 * month's total.
 */

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const session = await requireSupplierRole('owner', '/supplier/payouts')

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv'
  const requested = url.searchParams.get('month')

  const salesRead = await getSupplierSales(session.supplierId)
  // A STATEMENT REFUSES WHERE A PAGE WARNS. The portal pages render a banner
  // over a partial total, because a supplier glancing at a dashboard can be
  // told the figure is incomplete. This file is handed to a bookkeeper and
  // filed against a month's invoice, and it outlives the banner that would have
  // qualified it -- a PDF with a footer nobody reads is a document that lies at
  // the moment it matters. So an unfinished read produces no document at all.
  if (salesRead.failed || salesRead.truncated) {
    return NextResponse.json(
      { error: 'לא ניתן להפיק דוח מלא כרגע. נסו שוב מאוחר יותר או פנו אלינו.' },
      { status: 503 },
    )
  }
  const lines = toPayoutBreakdown(salesRead.rows)

  // No month asked for: the most recent one with anything in it. NOT "this
  // month", which on the 1st of a month is an empty statement and reads as a
  // broken download.
  const month = isMonthKey(requested) ? requested : monthsWithActivity(lines)[0]
  if (!month) {
    return NextResponse.json({ error: 'אין עדיין תנועות להפקת דוח.', months: [] }, { status: 404 })
  }

  const statement = buildSettlementStatement({
    month,
    supplierName: session.supplierName,
    lines,
  })

  if (format === 'pdf') {
    const bytes = await buildSettlementPdf({ statement, generatedAt: new Date() })
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        // `attachment`, not `inline`. This is a document to keep, and a PDF
        // that opens in a tab is one a supplier has to remember to save.
        'Content-Disposition': `attachment; filename="settlement-${month}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const columns: readonly CsvColumn<PayoutBreakdownLine>[] = [
    { header: 'מוצר', value: (row) => row.productName },
    { header: 'סוג', value: (row) => (row.productType === 'coupon' ? 'קופון' : 'פיזי') },
    { header: 'עמלת פלטפורמה %', value: (row) => String(row.platformPercent ?? '') },
    // Both forms of every amount, the same pairing the all-time CSV uses: the
    // shekel string for whoever opens it in Excel, the agorot integer for
    // whoever reconciles by machine.
    { header: 'ברוטו (₪)', value: (row) => formatIls(agorot(row.grossAgorot)) },
    { header: 'ברוטו (אגורות)', value: (row) => String(row.grossAgorot) },
    { header: 'עמלה (אגורות)', value: (row) => String(row.platformFeeAgorot) },
    { header: 'לתשלום לספק (₪)', value: (row) => formatIls(agorot(row.supplierPayoutAgorot)) },
    { header: 'לתשלום לספק (אגורות)', value: (row) => String(row.supplierPayoutAgorot) },
    // Zero on every line that was not reversed. A refunded line reads 0 in the
    // payout columns above and its original share here, so the file explains
    // its own totals instead of looking like a line that was never paid.
    { header: 'זיכוי (אגורות)', value: (row) => String(row.reversedPayoutAgorot) },
    {
      header: 'סטטוס סליקה',
      value: (row) =>
        (row.settlementStatus && SETTLEMENT_LABEL_HE[row.settlementStatus]) ||
        String(row.settlementStatus ?? ''),
    },
    { header: 'שולם בתאריך', value: (row) => row.paidAt ?? '' },
  ]

  return new NextResponse(toCsv(statement.lines, columns), {
    headers: csvHeaders(`settlement-${month}.csv`),
  })
}

export const GET = withRequestLog('/api/supplier/statement', handleGET)
