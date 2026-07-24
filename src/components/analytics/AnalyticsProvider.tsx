'use client'

import { WEB_VITAL_METRICS, type WebVitalMetric } from '@/lib/analytics/events'
import { getTracker, track } from '@/lib/analytics/tracker'
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
 * Mounts the analytics SDK: UTM capture, a page_view per navigation, and
 * sampled Web Vitals. Every call is a no-op without consent, so this can sit in
 * the root layout unconditionally.
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
