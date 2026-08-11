import { canReadSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { csvHeaders, toCsv } from '@/lib/reports/csv'
import {
  reportFilename,
  salesColumns,
  supplierColumns,
} from '@/server/domain/reports/report-exports'
import {
  aggregate,
  fillDays,
  resolveReportRange,
  supplierObligations,
  todayInIsrael,
} from '@/server/domain/reports/settlement-report'
import { loadReportEvents } from '@/server/queries/reports'
import type { NextRequest } from 'next/server'

/**
 * CSV export for the two admin reports.
 *
 * A ROUTE AND NOT A SERVER ACTION, because the browser has to be handed a file.
 * A server action returns a value into the React tree; producing a download from
 * one means building a Blob on the client and clicking a synthetic anchor, which
 * is a client bundle and a lost `Content-Disposition` in exchange for nothing.
 * An `<a href>` to a route is the whole feature.
 *
 * THE GUARD IS RE-CHECKED HERE, NOT INHERITED FROM THE PAGE. Nothing about
 * having rendered `/admin/reports` is carried into this request: it is a plain
 * GET at a guessable URL, and the data behind it is every shekel the platform
 * has taken. `requireSection` is not used because it `redirect()`s, and a 307 to
 * /login in answer to a download reaches the user as a file called `login`
 * containing an HTML page. 403 with a body that says so is the honest answer.
 *
 * The range comes from the same `resolveReportRange` the page uses, so the file
 * matches the table it was downloaded from. That is the point of sharing it.
 */

const REPORTS = new Set(['sales', 'suppliers'])

async function handleGET(request: NextRequest, ctx: { params: Promise<{ report: string }> }) {
  const { report } = await ctx.params
  if (!REPORTS.has(report)) {
    return new Response('לא נמצא', { status: 404 })
  }

  const session = await getSessionWithRole()
  if (!session || !canReadSection(session.role, 'payments')) {
    log.warn('reports.export_denied', { report, role: session?.role ?? null })
    return new Response('אין הרשאה', { status: 403 })
  }

  // `new URL(request.url)` rather than `request.nextUrl`: identical here, and it
  // is the half of NextRequest that a plain Request also has, so the handler can
  // be called directly by a test without a Next server around it.
  const params = new URL(request.url).searchParams
  const range = resolveReportRange(
    {
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      granularity: params.get('granularity') ?? undefined,
    },
    todayInIsrael(),
  )

  const result = await loadReportEvents(range.from, range.to)
  if (!result.available) {
    // 503 and not an empty file. A CSV of headers with no rows is
    // indistinguishable from a genuinely quiet month, and this one would be
    // filed as evidence that there were no sales.
    return new Response(result.reason, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  const csv =
    report === 'sales'
      ? toCsv(
          range.granularity === 'day'
            ? fillDays(aggregate(result.events, 'day'), range.from, range.to)
            : aggregate(result.events, 'month'),
          salesColumns(range.granularity),
        )
      : toCsv(supplierObligations(result.events), supplierColumns)

  log.info('reports.exported', {
    report,
    from: range.from,
    to: range.to,
    granularity: range.granularity,
    events: result.events.length,
    truncated: result.truncated,
  })

  return new Response(csv, {
    headers: csvHeaders(reportFilename(report as 'sales' | 'suppliers', range.from, range.to)),
  })
}

export const GET = withRequestLog('/api/admin/reports/[report]', handleGET)
