import { wazeSearchLink } from '@/lib/waze'

/**
 * Where the business is, for the personal area's navigation links.
 *
 * No street address is invented: `NEXT_PUBLIC_BUSINESS_ADDRESS` carries it when
 * set, and until then both links search the display name, which both apps
 * resolve to the listing rather than to a guessed pin. (Waze's own `q=` search
 * is used for the same reason `waze.ts` documents.)
 */
const BUSINESS_QUERY = 'קניון EXPRESS'

export function businessQuery(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim()
  return configured && configured.length > 0 ? configured : BUSINESS_QUERY
}

export function businessWazeHref(env: NodeJS.ProcessEnv = process.env): string {
  return wazeSearchLink(businessQuery(env)) as string
}

export function businessGoogleMapsHref(env: NodeJS.ProcessEnv = process.env): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessQuery(env))}`
}
