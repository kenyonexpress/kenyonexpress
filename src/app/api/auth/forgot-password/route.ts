import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit } from '@/lib/rate-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
import { getClientIp } from '@/lib/utils/rate-limit'
import { sendPasswordReset } from '@/server/actions/auth'
import { NextResponse } from 'next/server'

/**
 * POST /api/auth/forgot-password
 * F64: Password reset with rate limiting (3 per hour per IP + per email)
 */
async function handle(request: Request): Promise<Response> {
  const ip = await getClientIp()

  // F64: Rate limit 3 per hour per IP
  const ipDecision = await rateLimit('reset', ip)
  if (!ipDecision.allowed) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' }, { status: 429 })
  }

  const formData = await request.formData()
  const email = formData.get('email')?.toString() || ''

  // F64: Rate limit 3 per hour per email
  if (email) {
    const emailDecision = await rateLimit('reset-address', email.toLowerCase())
    if (!emailDecision.allowed) {
      // Return same neutral message per passwordResetResult
      return NextResponse.json({
        message: 'אם כתובת האימייל רשומה במערכת, שלחנו אליה הוראות לאיפוס הסיסמה',
      })
    }
  }

  // C15: 10/min per IP burst ceiling across auth routes
  const burst = await rateLimit('auth-burst', ip)
  if (!burst.allowed) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  // F64: Turnstile verification
  if (!(await verifyTurnstile(formData.get(TURNSTILE_FIELD), ip))) {
    return NextResponse.json({ error: 'אימות האנושיות נכשל. נסו שוב.' }, { status: 400 })
  }

  // Delegate to server action
  const result = await sendPasswordReset(null, formData)

  if (result && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result && 'success' in result) {
    return NextResponse.json({ success: result.success })
  }

  return NextResponse.json({
    message: 'אם כתובת האימייל רשומה במערכת, שלחנו אליה הוראות לאיפוס הסיסמה',
  })
}

export const POST = withRequestLog('/api/auth/forgot-password', handle)
