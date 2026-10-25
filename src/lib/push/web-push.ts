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

async function sendWebPushToBrowsers(
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

/** What a push service's answer means for the subscription that produced it. */
export type WebPushOutcome =
  /** Accepted for delivery. */
  | { kind: 'sent' }
  /**
   * The subscription is dead and the endpoint will never work again. 404 is
   * "no such subscription", 410 is "it was unsubscribed". Both are final: the
   * row must go, or every future run pays a network round trip to be told the
   * same thing.
   */
  | { kind: 'gone'; status: number }
  /** The push service is unhappy for a reason that may pass. Try again later. */
  | { kind: 'retry'; status: number | null; reason: string }
  /**
   * We sent something the service refuses, and sending it again will be
   * refused again: a payload over the 4096-byte ceiling, a malformed VAPID
   * JWT, a key that does not match the subscription. Retrying is a loop.
   */
  | { kind: 'rejected'; status: number; reason: string }

/**
 * The push service's own ceiling, from RFC 8291. It applies to the ENCRYPTED
 * body, which is larger than the plaintext by the AES-GCM tag and the record
 * header, so a plaintext close to the limit is over it.
 */
export const PUSH_PAYLOAD_LIMIT_BYTES = 4096

/**
 * Deliberately well under the limit. The encryption overhead is a fixed 103
 * bytes plus padding, and a body that squeaks under 4096 in a test squeaks over
 * it the first time a supplier has a long name.
 */
export const PUSH_PLAINTEXT_BUDGET_BYTES = 3000

/**
 * The JSON the service worker's `push` handler parses.
 *
 * It is written against `public/sw.js` and not against a spec: that handler
 * drops any payload without a string `title`, and confines `url` to a
 * same-origin path. Sending a shape it rejects is a delivered push that shows
 * nothing, which costs the permission and gives nothing back.
 */
export function toPushPayload(content: PushContent): {
  title: string
  body: string
  url: string
  tag?: string
} {
  const url = content.data.url
  const tag = content.data.tag

  return {
    title: content.title,
    body: content.body,
    // The worker falls back to '/' for anything that is not a same-origin
    // path, so sending an absolute URL is not dangerous - it is just a click
    // that lands on the home page instead of the order. Normalised here so the
    // intent is visible at the sending end too.
    url: typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/',
    ...(typeof tag === 'string' && tag !== '' ? { tag } : {}),
  }
}

/**
 * Serialises and refuses anything the push service would refuse.
 *
 * Returning null rather than truncating: a notification cut mid-sentence on a
 * lock screen is worse than one that did not arrive, because the customer
 * cannot tell it was cut. The caller settles the row as rejected and logs the
 * kind, which is how a template that grew too long becomes visible.
 */
export function encodePushPayload(content: PushContent): string | null {
  const json = JSON.stringify(toPushPayload(content))
  return Buffer.byteLength(json, 'utf8') > PUSH_PLAINTEXT_BUDGET_BYTES ? null : json
}

/**
 * A push service's HTTP status, turned into what to do about it.
 *
 * The two that matter are 404/410, which mean delete, and 429, which means the
 * service is throttling us and a retry is correct. Everything in the 4xx range
 * that is neither is our fault and will not improve; everything 5xx is theirs
 * and might.
 */
export function classifyWebPushStatus(status: number, reason = ''): WebPushOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent' }
  if (status === 404 || status === 410) return { kind: 'gone', status }
  // Retry-After is honoured by the caller's own backoff rather than read here;
  // what matters at this layer is that 429 is not a permanent rejection.
  if (status === 429) return { kind: 'retry', status, reason: reason || 'rate limited' }
  if (status >= 500) return { kind: 'retry', status, reason: reason || `push service ${status}` }
  return { kind: 'rejected', status, reason: reason || `push service ${status}` }
}

export interface WebPushTarget {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidConfig {
  subject: string
  publicKey: string
  privateKey: string
}

/**
 * The VAPID identity, or null when it is not configured.
 *
 * `subject` must be a mailto: or https: URL and is what a push service contacts
 * if this sender misbehaves. It defaults to the site rather than being
 * required, because an absent subject is the one VAPID field whose omission
 * fails at send time with a message nobody reads.
 */
export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null

  return {
    subject: env.VAPID_SUBJECT || 'https://kenyonexpress.co.il',
    publicKey,
    privateKey,
  }
}

/**
 * Sends one notification to one browser.
 *
 * `web-push` is imported dynamically so the module - which pulls in node crypto
 * and https - is never part of a bundle that does not send. Nothing on the
 * client imports this file, and the dynamic import keeps that true even if
 * something later does by mistake.
 */
async function sendWebPushToTarget(
  target: WebPushTarget,
  content: PushContent,
  vapid: VapidConfig,
): Promise<WebPushOutcome> {
  const payload = encodePushPayload(content)
  if (payload === null) {
    return {
      kind: 'rejected',
      status: 413,
      reason: `payload over ${PUSH_PLAINTEXT_BUDGET_BYTES} bytes`,
    }
  }

  const client = webpush

  try {
    const result = await client.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      payload,
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        // The push service holds an undelivered message for this long before
        // dropping it. Four hours: long enough for a phone that is asleep,
        // short enough that "your coupon expires tomorrow" cannot arrive the
        // day after it expired.
        TTL: 4 * 60 * 60,
      },
    )
    return classifyWebPushStatus(result.statusCode ?? 201)
  } catch (error) {
    // WebPushError carries the status; anything else is a transport failure,
    // which is exactly the case a retry exists for.
    const status = (error as { statusCode?: number }).statusCode
    const reason = error instanceof Error ? error.message : 'send failed'
    if (typeof status === 'number') return classifyWebPushStatus(status, reason)
    return { kind: 'retry', status: null, reason }
  }
}

/**
 * Two callers, two shapes. `sendWebPush(subscriptions, content, tag)` is the
 * batch form (coupon reminders, the verification endpoint) and reports an
 * aggregate; `sendWebPush(target, content, vapid)` is the single-browser form
 * the outbox leg uses and reports what to do with that one subscription.
 */
export function sendWebPush(
  subscriptions: readonly BrowserSubscription[],
  content: PushContent,
  tag: string,
): Promise<WebPushResult>
export function sendWebPush(
  target: WebPushTarget,
  content: PushContent,
  vapid: VapidConfig,
): Promise<WebPushOutcome>
export function sendWebPush(
  targetOrSubscriptions: readonly BrowserSubscription[] | WebPushTarget,
  content: PushContent,
  tagOrVapid: string | VapidConfig,
): Promise<WebPushResult | WebPushOutcome> {
  if (Array.isArray(targetOrSubscriptions) || typeof tagOrVapid === 'string') {
    return sendWebPushToBrowsers(
      targetOrSubscriptions as readonly BrowserSubscription[],
      content,
      tagOrVapid as string,
    )
  }
  return sendWebPushToTarget(targetOrSubscriptions as WebPushTarget, content, tagOrVapid)
}
