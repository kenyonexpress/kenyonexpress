import { verifyQstashSignature } from '@/lib/search/qstash'

/**
 * QStash wake + retry for the notifications drain.
 *
 * Same SDK-free contract as search/qstash: publish wakes
 * /api/cron/notifications; non-2xx is retried by Upstash; exhausted deliveries
 * hit /api/cron/notifications-dlq. Outbox remains the source of truth.
 *
 * When QSTASH_TOKEN is unset (local/CI), callers degrade to inline drain or
 * rely on the Vercel/Supabase cron schedule.
 */

const QSTASH_URL = 'https://qstash.upstash.io'
export const NOTIFICATIONS_QSTASH_RETRIES = 5

export type WakeOutcome =
  | { transport: 'qstash'; messageId: string }
  | { transport: 'skipped'; reason: 'no_token' | 'no_app_url' }
  | { transport: 'error'; reason: string }

function appUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) return null
  return url.replace(/\/$/, '')
}

/** Fire-and-forget wake. Never throws into a money path. */
export async function wakeNotificationsDrain(dedupeKey?: string): Promise<WakeOutcome> {
  const token = process.env.QSTASH_TOKEN
  if (!token) return { transport: 'skipped', reason: 'no_token' }

  const base = appUrl()
  if (!base) return { transport: 'skipped', reason: 'no_app_url' }

  const target = `${base}/api/cron/notifications`
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': String(NOTIFICATIONS_QSTASH_RETRIES),
      'Upstash-Failure-Callback': `${base}/api/cron/notifications-dlq`,
    }
    if (dedupeKey) headers['Upstash-Deduplication-Id'] = `notif-wake:${dedupeKey}`

    const res = await fetch(`${QSTASH_URL}/v2/publish/${target}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ wake: true, dedupe_key: dedupeKey ?? null }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[notifications/qstash] publish failed ${res.status}: ${detail.slice(0, 200)}`)
      return { transport: 'error', reason: `http_${res.status}` }
    }
    const data = (await res.json()) as { messageId?: string }
    return { transport: 'qstash', messageId: data.messageId ?? 'unknown' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[notifications/qstash] publish error: ${reason}`)
    return { transport: 'error', reason }
  }
}

export { verifyQstashSignature }

/** True when the request is a verified QStash delivery (or Bearer CRON_SECRET). */
export function authorizeNotificationsRequest(
  authorization: string | null,
  upstashSignature: string | null,
  rawBody: string,
  requestUrl: string,
): boolean {
  const secret = process.env.CRON_SECRET
  if (secret && authorization === `Bearer ${secret}`) return true

  if (upstashSignature && process.env.QSTASH_CURRENT_SIGNING_KEY) {
    return verifyQstashSignature(upstashSignature, rawBody, requestUrl)
  }
  return false
}
