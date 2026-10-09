'use client'

import { CONSENT_COOKIE, isTrackingAllowed } from '@/lib/analytics/consent'
import { readReplayOptIn, writeReplayOptIn } from '@/lib/analytics/replay-optin'
import { useEffect, useState } from 'react'

/**
 * The explicit switch for session replay, in the account area rather than the
 * consent banner (lib/analytics/replay-optin.ts explains the split). Client
 * component because the preference is a browser cookie JavaScript owns: there
 * is nothing to persist server-side, and no server round trip to wait on.
 *
 * State starts as "off" and syncs from the cookie after mount, so the server
 * HTML is identical for every visitor. The consent dependency is surfaced
 * honestly: when the banner was declined, the switch flips the cookie but the
 * recorder still cannot run, and the caption says so instead of letting the
 * shopper believe they enabled something.
 */
export default function ReplayOptInToggle() {
  const [optedIn, setOptedIn] = useState(false)
  const [consented, setConsented] = useState(true)

  useEffect(() => {
    setOptedIn(readReplayOptIn())
    const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
    setConsented(isTrackingAllowed(match?.[1] ? decodeURIComponent(match[1]) : null))
  }, [])

  const toggle = (next: boolean) => {
    writeReplayOptIn(next)
    setOptedIn(next)
  }

  return (
    <section className="account-card">
      <h2 className="account-card__title">הקלטת גלישה לצורך תמיכה</h2>
      <p className="account-row__meta">
        כשהאפשרות פעילה, ביקורים באתר מהדפדפן הזה מוקלטים דרך PostHog כדי שהתמיכה תוכל לראות בדיוק
        מה קרה כשמשהו לא עבד. שדות קלט מוסתרים בהקלטה תמיד, כולל פרטי תשלום. האפשרות כבויה כברירת
        מחדל, חלה רק על הדפדפן הזה, ופגה לבד אחרי חצי שנה.
      </p>

      <div className="account-field account-field--check">
        <input
          type="checkbox"
          id="replay_optin"
          checked={optedIn}
          onChange={(event) => toggle(event.target.checked)}
        />
        <label htmlFor="replay_optin">אני מאשר הקלטה של הגלישה שלי בדפדפן הזה</label>
      </div>

      {optedIn && !consented && (
        <p className="account-row__meta">
          שים לב: איסוף נתוני שימוש כבוי בדפדפן הזה (נדחה בבאנר ההסכמה), ולכן ההקלטה לא תפעל בפועל
          עד שאיסוף הנתונים יאושר.
        </p>
      )}
    </section>
  )
}
