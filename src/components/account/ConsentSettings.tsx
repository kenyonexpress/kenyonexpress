import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  parseConsent,
} from '@/lib/analytics/consent'
import { decideConsent } from '@/server/actions/consent'
import { cookies } from 'next/headers'

/**
 * The consent right after the banner: what was decided, and a way to change
 * it that is as easy as the first click was.
 *
 * The regulation asks for withdrawal to be as simple as consent, and until
 * now the only way to withdraw was to clear the cookie by hand. This reads
 * the same cookie the banner writes, shows the decision in words, and posts
 * the opposite decision through the same server action the banner uses, so
 * there is one writer and one format. The action reloads the page it was
 * called from, which is this one, so the text updates on the next paint.
 *
 * A decision recorded against older wording is shown as "not decided": the
 * banner is asking again, and this section should agree with it.
 */
export type ConsentSummary = ConsentDecision | 'undecided'

export function summarizeConsent(raw: string | undefined | null): ConsentSummary {
  const state = parseConsent(raw)
  if (state === null || state.wordingVersion < CONSENT_WORDING_VERSION) return 'undecided'
  return state.decision
}

const SUMMARY_COPY: Record<ConsentSummary, string> = {
  granted: 'אישרתם איסוף נתוני שימוש. Google Analytics ו-Meta נטענים, בלי שם, מייל או טלפון.',
  denied: 'סירבתם לאיסוף נתוני שימוש. שום כלי חיצוני לא נטען.',
  undecided: 'עדיין לא נרשמה החלטה. עד שתחליטו, שום כלי חיצוני לא נטען.',
}

export default async function ConsentSettings() {
  const raw = (await cookies()).get(CONSENT_COOKIE)?.value
  const summary = summarizeConsent(raw)

  return (
    <section className="account-card" data-consent-summary={summary}>
      <h2 className="account-card__title">הסכמה לאיסוף נתוני שימוש</h2>
      <p className="account-row__meta">{SUMMARY_COPY[summary]}</p>
      <p className="account-row__meta">
        הזמנות ותשלומים נשמרים בכל מקרה, כחלק מהשירות. אפשר לשנות את ההחלטה בכל רגע, והשינוי חל
        מהטעינה הבאה של האתר.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary !== 'denied' ? (
          <form action={decideConsent}>
            <input type="hidden" name="decision" value="denied" />
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
            >
              ביטול ההסכמה
            </button>
          </form>
        ) : null}
        {summary !== 'granted' ? (
          <form action={decideConsent}>
            <input type="hidden" name="decision" value="granted" />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
            >
              אישור איסוף נתוני שימוש
            </button>
          </form>
        ) : null}
      </div>
    </section>
  )
}
