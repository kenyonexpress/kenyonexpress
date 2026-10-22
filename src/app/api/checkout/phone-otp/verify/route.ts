import { toE164Israeli } from '@/lib/auth/phone-otp'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { verifyCheckoutPhoneOtp } from '@/server/checkout/verified-shipping'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Checks the checkout phone-verification code (F42). A right answer consumes
 * the row, and that consumed row is what `submitCheckout` later reads as the
 * proof, so this endpoint sets no cookie and no flag the form could forge.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    phone?: unknown
    code?: unknown
  } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!/^[0-9]{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  }
  const phone = typeof body?.phone === 'string' ? toE164Israeli(body.phone) : null
  if (!phone) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

  if (!(await checkRateLimit(`checkout-otp-verify:${user.id}`, 10, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const result = await verifyCheckoutPhoneOtp(createAdminClient(), user.id, phone, code)
  if (result !== 'ok') return NextResponse.json({ ok: false, error: result }, { status: 400 })
  return NextResponse.json({ ok: true, phone })
}

export const POST = withRequestLog('/api/checkout/phone-otp/verify', handlePOST)
