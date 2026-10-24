'use client'

import { CONSENT_COOKIE, CONSENT_WORDING_VERSION, isTrackingAllowed } from '@/lib/analytics/consent'
import {
  CONSENT_CATEGORIES,
  CONSENT_GRANULAR_COOKIE,
  isCategoryAllowed,
} from '@/lib/analytics/consent-categories'
import {
  type ThirdPartyAnalyticsConfig,
  hasAnyThirdParty,
  validatedConfig,
} from '@/lib/analytics/third-party'
import Script from 'next/script'
import { useEffect, useState } from 'react'

/**
 * GA4 and the Meta Pixel, mounted ONLY after the visitor has agreed.
 *
 * NOTHING RENDERS BEFORE CONSENT. Not a script tag, not a stub, not a
 * consent-mode-denied bootstrap. `<Script>` is not in the tree at all until
 * `allowed` is true, so there is no third-party request of any kind - which is
 * the version of this requirement that can be checked in a network log rather
 * than taken on a vendor's word.
 *
 * This is stricter than Google's recommended Consent Mode pattern, which loads
 * `gtag.js` immediately with everything denied. The reasoning is in
 * `lib/analytics/third-party.ts`; the short version is that fetching the script
 * already hands Google the visitor's IP, and that transfer is the thing consent
 * exists for.
 *
 * THE COOKIE IS READ IN AN EFFECT, NOT DURING RENDER. `document` does not exist
 * on the server, and a component that reads it while rendering hydrates with a
 * different tree than the server produced. The first client paint therefore has
 * no tags even for a visitor who consented months ago; they arrive one tick
 * later, which costs nothing that matters.
 *
 * A `consent granted` event on the window is what makes the banner's Accept
 * button take effect immediately. Without it the tags would wait for a
 * navigation, and the visit that consented would be the one visit never
 * measured.
 */

export const CONSENT_GRANTED_EVENT = 'ke:consent-granted'

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export default function ThirdPartyTags({ config }: { config: ThirdPartyAnalyticsConfig }) {
  // C63: Granular consent - separate flags for analytics and marketing
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false)
  const [marketingAllowed, setMarketingAllowed] = useState(false)
  const valid = validatedConfig(config)

  useEffect(() => {
    const check = () => {
      const granularCookie = readCookie(CONSENT_GRANULAR_COOKIE)
      const legacyCookie = readCookie(CONSENT_COOKIE)

      // Try granular consent first (C63)
      if (granularCookie) {
        setAnalyticsAllowed(
          isCategoryAllowed(granularCookie, CONSENT_CATEGORIES.analytics, CONSENT_WORDING_VERSION),
        )
        setMarketingAllowed(
          isCategoryAllowed(granularCookie, CONSENT_CATEGORIES.marketing, CONSENT_WORDING_VERSION),
        )
      } else {
        // Fall back to legacy all-or-nothing consent
        const allowed = isTrackingAllowed(legacyCookie)
        setAnalyticsAllowed(allowed)
        setMarketingAllowed(allowed)
      }
    }
    check()
    window.addEventListener(CONSENT_GRANTED_EVENT, check)
    return () => window.removeEventListener(CONSENT_GRANTED_EVENT, check)
  }, [])

  if (!hasAnyThirdParty(valid)) return null

  return (
    <>
      {/* C63: GA4 loads only if analytics consent granted */}
      {analyticsAllowed && valid.ga4MeasurementId && (
        <>
          <Script
            id="ga4-src"
            // `afterInteractive`, not `beforeInteractive`: this only ever mounts
            // after a user gesture, so there is nothing to race, and blocking
            // hydration on a third-party script would cost the INP this very
            // script is meant to measure.
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${valid.ga4MeasurementId}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {[
              'window.dataLayer=window.dataLayer||[];',
              'function gtag(){dataLayer.push(arguments);}',
              'window.gtag=gtag;',
              "gtag('js',new Date());",
              // Granted explicitly rather than left to the default. The tag is
              // only here because the visitor said yes, and stating it means a
              // future Google default flip cannot silently change behaviour.
              "gtag('consent','update',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});",
              `gtag('config','${valid.ga4MeasurementId}',{send_page_view:true,currency:'ILS'});`,
            ].join('')}
          </Script>
        </>
      )}

      {/* C63: Meta Pixel loads only if marketing consent granted */}
      {marketingAllowed && valid.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {[
            '!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?',
            'n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;',
            "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;",
            't.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}',
            "(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
            `fbq('init','${valid.metaPixelId}');`,
            "fbq('track','PageView');",
          ].join('')}
        </Script>
      )}
    </>
  )
}
