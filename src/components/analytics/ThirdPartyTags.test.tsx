import ThirdPartyTags from '@/components/analytics/ThirdPartyTags'
import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The requirement in this goal that is worth a test: NOTHING loads before
 * consent.
 *
 * `next/script` is stubbed to a plain `<script>` so the assertions are about
 * what is in the tree, not about how Next schedules it. A component that
 * rendered a denied-consent bootstrap would still fail these, which is the
 * point - the check is "is there a third-party tag at all", not "did the SDK
 * promise to behave".
 */
vi.mock('next/script', () => ({
  default: ({ src, children, id }: { src?: string; children?: string; id?: string }) =>
    src ? (
      <script data-testid={id} src={src} />
    ) : (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the stub has to reproduce what next/script does with inline children, which is what the assertions read.
      <script data-testid={id} dangerouslySetInnerHTML={{ __html: children ?? '' }} />
    ),
}))

const CONFIG = { ga4MeasurementId: 'G-ABC1234567', metaPixelId: '123456789012' }

function setConsent(value: string | null): void {
  if (value === null) {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`
    return
  }
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/`
}

afterEach(() => {
  setConsent(null)
})

describe('before consent', () => {
  it('renders no script at all', () => {
    setConsent(null)
    const { container } = render(<ThirdPartyTags config={CONFIG} />)
    expect(container.querySelectorAll('script')).toHaveLength(0)
  })

  it('renders nothing after an explicit refusal', () => {
    setConsent(`denied.${CONSENT_WORDING_VERSION}`)
    const { container } = render(<ThirdPartyTags config={CONFIG} />)
    expect(container.querySelectorAll('script')).toHaveLength(0)
  })

  it('renders nothing for a consent given to superseded wording', () => {
    // The banner used to promise no third-party transfer. A yes to that
    // sentence cannot cover Google and Meta, and the version gate is what makes
    // the old cookie stop counting.
    setConsent('granted.1')
    const { container } = render(<ThirdPartyTags config={CONFIG} />)
    expect(container.querySelectorAll('script')).toHaveLength(0)
    expect(CONSENT_WORDING_VERSION).toBeGreaterThan(1)
  })
})

describe('after consent', () => {
  it('loads both vendors', () => {
    setConsent(`granted.${CONSENT_WORDING_VERSION}`)
    const { container } = render(<ThirdPartyTags config={CONFIG} />)
    const html = container.innerHTML
    expect(html).toContain('googletagmanager.com/gtag/js?id=G-ABC1234567')
    expect(html).toContain("fbq('init','123456789012')")
  })

  it('states consent explicitly rather than relying on a Google default', () => {
    setConsent(`granted.${CONSENT_WORDING_VERSION}`)
    const { container } = render(<ThirdPartyTags config={CONFIG} />)
    expect(container.innerHTML).toContain("gtag('consent','update'")
    expect(container.innerHTML).toContain("analytics_storage:'granted'")
  })

  it('loads nothing when no id is configured, however the visitor answered', () => {
    setConsent(`granted.${CONSENT_WORDING_VERSION}`)
    const { container } = render(
      <ThirdPartyTags config={{ ga4MeasurementId: null, metaPixelId: null }} />,
    )
    expect(container.querySelectorAll('script')).toHaveLength(0)
  })

  it('drops a malformed id rather than loading a container that reports nothing', () => {
    // A Tag Manager container pasted into the GA4 variable loads without error
    // and measures nothing, which is the worst failure mode there is.
    setConsent(`granted.${CONSENT_WORDING_VERSION}`)
    const { container } = render(
      <ThirdPartyTags config={{ ga4MeasurementId: 'GTM-WRONG1', metaPixelId: null }} />,
    )
    expect(container.querySelectorAll('script')).toHaveLength(0)
  })
})
