import { formatIls } from '@/lib/account/format'
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
import { NextResponse } from 'next/server'

/**
 * The supplier's settlement breakdown as CSV -- the same rows the
 * /supplier/payouts page renders, from the same query and the same breakdown
 * fold, so the export can never disagree with the screen. Owner-gated like
 * the page (the rows carry commission terms).
 *
 * Money is exported as a shekel STRING via the shared formatter, plus the raw
 * agorot integer beside it: the string for the human opening it in Excel, the
 * integer for anyone reconciling by machine.
 */
async function handleGET(): Promise<NextResponse> {
  const session = await requireSupplierRole('owner', '/supplier/payouts')
  const sales = await getSupplierSales(session.supplierId)
  const lines = toPayoutBreakdown(sales)

  const columns: readonly CsvColumn<PayoutBreakdownLine>[] = [
    { header: 'מוצר', value: (row) => row.productName },
    { header: 'סוג', value: (row) => (row.productType === 'coupon' ? 'קופון' : 'פיזי') },
    { header: 'עמלת פלטפורמה %', value: (row) => String(row.platformPercent ?? '') },
    { header: 'ברוטו (₪)', value: (row) => formatIls(agorot(row.grossAgorot)) },
    { header: 'ברוטו (אגורות)', value: (row) => String(row.grossAgorot) },
    { header: 'עמלה (אגורות)', value: (row) => String(row.platformFeeAgorot) },
    { header: 'לתשלום לספק (₪)', value: (row) => formatIls(agorot(row.supplierPayoutAgorot)) },
    { header: 'לתשלום לספק (אגורות)', value: (row) => String(row.supplierPayoutAgorot) },
    {
      header: 'סטטוס סליקה',
      value: (row) =>
        (row.settlementStatus && SETTLEMENT_LABEL_HE[row.settlementStatus]) ||
        String(row.settlementStatus ?? ''),
    },
    { header: 'שולם בתאריך', value: (row) => row.paidAt ?? '' },
  ]

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(lines, columns), {
    headers: csvHeaders(`payouts-${today}.csv`),
  })
}

export const GET = withRequestLog('/api/supplier/payouts/csv', handleGET)
