import { withRequestLog } from '@/lib/observability/with-request-log'
import { completeCardVerification } from '@/lib/payments/verify-card'
import { requestIp } from '@/lib/rate-limit/request-ip'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function handleCallback(request: NextRequest): Promise<NextResponse> {
  // Reached by URL alone, and each call asks the provider about a verification.
  if (!(await checkRateLimit(`webhook-cardcom:${requestIp(request)}`, 600, 60))) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': '60' } },
    )
  }

  const verificationId = request.nextUrl.searchParams.get('v')
  if (!verificationId) {
    return NextResponse.json({ error: 'missing_verification_id' }, { status: 400 })
  }

  const status = await completeCardVerification(verificationId)
  if (status === 'verified') {
    return NextResponse.json({ status: 'verified', message: 'Card verified successfully' })
  }
  if (status === 'failed') {
    return NextResponse.json({ error: 'verification_failed', status }, { status: 400 })
  }
  return NextResponse.json({ error: 'verification_pending', status }, { status: 202 })
}

export const GET = withRequestLog('/api/payments/verify-card/callback', handleCallback)
export const POST = withRequestLog('/api/payments/verify-card/callback', handleCallback)
