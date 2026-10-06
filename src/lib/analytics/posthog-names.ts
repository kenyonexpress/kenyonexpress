/**
 * The names PostHog receives, in one place.
 *
 * Three pipelines share the event emitters in this codebase and two of them
 * have names that are not ours to choose: GA4 insists on `view_item`, and the
 * first-party `fn_ingest_analytics_events` whitelist is deployed with
 * `voucher_redeemed` and cannot be renamed without a migration. PostHog has no
 * such constraint, and its funnel is read by a person who was told the funnel
 * is `view_product -> add_to_cart -> begin_checkout -> purchase` with
 * `gift_sent` and `coupon_redeemed` beside it. Before this table the first step
 * arrived as `view_item` and the redemption as `voucher_redeemed`: two of six
 * names different from the ones in the brief, and a funnel built on the brief
 * reported zero views and zero redemptions while both were being sent.
 *
 * Anything not in the table passes through unchanged. Both fan-outs
 * (`lib/analytics/commerce-client.ts` in the browser and
 * `server/analytics/track.ts` on the server) go through `postHogEventName`,
 * so a rename is one edit and the two halves of the funnel cannot disagree.
 */
const POSTHOG_EVENT_NAMES: Readonly<Record<string, string>> = {
  view_item: 'view_product',
  voucher_redeemed: 'coupon_redeemed',
}

/**
 * Emitted on the server when a gift leaves the buyer: the purchase-time gift
 * mail from `finalizeOrder` and the later transfer from the account page. It is
 * PostHog-only on purpose. Adding it to `SERVER_EVENT_NAMES` would route it
 * through `fn_ingest_analytics_events`, whose deployed whitelist does not carry
 * it and would discard it with HTTP 200 and an `analytics.event_rejected` error
 * line per gift. The first-party record of a gift is the audit row
 * `recordGiftAudit` writes, which already exists.
 */
export const POSTHOG_GIFT_SENT = 'gift_sent'

/** The event PostHog uses to merge an anonymous id into a known person. */
export const POSTHOG_IDENTIFY = '$identify'

/** The six names the PostHog funnel is built on. Asserted by test, not by hope. */
export const POSTHOG_FUNNEL_EVENTS = [
  'view_product',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'gift_sent',
  'coupon_redeemed',
] as const

export function postHogEventName(name: string): string {
  return POSTHOG_EVENT_NAMES[name] ?? name
}
