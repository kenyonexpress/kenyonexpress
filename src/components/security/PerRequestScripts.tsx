import ThirdPartyTags from '@/components/analytics/ThirdPartyTags'
import { readThirdPartyConfig, validatedConfig } from '@/lib/analytics/third-party'
import { NONCE_HEADER } from '@/lib/security/frame-policy'
import { headers } from 'next/headers'

/**
 * The one component in the root layout that reads the request, and it does
 * two jobs that are really one.
 *
 * THE NONCE. `src/proxy.ts` mints a Content-Security-Policy nonce per request
 * and exposes it as `x-nonce`. Next stamps it on every script it writes
 * itself; the vendor bootstraps in `ThirdPartyTags` (GA4's init, the Pixel's
 * loader) are inline scripts next/script writes on OUR behalf, and they need
 * the nonce passed in. Reading a header is runtime data, which under
 * cacheComponents may only happen inside a Suspense boundary; the layout
 * provides one, with a null fallback, because this renders nothing itself.
 *
 * THE RESUME. That same read is what keeps every page on the resume path. A
 * page whose tree reads nothing at request time is prerendered WHOLE, flight
 * data included, as inline scripts with no nonce in them, and under the nonce
 * policy none of those scripts run: the page paints and never hydrates.
 * Measured 2026-10-07 before this component existed: 73 of 228 built shells
 * were whole, /cart, /about, /faq and the legal pages among them. With a
 * request read in the root layout, no page is, and the flight data of every
 * page is written at request time with the nonce on it. The cost is a resume
 * render on pages that used to be served as one cached file; the static shell
 * still streams first. `scripts/security/csp-shell-gate.mjs` fails the build
 * if a whole shell comes back, so removing this is a red build, not a dead
 * page in production.
 */
export default async function PerRequestScripts() {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined
  return <ThirdPartyTags config={validatedConfig(readThirdPartyConfig())} nonce={nonce} />
}
