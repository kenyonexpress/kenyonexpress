import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { pollActiveShipments } from '@/server/shipping/tracking-poll'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Hourly carrier tracking poll (STEP 43): every non-final row of `shipments`
 * is asked about, events are merged, and a parcel the carrier calls
 * delivered moves its lines through the same `deliver` transition the admin
 * buttons use, which is what folds the order and sends the delivery mail.
 *
 * Until pending 258 is applied there is no table and the run answers
 * `skipped: table_missing` with a 200, like every cron here whose table is
 * still in the queue. No money moves here.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, checked in
 * constant time. Unset secret stays closed rather than opening.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const summary = await pollActiveShipments(createAdminClient(), { limit: 100 })
  log.info('shipments.polled', { ...summary })
  return NextResponse.json({ ok: true, ...summary })
}

export const GET = withRequestLog('/api/cron/shipments-track', handleGET)
