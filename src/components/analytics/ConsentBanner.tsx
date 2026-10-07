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
 *
 * GRANULAR CHOICE WITHOUT JAVASCRIPT (STEP 31). The third path, "customise",
 * is a native <details>: closed it is one summary line, open it is a checkbox
 * per category and a save button, and the whole thing works before hydration
 * and without it, like the two one-click buttons. The two categories are
 * `lib/analytics/consent.ts`'s CONSENT_CATEGORIES; "necessary" is shown as a
 * checked, disabled box so the visitor sees the full picture, and it is not
 * posted because it is not a choice. The reserved height in globals.css
 * (`--reserve-consent`) includes the closed summary row.
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
  // STEP 33: the home indicator sits inside the viewport once viewport-fit is
  // cover; the buttons must clear it. 0px on every desktop browser.
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
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

const CHECKBOX_ROW = 'flex min-h-11 items-center gap-2 text-sm'

export default function ConsentBanner() {
  return (
    <section data-consent-banner="" aria-label="הסכמה לאיסוף נתוני שימוש" style={BANNER_STYLE}>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p style={COPY_STYLE}>
            אנחנו אוספים נתוני שימוש באתר (עמודים שנצפו, פריטים שנוספו לעגלה) כדי לשפר אותו ולמדוד
            פרסום. חלק מהנתונים מועברים ל-Google Analytics ול-Meta, בלי שם, מייל או טלפון. בלי אישור
            שום כלי חיצוני לא נטען כלל. הזמנות ותשלומים נשמרים בכל מקרה, כחלק מהשירות.
          </p>
          <div
            className="flex shrink-0 gap-2"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
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

        <details className="mt-2" data-consent-customize="">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm text-black/70 underline underline-offset-2">
            התאמה אישית: בחירה לפי סוג
          </summary>
          <form
            action={decideConsent}
            className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6"
          >
            <input type="hidden" name="decision" value="custom" />
            <label className={CHECKBOX_ROW}>
              <input type="checkbox" checked disabled className="size-4" />
              <span>הכרחיות (עגלה, התחברות, תשלום). תמיד פעילות</span>
            </label>
            <label className={CHECKBOX_ROW}>
              <input type="checkbox" name="analytics" className="size-4" />
              <span>מדידת שימוש באתר (כלי המדידה שלנו)</span>
            </label>
            <label className={CHECKBOX_ROW}>
              <input type="checkbox" name="marketing" className="size-4" />
              <span>מדידת פרסום (Google Analytics ו-Meta)</span>
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
            >
              שמירת הבחירה
            </button>
          </form>
        </details>
      </div>
    </section>
  )
}
