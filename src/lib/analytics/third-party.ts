/**
 * Whether GA4 and the Meta Pixel may run, and what "may" means here.
 *
 * NOTHING IS LOADED BEFORE CONSENT. Not the script tag, not a stub, not a
 * consent-mode-denied bootstrap. That is STRICTER than Google's own recommended
 * pattern, which is to load `gtag.js` immediately with every consent type set
 * to `denied` and rely on the SDK to suppress collection.
 *
 * The deviation is deliberate. Google's pattern still fetches a third-party
 * script, which reveals the visitor's IP and User-Agent to Google before the
 * visitor has agreed to anything, and it still writes Google's own cookieless
 * ping. Under Israeli privacy law and the GDPR reading most Israeli sites are
 * built to, that transfer is itself the thing consent is for. It also makes the
 * requirement testable: "no third-party request before consent" is checkable in
 * a network log, while "the SDK promised not to collect" is not.
 *
 * The cost is measurable and accepted: consent-mode modelling and the "pre-
 * consent" conversion recovery Google offers are unavailable, so post-consent
 * numbers are the only numbers.
 *
 * BOTH IDs ARE PUBLIC. A GA4 measurement id and a Meta pixel id are visible in
 * any page that loads them; they are `NEXT_PUBLIC_*` because they have to reach
 * the browser, not because anybody was careless. The secrets that do exist -
 * the Measurement Protocol api_secret and the Conversions API token - are
 * server-only and live in `server-events.ts`.
 */

export interface ThirdPartyAnalyticsConfig {
  ga4MeasurementId: string | null
  metaPixelId: string | null
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function readThirdPartyConfig(
  env: Record<string, string | undefined> = process.env,
): ThirdPartyAnalyticsConfig {
  return {
    ga4MeasurementId: clean(env.NEXT_PUBLIC_GA4_MEASUREMENT_ID),
    metaPixelId: clean(env.NEXT_PUBLIC_META_PIXEL_ID),
  }
}

/** Nothing configured means nothing to load, whatever the visitor consented to. */
export function hasAnyThirdParty(config: ThirdPartyAnalyticsConfig): boolean {
  return config.ga4MeasurementId !== null || config.metaPixelId !== null
}

/**
 * A GA4 measurement id looks like `G-XXXXXXXXXX`. Checked because the value
 * that gets pasted into this variable by mistake is a Google Ads id (`AW-`) or
 * a Tag Manager container (`GTM-`), and both load, both report nothing, and
 * neither errors.
 */
export function isGa4MeasurementId(value: string | null): boolean {
  return value !== null && /^G-[A-Z0-9]{6,}$/i.test(value)
}

/** A Meta pixel id is a numeric string, 12-20 digits in practice. */
export function isMetaPixelId(value: string | null): boolean {
  return value !== null && /^\d{8,20}$/.test(value)
}

/** The config with anything malformed dropped, so a typo disables rather than misreports. */
export function validatedConfig(config: ThirdPartyAnalyticsConfig): ThirdPartyAnalyticsConfig {
  return {
    ga4MeasurementId: isGa4MeasurementId(config.ga4MeasurementId) ? config.ga4MeasurementId : null,
    metaPixelId: isMetaPixelId(config.metaPixelId) ? config.metaPixelId : null,
  }
}
