import { withRequestLog } from '@/lib/observability/with-request-log'
import { limitByIp } from '@/lib/rate-limit/route-guard'
import { completeSupplierCardVerification } from '@/server/supplier/card-verification'
import { NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Where Cardcom sends the applicant back, and where its indicator calls.
 * Neither request is trusted for the verdict: the handler asks Cardcom itself
 * (see card-verification.ts) and is idempotent, so both arriving is fine.
 */
async function handle(request: Request): Promise<Response> {
  const limited = await limitByIp('supplier-card-verify', 20, 3600)
  if (limited) return limited

  const url = new URL(request.url)
  const id = url.searchParams.get('v') ?? ''
  const back = new URL('/suppliers', url.origin)
  if (!UUID.test(id)) {
    back.searchParams.set('card', 'failed')
    return NextResponse.redirect(back, 303)
  }
  const status = await completeSupplierCardVerification(id, {
    reportedFailure: url.searchParams.get('failed') === '1',
  })
  back.searchParams.set('card', status)
  const response = NextResponse.redirect(back, 303)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

// GET only: Cardcom calls the legacy IndicatorUrl with a GET (KB AA-00436),
// and the browser comes back on the redirect with a GET too.
export const GET = withRequestLog('/api/supplier-apply/card-verify', handle)
