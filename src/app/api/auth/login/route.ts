import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit } from '@/lib/rate-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
import { getClientIp } from '@/lib/utils/rate-limit'
import { signInWithEmail } from '@/server/actions/auth'
import { NextResponse } from 'next/server'

/**
 * POST /api/auth/login
 * F64: Email/password login with rate limiting (5 per 15min per IP)
 */
async function handle(request: Request): Promise<Response> {
  const ip = await getClientIp()

  // F64: Rate limit 5 per 15min per IP
  const decision = await rateLimit('login', ip)
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד 15 דקות' },
      { status: 429 },
    )
  }

  // C15: 10/min per IP burst ceiling across auth routes
  const burst = await rateLimit('auth-burst', ip)
  if (!burst.allowed) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  const formData = await request.formData()

  // F64: Turnstile verification
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return NextResponse.json({ error: 'אימות האנושיות נכשל. נסו שוב.' }, { status: 400 })
  }

  // Delegate to server action
  const result = await signInWithEmail(null, formData)

  if (result && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result && 'success' in result) {
    return NextResponse.json({ success: result.success })
  }

  return NextResponse.json({ success: true })
}

export const POST = withRequestLog('/api/auth/login', handle)
