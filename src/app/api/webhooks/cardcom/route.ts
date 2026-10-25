/**
 * Cardcom webhook route alias.
 *
 * The canonical implementation is at /api/payments/cardcom/webhook, which is
 * wired as the IndicatorUrl when creating Low Profile pages. This alias exists
 * for URL convention consistency (/api/webhooks/*) and to support tooling or
 * documentation that expects webhooks under a common prefix.
 *
 * All webhook logic, authentication, deduplication, and order finalization
 * happens in the canonical route. This file is a transparent reexport.
 *
 * Route segment config is omitted here because it's not compatible with
 * nextConfig.cacheComponents. The canonical route defines runtime='edge',
 * dynamic='force-dynamic', and maxDuration=60.
 */
export { POST } from '@/app/api/payments/cardcom/webhook/route'
