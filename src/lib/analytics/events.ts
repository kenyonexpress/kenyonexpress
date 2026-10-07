// Canonical taxonomy. The database registry (analytics_event_definitions) is the
// real source of truth and re-validates everything; this mirror exists so the
// client cannot even build an event the server would silently drop.
export const CLIENT_EVENT_NAMES = [
  'page_view',
  'view_product',
  'view_category',
  'add_to_cart',
  'remove_from_cart',
  'checkout_step',
  'web_vital',
  // In the DEPLOYED fn_ingest_analytics_events whitelist (read off production
  // 2026-09-07), so it belongs in the mirror even though this branch has no
  // emitter for it yet: a WhatsApp tap is an exit the funnel cannot see
  // otherwise, and the name must not be reinvented differently when the
  // button starts reporting.
  'whatsapp_click',
] as const

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number]

// Emitted server-side only, never accepted from a browser. begin_checkout
// comes from beginCheckout; the other three are the funnel's money moments:
// finalize, the voucher scan, and the admin refund.
// The DB whitelist in fn_ingest_analytics_events must carry the same names.
// 180 widened it and IS APPLIED: read off production 2026-09-09, the deployed
// function accepts all four, and a rolled-back probe took 1 of 1 for each.
// PostHog receives all four regardless -- the fan-out in track.ts needs no
// migration.
export const SERVER_EVENT_NAMES = [
  'begin_checkout',
  'purchase',
  'voucher_redeemed',
  'order_refunded',
] as const
export type ServerEventName = (typeof SERVER_EVENT_NAMES)[number]

export const CHECKOUT_STEPS = ['identity', 'address', 'payment_redirect'] as const
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

export const WEB_VITAL_METRICS = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP'] as const
export type WebVitalMetric = (typeof WEB_VITAL_METRICS)[number]

// Required props per client event, mirroring the registry seed in migrations
// 033 and 053. Keep in sync when adding an event.
export const REQUIRED_PROPS: Record<ClientEventName, readonly string[]> = {
  page_view: [],
  view_product: ['product_id'],
  view_category: ['category_id'],
  add_to_cart: ['product_id', 'quantity'],
  remove_from_cart: ['product_id'],
  checkout_step: ['step'],
  web_vital: ['metric', 'value'],
  // No required props: the float button has no product to name.
  whatsapp_click: [],
}

export const MAX_BATCH_SIZE = 20
export const PROPS_MAX_BYTES = 4096

/**
 * THE SCHEMAS ARE NOT HERE. `utmSchema`, `clientEventSchema` and
 * `ingestBatchSchema` live in `./events-schema`, which only the ingest route
 * and its tests import. This module is in the browser tracker's graph, and
 * until STEP 34 the `import { z } from 'zod'` at the top of it put 61.7 KB
 * raw / 14.5 KB gzipped of zod on every storefront first load for a `.max()`
 * the browser never calls (the server re-validates every batch). The types
 * below are written by hand and `events-schema.ts` proves, at compile time,
 * that they are exactly what the schemas infer.
 */
export type Utm = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

export type ClientEvent = {
  event_id: string
  event_name: ClientEventName
  occurred_at: string
  source: 'web' | 'pwa'
  source_app: 'shop'
  session_id: string
  path?: string
  referrer?: string
  utm?: Utm
  // Deliberately loose (jsonb on the other side) but never free-form: flat-ish,
  // size-capped by `PROPS_MAX_BYTES`, PII-free by convention.
  props: Record<string, unknown>
}

/**
 * Registry-equivalent check, run before the network call. The database repeats
 * it; doing it here keeps invalid events out of the batch instead of having the
 * whole payload half-dropped server-side with no feedback.
 */
export function hasRequiredProps(
  eventName: ClientEventName,
  props: Record<string, unknown>,
): boolean {
  return REQUIRED_PROPS[eventName].every((key) => key in props)
}
