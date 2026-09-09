import { decideConsent } from '@/server/actions/consent'

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
 * Server Component + form actions ([25]): there is no client bundle for the
 * banner. The decision writes a cookie and redirects; the pre-paint snippet
 * hides the banner on the next response.
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

const COPY_STYLE = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.625,
  color: 'var(--color-overlay-ink)',
  fontFamily: 'Arial, Helvetica, sans-serif',
} as const

export default function ConsentBanner() {
  return (
    <section data-consent-banner="" aria-label="הסכמה לאיסוף נתוני שימוש" style={BANNER_STYLE}>
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p style={COPY_STYLE}>
          אנחנו אוספים נתוני שימוש באתר (עמודים שנצפו, פריטים שנוספו לעגלה) כדי לשפר אותו ולמדוד
          פרסום. חלק מהנתונים מועברים ל-Google Analytics ול-Meta, בלי שם, מייל או טלפון. בלי אישור
          שום כלי חיצוני לא נטען כלל. הזמנות ותשלומים נשמרים בכל מקרה, כחלק מהשירות.
        </p>
        <div className="flex shrink-0 gap-2" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          <form action={decideConsent}>
            <input type="hidden" name="decision" value="denied" />
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
            >
              לא תודה
            </button>
          </form>
          <form action={decideConsent}>
            <input type="hidden" name="decision" value="granted" />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
            >
              אישור
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
