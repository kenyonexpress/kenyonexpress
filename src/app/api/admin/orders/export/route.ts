import { canReadSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { csvHeaders, toCsv } from '@/lib/reports/csv'
import { createClient } from '@/lib/supabase/server'
import { FULFILLMENT_LANES, type FulfillmentLane } from '@/server/domain/orders/fulfillment-lanes'
import { orderCsvColumns, ordersCsvFilename } from '@/server/domain/orders/orders-csv'
import { todayInIsrael } from '@/server/domain/reports/settlement-report'
import { BOARD_LIMIT, loadBoardOrders } from '@/server/queries/fulfillment-board'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * CSV export for the fulfilment board (STEP 15).
 *
 * A route and not a server action, for the reason the reports export gives:
 * the browser has to be handed a file, and an `<a href>` to a route is the
 * whole feature. The guard is re-checked here and answers 403, not a redirect,
 * because a 307 to /login in answer to a download reaches the operator as a
 * file called `login`.
 *
 * Two shapes of request. `?ids=a,b,c` exports the selection the toolbar holds
 * (capped at the board's limit); without it the filters export what the
 * board shows: `lane`, `q`, `from`, `to`. Both go through `loadBoardOrders`,
 * so the file is the board.
 */

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  lane: z.enum(FULFILLMENT_LANES as [FulfillmentLane, ...FulfillmentLane[]]).optional(),
  ids: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()).max(BOARD_LIMIT))
    .optional(),
})

async function handleGET(request: NextRequest): Promise<Response> {
  const session = await getSessionWithRole()
  if (!session || !canReadSection(session.role, 'orders')) {
    log.warn('orders.export_denied', { role: session?.role ?? null })
    return new Response('אין הרשאה', { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const parsed = querySchema.safeParse({
    q: params.get('q') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    lane: params.get('lane') ?? undefined,
    ids: params.get('ids') ?? undefined,
  })
  if (!parsed.success) {
    return new Response('בקשה לא תקינה', { status: 400 })
  }

  const supabase = await createClient()
  const result = await loadBoardOrders(supabase, parsed.data)
  if (result.error) {
    // 503 and not an empty file: a CSV of headers with no rows is
    // indistinguishable from a quiet day.
    return new Response(result.error, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  const csv = toCsv(result.orders, orderCsvColumns)
  log.info('orders.exported', {
    rows: result.orders.length,
    lane: parsed.data.lane ?? null,
    selection: parsed.data.ids?.length ?? 0,
  })

  return new Response(csv, {
    headers: csvHeaders(ordersCsvFilename(todayInIsrael(), parsed.data.lane)),
  })
}

export const GET = withRequestLog('/api/admin/orders/export', handleGET)
