import { z } from 'zod'

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
] as const

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number]

// Emitted server-side only (from beginCheckout), never accepted from a browser.
export const SERVER_EVENT_NAMES = ['begin_checkout'] as const
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
}

export const MAX_BATCH_SIZE = 20
export const PROPS_MAX_BYTES = 4096

const utmSchema = z
  .object({
    utm_source: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
  })
  .strict()

export type Utm = z.infer<typeof utmSchema>

// props is deliberately loose (jsonb on the other side) but never free-form: it
// must be a flat-ish object, size-capped, and PII-free by convention. The 4KB
// cap here mirrors the ingest function so an oversized event is rejected before
// it costs a database round-trip.
const propsSchema = z
  .record(z.unknown())
  .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= PROPS_MAX_BYTES, {
    message: 'props exceeds 4KB',
  })

export const clientEventSchema = z.object({
  event_id: z.string().uuid(),
  event_name: z.enum(CLIENT_EVENT_NAMES),
  occurred_at: z.string().datetime({ offset: true }),
  source: z.enum(['web', 'pwa']).default('web'),
  source_app: z.literal('shop').default('shop'),
  session_id: z.string().min(1).max(64),
  path: z.string().max(300).optional(),
  referrer: z.string().max(600).optional(),
  utm: utmSchema.optional(),
  props: propsSchema.default({}),
})

export type ClientEvent = z.infer<typeof clientEventSchema>

export const ingestBatchSchema = z.object({
  events: z.array(clientEventSchema).min(1).max(MAX_BATCH_SIZE),
})

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
