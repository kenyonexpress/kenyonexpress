import { formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/money'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type CsvColumn, csvHeaders, toCsv } from '@/lib/reports/csv'
import type { SupplierRedemptionRow } from '@/lib/supplier/dashboard'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import { formatVoucherCode } from '@/server/domain/vouchers/code'
import { getSupplierRedemptions } from '@/server/queries/supplier'
import { NextResponse } from 'next/server'

/**
 * The supplier's own coupon scans as CSV -- section 28's "downloadable
 * redemption CSV for their own data only".
 *
 * OWN DATA ONLY IS NOT ENFORCED HERE, AND THAT IS THE POINT. There is no
 * supplier id in this request: no query parameter, no body, no header. The only
 * id that exists is the one `requireSupplierMember` reads out of an active
 * `supplier_members` row for the caller, and `getSupplierRedemptions` filters on
 * exactly that. An endpoint that accepted an id and then checked it would have
 * a check to get wrong; this one has nothing to tamper with.
 *
 * SCANNER-GATED, matching /supplier/redemptions rather than /supplier/payouts.
 * The payouts CSV is owner-only because its rows carry commission terms. This
 * file is the same rows the redemptions page already shows a scanner, from the
 * same query -- so gating the export higher than the screen would hide nothing
 * and only stop a till from exporting its own day.
 *
 * A PARTIAL EXPORT IS REFUSED. Same reason as the payouts CSV: a spreadsheet
 * opened tomorrow carries no banner, and a file that silently stops short is
 * reconciled as if it were whole.
 */
async function handleGET(): Promise<NextResponse> {
  const session = await requireSupplierMember('/supplier/redemptions')
  const read = await getSupplierRedemptions(session.supplierId)

  if (read.failed || read.truncated) {
    return NextResponse.json(
      { error: 'לא ניתן להפיק את הקובץ המלא כרגע. נסו שוב מאוחר יותר או פנו אלינו.' },
      { status: 503 },
    )
  }

  const columns: readonly CsvColumn<SupplierRedemptionRow>[] = [
    // The grouped display form (`XXXX-XXXX`), which is what is printed on the
    // voucher and what a supplier searching this file will type.
    { header: 'קוד שובר', value: (row) => formatVoucherCode(row.code) },
    { header: 'מוצר', value: (row) => row.productName },
    { header: 'תאריך מימוש', value: (row) => row.redeemedAt ?? '' },
    { header: 'שולם באתר (₪)', value: (row) => formatIls(agorot(row.couponPriceAgorot)) },
    { header: 'שולם באתר (אגורות)', value: (row) => String(row.couponPriceAgorot) },
    // The number the till actually took over the counter. It is the reason this
    // export exists: it is not in our ledger anywhere, so this file is the only
    // record a shop can reconcile its drawer against.
    { header: 'נגבה בקופה (₪)', value: (row) => formatIls(agorot(row.remainingAmountDueAgorot)) },
    { header: 'נגבה בקופה (אגורות)', value: (row) => String(row.remainingAmountDueAgorot) },
    { header: 'עמלת פלטפורמה %', value: (row) => String(row.platformPercent ?? '') },
  ]

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(read.rows, columns), {
    headers: csvHeaders(`redemptions-${today}.csv`),
  })
}

export const GET = withRequestLog('/api/supplier/redemptions/csv', handleGET)
