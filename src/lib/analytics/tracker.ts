'use client'

import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  type Attribution,
  mergeAttribution,
  parseAttribution,
  readUtmFromQuery,
  serializeAttribution,
  utmForEvent,
} from '@/lib/analytics/attribution'
import { CONSENT_COOKIE, isBehavioralTrackingAllowed } from '@/lib/analytics/consent'
import {
  type ClientEvent,
  type ClientEventName,
  MAX_BATCH_SIZE,
  hasRequiredProps,
} from '@/lib/analytics/events'
import { decidedVariants, whenVariantsDecided } from '@/lib/analytics/feature-flags'
import { EventQueue, FLUSH_INTERVAL_MS, type SendResult } from '@/lib/analytics/queue'
import { type AnalyticsSession, touchSession } from '@/lib/analytics/session'
import { featureFlagProperties } from '@/lib/analytics/variant-cache'

export const INGEST_PATH = '/api/a'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

async function postBatch(events: ClientEvent[]): Promise<SendResult> {
  try {
    const response = await fetch(INGEST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
      credentials: 'same-origin',
    })
    // 4xx means the payload will never be accepted: dropping beats retrying.
    return response.ok || (response.status >= 400 && response.status < 500) ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

class Tracker {
  private queue = new EventQueue<ClientEvent>(postBatch, MAX_BATCH_SIZE)
  private timer: ReturnType<typeof setInterval> | null = null
  private listenersBound = false

  /**
   * Consent is re-read on every event: revoking must take effect immediately.
   * The browser's Do Not Track / GPC signal rides the same check and wins
   * over a granted cookie (lib/analytics/consent.ts).
   */
  private get allowed(): boolean {
    return isBehavioralTrackingAllowed(readCookie(CONSENT_COOKIE))
  }

  private session(): AnalyticsSession | null {
    try {
      return touchSession(window.localStorage)
    } catch {
      // Private mode / storage disabled. No stable session, no events.
      return null
    }
  }

  private attribution(): Attribution | null {
    return parseAttribution(readCookie(ATTRIBUTION_COOKIE))
  }

  /** Captures UTM from the current URL into the 30-day first-party cookie. */
  captureAttribution(search: string = location.search): void {
    if (!this.allowed) return
    const touch = readUtmFromQuery(search)
    if (!touch) return
    const merged = mergeAttribution(this.attribution(), touch, new Date())
    writeCookie(ATTRIBUTION_COOKIE, serializeAttribution(merged), ATTRIBUTION_MAX_AGE_SECONDS)
  }

  private bind(): void {
    if (this.listenersBound || typeof window === 'undefined') return
    this.listenersBound = true

    this.timer = setInterval(() => void this.queue.flush(), FLUSH_INTERVAL_MS)

    // pagehide, not unload: unload is unreliable and blocks bfcache.
    window.addEventListener('pagehide', () => this.flushSync())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushSync()
    })
  }

  /** Last-gasp send that survives the page going away. */
  private flushSync(): void {
    const events = this.queue.drain()
    if (events.length === 0) return
    const body = JSON.stringify({ events })
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(INGEST_PATH, new Blob([body], { type: 'application/json' }))
      return
    }
    void postBatch(events)
  }

  track(eventName: ClientEventName, props: Record<string, unknown> = {}): void {
    if (typeof window === 'undefined' || !this.allowed) return
    if (!hasRequiredProps(eventName, props)) return

    const session = this.session()
    if (!session) return

    this.bind()

    const event: ClientEvent = {
      event_id: crypto.randomUUID(),
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      source: 'web',
      source_app: 'shop',
      session_id: session.id,
      path: location.pathname.slice(0, 300),
      referrer: document.referrer ? document.referrer.slice(0, 600) : undefined,
      utm: utmForEvent(this.attribution()?.last),
      props,
    }

    // EXPERIMENT STAMPING. Every row carries `$feature/<flag>` for each flag
    // this browser is in (lib/analytics/variant-cache.ts), which is how the
    // admin experiments report joins an exposure to a variant and how
    // PostHog's own experiment analysis reads first-party-mirrored rows.
    // Stamped UNDER the caller's props: an emitter that names a property
    // itself (the landing page_view) wins.
    //
    // The first page of a consented session has no decision yet, and the
    // page_view and view_product of that page are exactly the exposure rows
    // the report counts. So when a decision is possible but pending, the
    // enqueue (not the timestamp) waits for it, at most ~2s. Once decided,
    // or when no decision can happen (no consent, no key), the event goes
    // out synchronously as before, so pagehide's drain still sees it.
    const wait = whenVariantsDecided()
    if (wait) {
      void wait.then(() => this.enqueue(this.stamped(event)))
      return
    }
    this.enqueue(this.stamped(event))
  }

  private stamped(event: ClientEvent): ClientEvent {
    const flags = featureFlagProperties(decidedVariants())
    return Object.keys(flags).length === 0
      ? event
      : { ...event, props: { ...flags, ...event.props } }
  }

  private enqueue(event: ClientEvent): void {
    if (this.queue.push(event)) void this.queue.flush()
  }

  /** Whether this session was drawn for Web Vitals sampling. */
  shouldSampleWebVitals(): boolean {
    if (typeof window === 'undefined' || !this.allowed) return false
    return this.session()?.sampleWebVitals ?? false
  }

  flush(): void {
    void this.queue.flush()
  }
}

let instance: Tracker | null = null

export function getTracker(): Tracker {
  if (!instance) instance = new Tracker()
  return instance
}

/** Fire-and-forget event emission. Never throws, never blocks a UI path. */
export function track(eventName: ClientEventName, props: Record<string, unknown> = {}): void {
  try {
    getTracker().track(eventName, props)
  } catch {
    // Analytics must never break the page.
  }
}
