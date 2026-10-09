/**
 * @vitest-environment jsdom
 */
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two PostHog events AnalyticsProvider itself emits: the `$pageview` that
 * every funnel starts from, and `referral_link_clicked` on a `?ref=` landing.
 *
 * Both must be consent-gated (PostHog has no self-gating SDK global; see
 * commerce-client.ts for the full argument), and the referral event must fire
 * once per tab per code, not once per render -- React 18 strict-mode double
 * effects and back/forward navigation both hit the same landing URL again.
 */

const trackEvent = vi.hoisted(() => vi.fn())
const isPostHogEnabled = vi.hoisted(() => vi.fn(() => true))
const track = vi.hoisted(() => vi.fn())
const captureAttribution = vi.hoisted(() => vi.fn())
const pathname = vi.hoisted(() => ({ value: '/' }))

vi.mock('@/lib/observability/posthog', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  isPostHogEnabled: () => isPostHogEnabled(),
}))

vi.mock('@/lib/analytics/tracker', () => ({
  track: (...args: unknown[]) => track(...args),
  getTracker: () => ({
    captureAttribution: (...args: unknown[]) => captureAttribution(...args),
    shouldSampleWebVitals: () => false,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}))

vi.mock('next/web-vitals', () => ({
  useReportWebVitals: () => {},
}))

import AnalyticsProvider from './AnalyticsProvider'

function grantConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`granted.${CONSENT_WORDING_VERSION}`)}`
}

function denyConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`denied.${CONSENT_WORDING_VERSION}`)}`
}

function clearConsent(): void {
  document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function visit(url: string, route = '/'): void {
  window.history.replaceState(null, '', url)
  pathname.value = route
}

beforeEach(() => {
  trackEvent.mockReset()
  isPostHogEnabled.mockReset().mockReturnValue(true)
  track.mockReset()
  captureAttribution.mockReset()
  window.sessionStorage.clear()
  clearConsent()
  visit('/')
})

afterEach(() => {
  clearConsent()
})

describe('AnalyticsProvider -> PostHog $pageview', () => {
  it('sends one $pageview with the grouping route once consent is granted', () => {
    grantConsent()
    visit('/product/blue-widget', '/product/blue-widget')

    render(<AnalyticsProvider />)

    const pageviews = trackEvent.mock.calls.filter(([name]) => name === '$pageview')
    expect(pageviews).toHaveLength(1)
    expect(pageviews[0]?.[1]).toMatchObject({ route: '/product/[slug]' })
    expect((pageviews[0]?.[1] as { $current_url: string }).$current_url).toContain(
      '/product/blue-widget',
    )
  })

  it('sends nothing to PostHog on a denial, while first-party tracking still runs', () => {
    denyConsent()
    render(<AnalyticsProvider />)

    expect(trackEvent).not.toHaveBeenCalled()
    // The first-party pipeline has its own consent gate inside the tracker;
    // the provider must keep calling it regardless.
    expect(track).toHaveBeenCalledWith('page_view', { route: '/' })
  })

  it('sends nothing without a configured key', () => {
    grantConsent()
    isPostHogEnabled.mockReturnValue(false)

    render(<AnalyticsProvider />)

    expect(trackEvent).not.toHaveBeenCalled()
  })
})

describe('AnalyticsProvider -> referral_link_clicked', () => {
  it('reports a valid ?ref= landing with the normalized code', () => {
    grantConsent()
    visit('/?ref=abcd2345')

    render(<AnalyticsProvider />)

    const referral = trackEvent.mock.calls.filter(([name]) => name === 'referral_link_clicked')
    expect(referral).toHaveLength(1)
    expect(referral[0]?.[1]).toEqual({ code: 'ABCD2345' })
  })

  it('reports one click per tab, not one per mount', () => {
    grantConsent()
    visit('/?ref=ABCD2345')

    const first = render(<AnalyticsProvider />)
    first.unmount()
    render(<AnalyticsProvider />)

    const referral = trackEvent.mock.calls.filter(([name]) => name === 'referral_link_clicked')
    expect(referral).toHaveLength(1)
  })

  it('ignores a payload that is not a code', () => {
    grantConsent()
    visit('/?ref=<script>alert(1)</script>')

    render(<AnalyticsProvider />)

    expect(trackEvent.mock.calls.filter(([name]) => name === 'referral_link_clicked')).toHaveLength(
      0,
    )
  })

  it('stays silent before the banner is answered', () => {
    visit('/?ref=ABCD2345')

    render(<AnalyticsProvider />)

    expect(trackEvent).not.toHaveBeenCalled()
  })
})
