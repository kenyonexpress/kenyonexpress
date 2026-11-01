import { withRequestLog } from '@/lib/observability/with-request-log'
import { completeCardVerification } from '@/lib/payments/verify-card'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { requestIp } from '@/lib/rate-limit/request-ip'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function handleCallback(request: NextRequest): Promise<Response> {
  const decision = await rateLimit('verify-card-callback', requestIp(request))
  if (!decision.allowed) return tooManyRequests(decision)
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
