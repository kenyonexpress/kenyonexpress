import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit } from '@/lib/rate-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
import { getClientIp } from '@/lib/utils/rate-limit'
import { submitContactForm } from '@/server/actions/contact'
import { NextResponse } from 'next/server'

/**
 * POST /api/contact
 * F64: Contact form with rate limiting (5 per hour per IP)
 */
async function handle(request: Request): Promise<Response> {
  const ip = await getClientIp()

  // F64: Rate limit 5 per hour per IP
  const decision = await rateLimit('contact', ip)
  if (!decision.allowed) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  const formData = await request.formData()

  // F64: Turnstile verification
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return NextResponse.json({ error: 'אימות האנושיות נכשל. נסו שוב.' }, { status: 400 })
  }

  // Delegate to server action
  const result = await submitContactForm({ ok: false }, formData)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ message: result.message })
}

export const POST = withRequestLog('/api/contact', handle)
