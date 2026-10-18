import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { settleAffiliateCommissions } from '@/server/affiliate/settle'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Pays matured affiliate commissions into wallets (migration 283). Daily is
 * plenty: nothing matures faster than the 14-day hold.
 *
 * Auth: Authorization: Bearer CRON_SECRET; a missing secret closes the route.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const summary = await settleAffiliateCommissions()
  return NextResponse.json({ ok: summary.failed === 0, ...summary })
}

export const GET = withRequestLog('/api/cron/affiliate-payouts', handleGET)
