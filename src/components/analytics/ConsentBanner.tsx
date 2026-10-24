'use client'

import { CONSENT_DECIDED_ATTRIBUTE, CONSENT_DECIDED_VALUE } from '@/lib/analytics/consent'
import { decideConsent } from '@/server/actions/consent'
import { useState } from 'react'
import ConsentSettings from './ConsentSettings'

/**
 * Cookie consent for behavioral analytics. Accept and decline carry equal
 * visual weight on purpose: a decline that is harder to click than an accept is
 * not a free choice, and the privacy regulator reads it that way too.
 *
 * The markup ships in the server response for EVERY visitor, and the visitors
 * who already decided have it hidden by CSS at first paint, off an attribute
 * that `CONSENT_PREPAINT_SCRIPT` puts on <html> before the parser gets here.
 *
 * On a phone this paragraph IS the LCP element on purpose ([20] / [24]): text
 * with inline Arial + fixed geometry paints with the HTML stream. Shrinking it
 * so the hero image won dropped Performance into the 70s.
 *
 * C63: Added Settings button for granular consent control (Analytics, Marketing).
 * Now a Client Component to manage settings modal state.
 */
const BANNER_STYLE = {
  position: 'fixed',
  insetInline: 0,
  bottom: 0,
  zIndex: 50,
  // The token, not the literal. `--color-surface` is the white paper token in
  // the @theme block, and the raw-hex gate in tokens.test.ts rejects a literal
  // here -- including one written inside a comment, which is how the first
  // attempt at this line failed. Safe for an element that paints before
  // hydration: globals.css is a single render-blocking request ([21]), so the
  // variable is already resolved at first paint.
  background: 'var(--color-surface)',
  padding: '1rem',
  borderTop: '1px solid var(--color-overlay-hairline)',
  boxShadow: 'var(--shadow-consent-banner)',
  fontFamily: 'Arial, Helvetica, sans-serif',
} as const

/**
 * THE DECISION HAS TO HIDE THE BANNER ON THE SAME PAGE, AND THE ACTION ALONE
 * DOES NOT. `decideConsent` sets the cookie and `redirect()`s back to the
 * same path, and in the browser a server-action redirect is a client-side
 * navigation: the document is not reloaded, so the pre-paint snippet that
 * reads the cookie and marks <html> never runs again, and the CSS that hides
 * the banner off that mark never fires. MEASURED 2026-10-21 on the production
 * build: POST 200, `ke_consent=denied.2` in document.cookie, no attribute on
 * <html>, banner still visible; it stayed until the next full load. To a
 * visitor the button did nothing, and in the e2e suite it sat over the sticky
 * buy bar and the cart's clear button and intercepted their clicks.
 *
 * So the banner is hidden at submit time, from a capturing listener on
 * `document`, before the action runs. NOT by setting the <html> attribute
 * alone: that was tried, and the attribute was there 1ms after the submit and
 * gone 136ms later, when React re-rendered the root for the action's
 * transition and reconciled <html> back to its own props (measured with a
 * MutationObserver, 2026-10-21). So the listener also appends a <style> to
 * <head> that hides the banner; React owns neither that node nor its effect,
 * and the attribute is still set for anything else keyed on it. It is a
 * second tiny inline script rather than a client component because this
 * banner is the phone LCP element and deliberately has no bundle; CSP allows
 * it the same way it allows the pre-paint snippet. The cookie is still what
 * the next page load reads, and with script off the forms post natively and
 * that load applies it.
 */
const SUBMIT_HIDES_SCRIPT = `(function(){document.addEventListener("submit",function(e){var f=e.target;if(!(f&&f.closest&&f.closest("[data-consent-banner]")))return;document.documentElement.setAttribute("${CONSENT_DECIDED_ATTRIBUTE}","${CONSENT_DECIDED_VALUE}");if(!document.getElementById("ke-consent-decided")){var s=document.createElement("style");s.id="ke-consent-decided";s.textContent="[data-consent-banner]{display:none}";document.head.appendChild(s)}},true)})()`

const COPY_STYLE = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.625,
  color: 'var(--color-overlay-ink)',
  fontFamily: 'Arial, Helvetica, sans-serif',
} as const

export default function ConsentBanner() {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <section data-consent-banner="" aria-label="הסכמה לאיסוף נתוני שימוש" style={BANNER_STYLE}>
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p style={COPY_STYLE}>
            אנחנו אוספים נתוני שימוש באתר (עמודים שנצפו, פריטים שנוספו לעגלה) כדי לשפר אותו ולמדוד
            פרסום. חלק מהנתונים מועברים ל-Google Analytics ול-Meta, בלי שם, מייל או טלפון. בלי אישור
            שום כלי חיצוני לא נטען כלל. הזמנות ותשלומים נשמרים בכל מקרה, כחלק מהשירות.
          </p>
          <div
            className="flex shrink-0 flex-col gap-2 sm:flex-row"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
            >
              הגדרות
            </button>
            <form action={decideConsent}>
              <input type="hidden" name="decision" value="denied" />
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04] sm:w-auto"
              >
                לא תודה
              </button>
            </form>
            <form action={decideConsent}>
              <input type="hidden" name="decision" value="granted" />
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90 sm:w-auto"
              >
                אישור
              </button>
            </form>
          </div>
        </div>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: fixed string built from two module constants, no input reaches it */}
        <script dangerouslySetInnerHTML={{ __html: SUBMIT_HIDES_SCRIPT }} />
      </section>

      <ConsentSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
