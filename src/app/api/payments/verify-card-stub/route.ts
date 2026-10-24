import { createHash } from 'node:crypto'
import { agorot } from '@/lib/money'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Stub of the 1 ILS card verification. It never reaches a payment provider and
 * writes nothing, so it cannot charge a card. Off unless
 * CARD_VERIFY_STUB_ENABLED=true; otherwise the route answers 404.
 *
 * Idempotent by construction: the verification id is a hash of the user and the
 * Idempotency-Key header, so a retry with the same key returns the same body.
 */
const VERIFICATION_AMOUNT_AGOROT = agorot(100)
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

function isCardVerifyStubEnabled(): boolean {
  return process.env.CARD_VERIFY_STUB_ENABLED === 'true'
}

function stubVerificationId(userId: string, key: string): string {
  return createHash('sha256').update(`${userId}:${key}`).digest('hex').slice(0, 32)
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!isCardVerifyStubEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!(await checkRateLimit(`verify-card-stub:${user.id}`, 20, 3600))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const key = request.headers.get('idempotency-key')
  if (!key || !KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 })
  }

  return NextResponse.json({
    status: 'verified',
    stub: true,
    verificationId: stubVerificationId(user.id, key),
    amountAgorot: VERIFICATION_AMOUNT_AGOROT,
    charged: false,
  })
}

export const POST = withRequestLog('/api/payments/verify-card-stub', handlePOST)
