import { isSmsCapableIsraeli, maskPhone, toE164Israeli } from '@/lib/auth/phone-otp'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { issueCheckoutPhoneOtp } from '@/server/checkout/verified-shipping'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Sends the checkout phone-verification code (F42, the verified-shipping
 * gate). Signed-in customers only: the code is bound to the account AND the
 * number, so it cannot be used to discover whether a number is registered,
 * and the sign-in endpoint next door is not reused because that one looks the
 * account up BY the phone, which is the opposite of what a checkout needs.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null
  const raw = typeof body?.phone === 'string' ? body.phone : ''
  const phone = isSmsCapableIsraeli(raw) ? toE164Israeli(raw) : null
  if (!phone) return NextResponse.json({ ok: false, error: 'invalid_phone' }, { status: 400 })

  const ip = await getClientIp()
  if (
    !(await checkRateLimit(`checkout-otp-send:${user.id}`, 5, 3600)) ||
    !(await checkRateLimit(`checkout-otp-send-ip:${ip}`, 20, 3600))
  ) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const result = await issueCheckoutPhoneOtp(
    createAdminClient(),
    { id: user.id, email: user.email ?? null },
    phone,
  )
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason === 'undeliverable' ? 'undeliverable' : 'internal' },
      { status: result.reason === 'undeliverable' ? 502 : 500 },
    )
  }
  return NextResponse.json({ ok: true, channel: result.channel, phone, masked: maskPhone(phone) })
}

export const POST = withRequestLog('/api/checkout/phone-otp/send', handlePOST)
