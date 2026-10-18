import 'server-only'

import type { PushContent } from '@/lib/push/templates'
import webpush from 'web-push'

/**
 * Browser push (rc5 F14), the third leg next to email and the app's Expo push.
 * Uses the subscriptions the browser registered in public.push_subscriptions.
 *
 * Inert without VAPID keys: production without NEXT_PUBLIC_VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY and VAPID_SUBJECT sends nothing and reports why, the way
 * email does without RESEND_API_KEY.
 */
export interface BrowserSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export type WebPushResult =
  | { ok: false; skipped: true; reason: string }
  | { ok: true; sent: number; deadEndpoints: string[]; failed: number }

let configured: boolean | null = null

function configure(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@kenyonexpress.co.il'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  } catch {
    configured = false
  }
  return configured
}

/** The notification the service worker shows; `tag` collapses a re-send. */
export function webPushPayload(content: PushContent, tag: string): string {
  const url = typeof content.data.url === 'string' ? content.data.url : '/'
  return JSON.stringify({ title: content.title, body: content.body, url, tag })
}

export async function sendWebPush(
  subscriptions: readonly BrowserSubscription[],
  content: PushContent,
  tag: string,
): Promise<WebPushResult> {
  if (subscriptions.length === 0)
    return { ok: false, skipped: true, reason: 'no browser subscription' }
  if (!configure()) return { ok: false, skipped: true, reason: 'VAPID keys not configured' }

  const payload = webPushPayload(content, tag)
  const deadEndpoints: string[] = []
  let sent = 0
  let failed = 0
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, timeout: 10_000 },
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 and 410: the browser dropped the subscription; delete ours.
        if (status === 404 || status === 410) deadEndpoints.push(s.endpoint)
        else failed += 1
      }
    }),
  )
  return { ok: true, sent, deadEndpoints, failed }
}
