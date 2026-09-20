/**
 * POST /api/account/delete
 *
 * Initiates a data deletion request with a 30-day grace period.
 * GDPR article 17 and Israeli Privacy Protection Law section 11.
 */

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const DeleteRequestSchema = z.object({
  reason: z.string().max(500).optional(),
})

async function handlePOST(req: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_signed_in' }, { status: 401 })
  }

  // Rate limit per user (max 1 deletion request per day per user)
  const decision = await rateLimit('account-delete', user.id)
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  // Parse request body
  let reason: string | undefined
  try {
    const body = await req.json()
    const parsed = DeleteRequestSchema.parse(body)
    reason = parsed.reason
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
  const userAgent = req.headers.get('user-agent')

  try {
    // Create pending deletion request
    const gracePeriodDays = 30
    const scheduledDeleteAt = new Date()
    scheduledDeleteAt.setDate(scheduledDeleteAt.getDate() + gracePeriodDays)

    const { data: deletion, error: insertError } = await supabase
      .from('pending_deletions')
      .insert({
        user_id: user.id,
        status: 'requested',
        reason: reason || null,
        requested_by_ip: ipAddress,
        requested_by_user_agent: userAgent,
        scheduled_delete_at: scheduledDeleteAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      log.error('account_delete.insert_failed', { reason: insertError.message })
      return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 })
    }

    if (!deletion) {
      return NextResponse.json({ ok: false, error: 'database_error' }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        deletion_id: deletion.id,
        status: deletion.status,
        grace_period_expires_at: scheduledDeleteAt.toISOString(),
        message:
          'Your account deletion has been requested. You have 30 days to confirm or cancel this request.',
      },
      { status: 201 },
    )
  } catch (error) {
    log.error('account_delete.failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/account/delete', handlePOST)
