import { drainNotificationOutbox } from '@/lib/notifications/drain'
import { authorizeNotificationsRequest } from '@/lib/notifications/qstash'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Drains `notification_outbox` through Resend.
 *
 * Auth:
 * - Vercel Cron / Edge wake: Authorization: Bearer CRON_SECRET
 * - QStash delivery: Upstash-Signature (HMAC) verified against signing keys
 *
 * GET stays for Vercel Cron. POST is the QStash publish target.
 */

async function handle(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text().catch(() => '')
  const authorized = authorizeNotificationsRequest(
    request.headers.get('authorization'),
    request.headers.get('upstash-signature'),
    rawBody,
    request.url,
  )
  if (!authorized) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  try {
    const result = await drainNotificationOutbox(createAdminClient(), siteUrl)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('notification drain failed:', message)
    // 5xx so QStash retries; outbox idempotency + Resend Idempotency-Key prevent dupes.
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request)
}
