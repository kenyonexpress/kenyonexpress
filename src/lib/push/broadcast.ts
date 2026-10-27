import 'server-only'

import { type BrowserSubscription, sendWebPush } from '@/lib/push/web-push'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin broadcast (rc5 F14): one message to every stored browser
 * subscription. Reads in pages so a large audience never loads at once, and
 * deletes the endpoints the push service reports as gone (404/410).
 */
const PAGE = 500

export type BroadcastOutcome =
  | { ok: false; reason: string }
  | { ok: true; sent: number; failed: number; removed: number }

export async function broadcastWebPush(input: {
  title: string
  body: string
  url: string
  tag: string
}): Promise<BroadcastOutcome> {
  const db = createAdminClient()
  let sent = 0
  let failed = 0
  let removed = 0
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { ok: false, reason: error.message }
    const rows = (data ?? []) as BrowserSubscription[]
    if (rows.length === 0) break
    const result = await sendWebPush(
      rows,
      { title: input.title, body: input.body, data: { url: input.url } },
      input.tag,
    )
    if (!result.ok) return { ok: false, reason: result.reason }
    sent += result.sent
    failed += result.failed
    if (result.deadEndpoints.length > 0) {
      await db.from('push_subscriptions').delete().in('endpoint', result.deadEndpoints)
      removed += result.deadEndpoints.length
    }
    if (rows.length < PAGE) break
    // Deleted rows shift later pages up; step back by what was removed.
    from -= result.deadEndpoints.length
  }
  return { ok: true, sent, failed, removed }
}
