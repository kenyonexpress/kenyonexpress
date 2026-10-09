'use client'

import { trackingAllowed } from '@/lib/analytics/commerce-client'
import { WEB_VITAL_METRICS, type WebVitalMetric } from '@/lib/analytics/events'
import { getTracker, track } from '@/lib/analytics/tracker'
import { isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'
import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from '@/lib/referrals/code'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { useEffect } from 'react'

// Route templates we care about, longest first so /product/[slug] wins over /.
// Reporting the raw path would make the Web Vitals rollup unusable: every
// product slug would be its own row.
const ROUTE_TEMPLATES: Array<[RegExp, string]> = [
  [/^\/product\/[^/]+$/, '/product/[slug]'],
  [/^\/category\/[^/]+$/, '/category/[slug]'],
  [/^\/checkout\/[^/]+$/, '/checkout/[step]'],
  [/^\/account\/[^/]+$/, '/account/[section]'],
]

export function routeTemplate(pathname: string): string {
  for (const [pattern, template] of ROUTE_TEMPLATES) {
    if (pattern.test(pathname)) return template
  }
  return pathname
}

function isWebVitalMetric(name: string): name is WebVitalMetric {
  return (WEB_VITAL_METRICS as readonly string[]).includes(name)
}

/**
 * One PostHog event per referral landing, not one per render or navigation.
 *
 * The middleware writes the `?ref=` code into an httpOnly cookie and does NOT
 * redirect, so the parameter is still in the address bar when this mounts --
 * which is the only browser-visible trace of the click, since the cookie is
 * deliberately unreadable here. sessionStorage keys the dedupe: back/forward
 * to the landing URL within one tab is still one click, a genuinely new visit
 * (new tab, next day) is a new one.
 *
 * Consent-gated like every other client-side PostHog call. A first-time
 * visitor who has not answered the banner yet is lost to THIS event, and that
 * is the codebase-wide rule, not a gap: the referral PROGRAM does not care,
 * because attribution rides the first-party cookie and is claimed at signup
 * regardless. This event only measures how warm shared links are.
 */
function reportReferralLanding(search: string): void {
  const code = normalizeReferralCode(new URLSearchParams(search).get(REFERRAL_QUERY_PARAM))
  if (!code) return
  if (!isPostHogEnabled() || !trackingAllowed()) return
  try {
    const key = `ke_ph_ref_clicked:${code}`
    if (window.sessionStorage.getItem(key)) return
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Storage blocked: fire anyway, over-counting one tab beats losing all of
    // them.
  }
  trackEvent('referral_link_clicked', { code })
}

/**
 * Mounts the analytics SDK: UTM capture, a page_view per navigation, and
 * sampled Web Vitals. Every call is a no-op without consent, so this can sit in
 * the root layout unconditionally.
 *
 * PostHog rides along on the same navigation signal: `$pageview` (the name its
 * web analytics and funnels are built on) goes out beside the first-party
 * `page_view`, behind the same consent cookie, carrying the route template so
 * PostHog groups the way the first-party rollup does.
 */
export default function AnalyticsProvider() {
  const pathname = usePathname()

  useEffect(() => {
    const tracker = getTracker()
    // Attribution first: a page_view should already carry the campaign that
    // brought the visitor to this very page.
    tracker.captureAttribution(window.location.search)
    // route alongside the envelope's raw path: the template is what groups
    // usefully in reports, the path is what you need to debug one visit.
    track('page_view', { route: routeTemplate(pathname) })

    if (isPostHogEnabled() && trackingAllowed()) {
      trackEvent('$pageview', {
        $current_url: window.location.href,
        route: routeTemplate(pathname),
      })
    }

    reportReferralLanding(window.location.search)
  }, [pathname])

  useReportWebVitals((metric) => {
    if (!isWebVitalMetric(metric.name)) return
    if (!getTracker().shouldSampleWebVitals()) return

    track('web_vital', {
      metric: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      route: routeTemplate(window.location.pathname),
    })
  })

  return null
}
