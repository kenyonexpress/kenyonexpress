'use client'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  needsConsentDecision,
  serializeConsent,
} from '@/lib/analytics/consent'
import { useEffect, useState } from 'react'

function readConsentCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

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
 * Rendered only after mount, so the server-rendered HTML is identical for every
 * visitor and stays cacheable.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(needsConsentDecision(readConsentCookie()))
  }, [])

  if (!visible) return null

  const decide = (decision: ConsentDecision) => {
    writeConsentCookie(decision)
    setVisible(false)
  }

  return (
    <section
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
            className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
          >
            לא תודה
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
          >
            אישור
          </button>
        </div>
      </div>
    </section>
  )
}
