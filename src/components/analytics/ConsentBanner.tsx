'use client'

import {
  CONSENT_COOKIE,
  CONSENT_DECIDED_ATTRIBUTE,
  CONSENT_DECIDED_VALUE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  serializeConsent,
} from '@/lib/analytics/consent'
import { useState } from 'react'

function writeConsentCookie(decision: ConsentDecision): void {
  const value = serializeConsent({ decision, wordingVersion: CONSENT_WORDING_VERSION })
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(value)}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`
}

/**
 * Cookie consent for behavioral analytics. Accept and decline carry equal
 * visual weight on purpose: a decline that is harder to click than an accept is
 * not a free choice, and the privacy regulator reads it that way too.
 *
 * The markup ships in the server response for EVERY visitor, and the visitors
 * who already decided have it hidden by CSS at first paint, off an attribute
 * that `CONSENT_PREPAINT_SCRIPT` puts on <html> before the parser gets here.
 * See the long note on that constant for why: gating this on a useEffect made
 * the banner's paragraph the homepage's LCP element AND made it wait for
 * hydration, which is the whole of what held mobile at 80.
 *
 * `dismissed` covers only the click, which is necessarily after hydration.
 * There is no mount-time state, so server and client render the same tree.
 */
export default function ConsentBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const decide = (decision: ConsentDecision) => {
    writeConsentCookie(decision)
    // Also set the attribute the pre-paint snippet would have set, so a
    // client-side route change cannot bring the banner back before the next
    // full load reads the cookie.
    document.documentElement.setAttribute(CONSENT_DECIDED_ATTRIBUTE, CONSENT_DECIDED_VALUE)
    setDismissed(true)
  }

  return (
    <section
      data-consent-banner=""
      aria-label="הסכמה לאיסוף נתוני שימוש"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-black/70">
          אנחנו אוספים נתוני שימוש באתר (עמודים שנצפו, פריטים שנוספו לעגלה) כדי לשפר אותו. הנתונים
          נשמרים אצלנו בלבד, בלי פרטים מזהים ובלי העברה לצד שלישי. הזמנות ותשלומים נשמרים בכל מקרה,
          כחלק מהשירות.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
          >
            לא תודה
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
          >
            אישור
          </button>
        </div>
      </div>
    </section>
  )
}
