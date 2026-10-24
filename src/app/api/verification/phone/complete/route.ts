/**
 * API Route: Mark phone verification milestone as complete
 * C65: Called after successful WhatsApp OTP verification
 */

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { markMilestoneVerified } from '@/server/verification/user-milestones'
import { type NextRequest, NextResponse } from 'next/server'

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    if (!(await checkRateLimit(`phone-verify-complete:${user.id}`, 20, 3600))) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429, headers: { 'retry-after': '3600' } },
      )
    }

    // Parse request body for optional metadata
    const body = (await request.json().catch(() => ({}))) as {
      phone?: string
      method?: string
    }

    // Mark milestone as verified
    const result = await markMilestoneVerified(user.id, 'phone_verification_after_5_orders', {
      phone: body.phone || 'unknown',
      method: body.method || 'whatsapp_otp',
      verified_via: 'api',
      verified_at_timestamp: Date.now(),
    })

    if (!result.success) {
      // If milestone_not_found, it's ok (user didn't need to verify)
      if (result.error === 'milestone_not_found') {
        return NextResponse.json({
          ok: true,
          message: 'no_milestone_needed',
        })
      }

      log.error('verification.phone.complete_failed', {
        userId: user.id,
        error: result.error,
      })

      return NextResponse.json(
        { ok: false, error: result.error || 'verification_failed' },
        { status: 500 },
      )
    }

    log.info('verification.phone.completed', {
      userId: user.id,
      phone: body.phone,
    })

    return NextResponse.json({ ok: true, message: 'phone_verified' })
  } catch (error) {
    log.error('verification.phone.complete_exception', { error })
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/verification/phone/complete', handlePOST)
