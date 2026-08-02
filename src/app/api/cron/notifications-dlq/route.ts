import { authorizeNotificationsRequest } from '@/lib/notifications/qstash'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * QStash failure callback for the notifications drain.
 *
 * When Upstash exhausts retries against /api/cron/notifications, it POSTs here.
 * The outbox row is usually already `dead` from the worker's attempt counter;
 * this route records the DLQ event and optionally pings Ntfy for ops.
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  let parsed: { dedupe_key?: string; outbox_id?: string; status?: number } = {}
  try {
    parsed = JSON.parse(rawBody || '{}') as typeof parsed
  } catch {
    parsed = {}
  }

  console.error('[notifications-dlq] QStash exhausted retries', {
    dedupe_key: parsed.dedupe_key ?? null,
    outbox_id: parsed.outbox_id ?? null,
    status: parsed.status ?? null,
  })

  // Best-effort: park any still-pending rows that match the wake dedupe.
  if (parsed.dedupe_key) {
    const admin = createAdminClient()
    await admin
      .from('notification_outbox')
      .update({
        status: 'dead',
        last_error: 'qstash_dlq: retries exhausted',
      })
      .eq('dedupe_key', parsed.dedupe_key)
      .eq('status', 'pending')
  }

  const topic = process.env.NTFY_TOPIC
  const base = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
  if (topic) {
    await fetch(`${base.replace(/\/$/, '')}/${topic}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: `KenyonExpress notifications DLQ: ${parsed.dedupe_key ?? 'wake'}`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
