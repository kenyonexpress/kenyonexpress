import { LEDGER_COLUMNS } from '@/lib/admin/payout-ledger'
import { requireSection } from '@/lib/admin/rbac'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { csvHeaders, toCsv } from '@/lib/reports/csv'
import { readSupplierLedger } from '@/server/queries/payout-ledger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * CSV of one supplier's payout ledger: every statement line, with the
 * statement's number, period and state. Linked from `/admin/payouts?supplier=`
 * and from the supplier's page.
 *
 * `requireSection('payments')` redirects an unauthenticated caller and throws
 * for a role without the section, same as the page that links here.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  await requireSection('payments')

  const supplier = z.string().uuid().safeParse(new URL(request.url).searchParams.get('supplier'))
  if (!supplier.success) {
    return NextResponse.json({ error: 'supplier: נדרש מזהה ספק תקין' }, { status: 400 })
  }

  const read = await readSupplierLedger(supplier.data)
  if (read.failed) {
    return NextResponse.json({ error: 'לא ניתן להפיק את היומן כרגע' }, { status: 503 })
  }
  if (read.truncated) {
    return NextResponse.json(
      { error: 'היומן ארוך מ-5000 שורות; צמצמו את הטווח דרך דוחות התשלום' },
      { status: 413 },
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(read.lines, LEDGER_COLUMNS), {
    headers: csvHeaders(`payout-ledger-${supplier.data.slice(0, 8)}-${today}.csv`),
  })
}

export const GET = withRequestLog('/api/admin/payouts/ledger', handleGET)
