import { type Touch, UTM_KEYS, type UtmKey } from '@/lib/analytics/attribution'

/**
 * UTM capture that survives the visitor NOT consenting yet.
 *
 * The attribution cookie (`ke_attr`) is written by the tracker only after
 * the banner's analytics category is granted. A paid click that lands on
 * `/lp/<slug>` and moves to a product page before the visitor answers the
 * banner has lost its `utm_*` by then: the query string does not follow a
 * `<Link>`. So the landing page stamps the campaign onto its OWN links.
 * When the visitor consents on the product page, the tracker's
 * `captureAttribution` reads the parameters off THAT URL, and the purchase
 * row three pages later still says which campaign paid for it.
 *
 * INCOMING WINS. A visitor who arrived with `utm_source=facebook` keeps it;
 * the page only fills what the click did not carry: source `landing`,
 * medium `lp`, the page's campaign (or its slug), and the rendered variant
 * as `utm_content`, which is what tells a UTM report apart from the
 * experiment report when the two disagree.
 *
 * INTERNAL LINKS ONLY, and only ones that do not already carry a key. The
 * schema refuses external hrefs anyway; this is the second layer.
 */

export const LANDING_UTM_SOURCE = 'landing'
export const LANDING_UTM_MEDIUM = 'lp'

export type CampaignParams = Partial<Record<UtmKey, string>>

export function landingCampaignParams(
  page: { slug: string; campaign: string | null },
  variant: string,
  incoming: Touch | null | undefined,
): CampaignParams {
  const params: CampaignParams = {
    utm_source: LANDING_UTM_SOURCE,
    utm_medium: LANDING_UTM_MEDIUM,
    utm_campaign: page.campaign ?? page.slug,
    utm_content: variant,
  }
  if (incoming) {
    for (const key of UTM_KEYS) {
      const value = incoming[key]
      if (value) params[key] = value
    }
  }
  return params
}

/**
 * `href` with the campaign parameters appended. Keeps the existing query and
 * fragment, never overwrites a key the href already has, and returns an
 * external or malformed href untouched.
 */
export function withCampaignParams(href: string, params: CampaignParams): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const hashAt = href.indexOf('#')
  const hash = hashAt >= 0 ? href.slice(hashAt) : ''
  const withoutHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const queryAt = withoutHash.indexOf('?')
  const path = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash
  const search = new URLSearchParams(queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '')

  let changed = false
  for (const key of UTM_KEYS) {
    const value = params[key]
    if (!value || search.has(key)) continue
    search.set(key, value)
    changed = true
  }
  if (!changed) return href
  return `${path}?${search.toString()}${hash}`
}
