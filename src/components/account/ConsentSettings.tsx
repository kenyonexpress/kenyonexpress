import {
  CONSENT_CATEGORIES,
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  type ConsentCategories,
  type ConsentCategory,
  consentCategories,
  parseConsent,
} from '@/lib/analytics/consent'
import { decideConsent } from '@/server/actions/consent'
import { cookies } from 'next/headers'

/**
 * The consent right after the banner: what was decided, per category, and a
 * way to change it that is as easy as the first click was.
 *
 * The regulation asks for withdrawal to be as simple as consent, and until
 * now the only way to withdraw was to clear the cookie by hand. This reads
 * the same cookie the banner writes, shows each switch in words, and posts
 * the new pair through the same server action the banner uses (as the
 * `custom` decision), so there is one writer and one format. The action
 * reloads the page it was called from, which is this one, so the text
 * updates on the next paint. A separate one-click "withdraw everything"
 * button stays, because withdrawal must never need more clicks than consent.
 *
 * A decision recorded against older wording is shown as "not decided": the
 * banner is asking again, and this section should agree with it.
 */
export type ConsentSummary = 'granted' | 'denied' | 'partial' | 'undecided'

export function summarizeConsent(raw: string | undefined | null): ConsentSummary {
  const state = parseConsent(raw)
  if (state === null || state.wordingVersion < CONSENT_WORDING_VERSION) return 'undecided'
  const { analytics, marketing } = consentCategories(raw)
  if (analytics && marketing) return 'granted'
  if (analytics || marketing) return 'partial'
  return 'denied'
}

const SUMMARY_COPY: Record<ConsentSummary, string> = {
  granted:
    'אישרתם את שני סוגי המדידה. כלי המדידה שלנו פעילים, ו-Google Analytics ו-Meta נטענים, בלי שם, מייל או טלפון.',
  partial: 'אישרתם חלק מסוגי המדידה. מה שלא סומן למטה לא נטען כלל.',
  denied: 'סירבתם לאיסוף נתוני שימוש. שום כלי מדידה לא פעיל ושום כלי חיצוני לא נטען.',
  undecided: 'עדיין לא נרשמה החלטה. עד שתחליטו, שום כלי מדידה לא פעיל ושום כלי חיצוני לא נטען.',
}

const CATEGORY_COPY: Record<ConsentCategory, { label: string; detail: string }> = {
  analytics: {
    label: 'מדידת שימוש באתר',
    detail: 'עמודים שנצפו ופריטים שנוספו לעגלה, בכלי המדידה שלנו, לשיפור האתר.',
  },
  marketing: {
    label: 'מדידת פרסום',
    detail: 'Google Analytics ו-Meta, למדידת קמפיינים. נטענים רק עם הסימון הזה.',
  },
}

export default async function ConsentSettings() {
  const raw = (await cookies()).get(CONSENT_COOKIE)?.value
  const summary = summarizeConsent(raw)
  const current: ConsentCategories = consentCategories(raw)

  return (
    <section className="account-card" data-consent-summary={summary}>
      <h2 className="account-card__title">הסכמה לאיסוף נתוני שימוש</h2>
      <p className="account-row__meta">{SUMMARY_COPY[summary]}</p>
      <p className="account-row__meta">
        עוגיות הכרחיות (עגלה, התחברות, תשלום) פעילות תמיד, והזמנות ותשלומים נשמרים בכל מקרה, כחלק
        מהשירות. אפשר לשנות את הבחירה בכל רגע, והשינוי חל מהטעינה הבאה של האתר.
      </p>

      <form action={decideConsent} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="decision" value="custom" />
        {CONSENT_CATEGORIES.map((category) => (
          <label key={category} className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={category}
              defaultChecked={current[category]}
              className="mt-1 size-4"
              data-consent-category={category}
            />
            <span>
              <span className="font-bold">{CATEGORY_COPY[category].label}</span>
              <span className="block text-muted">{CATEGORY_COPY[category].detail}</span>
            </span>
          </label>
        ))}
        <div>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
          >
            שמירת הבחירה
          </button>
        </div>
      </form>

      {summary !== 'denied' ? (
        <form action={decideConsent} className="mt-2">
          <input type="hidden" name="decision" value="denied" />
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
          >
            ביטול ההסכמה כולה
          </button>
        </form>
      ) : null}
    </section>
  )
}
