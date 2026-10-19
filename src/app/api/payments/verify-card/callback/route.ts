import { withRequestLog } from '@/lib/observability/with-request-log'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { completeCardVerification } from '../route'

async function handleCallback(request: NextRequest): Promise<NextResponse> {
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
