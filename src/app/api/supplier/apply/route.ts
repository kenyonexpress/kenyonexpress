import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit } from '@/lib/rate-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
import { getClientIp } from '@/lib/utils/rate-limit'
import { submitSupplierLead } from '@/server/actions/supplier-lead'
import { NextResponse } from 'next/server'

/**
 * POST /api/supplier/apply
 * F64: Supplier application with rate limiting (2 per 24h per IP)
 */
async function handle(request: Request): Promise<Response> {
  const ip = await getClientIp()

  // F64: Rate limit 2 per 24h per IP
  const decision = await rateLimit('supplier-lead', ip)
  if (!decision.allowed) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מחר.' }, { status: 429 })
  }

  const formData = await request.formData()

  // F64: Turnstile verification
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return NextResponse.json(
      { error: 'אימות האבטחה נכשל. רעננו את הדף ונסו שוב.' },
      { status: 400 },
    )
  }

  // Delegate to server action
  const result = await submitSupplierLead({ ok: false }, formData)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result.redirectUrl) {
    return NextResponse.json({ redirectUrl: result.redirectUrl })
  }

  return NextResponse.json({ message: result.message })
}

export const POST = withRequestLog('/api/supplier/apply', handle)
