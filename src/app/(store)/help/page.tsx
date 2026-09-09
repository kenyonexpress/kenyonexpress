import { FAQ_UPDATED_AT, faqEntries } from '@/content/legal/faq'
import { contactEmail } from '@/lib/contact-address'
import { SLA_TARGETS } from '@/server/domain/support/sla'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'מרכז העזרה',
  description:
    'מרכז העזרה של קניון אקספרס: תשובות מהירות, מעקב אחרי פנייה קיימת, ודרכים ליצור קשר.',
  alternates: { canonical: '/help' },
}

/**
 * The help centre.
 *
 * WHY IT IS NOT A SECOND FAQ. `/faq` already answers twelve questions, carries
 * the `FAQPage` structured data, and holds itself to a standard worth keeping:
 * every answer describes behaviour that exists in the code. Copying those
 * answers here would create the second, drifting copy that `/faq` explicitly
 * refuses to create for its own JSON-LD.
 *
 * So this page does the thing the FAQ cannot: it ROUTES. A customer arriving
 * at "help" has one of three problems - a general question, a problem with a
 * specific order, or a message already sent that nobody has answered - and only
 * the first is an FAQ. The other two had no entry point at all before this.
 *
 * THE RESPONSE TIMES ARE READ FROM `SLA_TARGETS`, not typed here. A published
 * promise and the number the queue is measured against have to be the same
 * number, and the only way to guarantee that is for there to be one.
 */

const TOP_QUESTIONS = 5

export default function HelpPage() {
  const featured = faqEntries.slice(0, TOP_QUESTIONS)

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-heading">מרכז העזרה</h1>
      <p className="mt-2 text-sm text-body">
        רוב השאלות נענות כאן תוך שניות. אם לא מצאתם, פתחו פנייה ונחזור אליכם.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-heading">שאלות נפוצות</h2>
        <ul className="mt-3 space-y-2">
          {featured.map((entry) => (
            <li key={entry.question}>
              <details className="rounded-lg border border-border bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-heading">
                  {entry.question}
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm text-body">{entry.answer}</p>
              </details>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <Link href="/faq" className="underline">
            כל השאלות הנפוצות
          </Link>{' '}
          <span className="text-body">(עודכן {FAQ_UPDATED_AT})</span>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-heading">בעיה בהזמנה מסוימת</h2>
        <p className="mt-2 text-sm text-body">
          הדרך המהירה ביותר היא מתוך ההזמנה עצמה: אנחנו רואים מיד באיזו הזמנה מדובר, ואתם לא צריכים
          להעתיק מספרים.
        </p>
        <p className="mt-3">
          <Link href="/account/orders" className="account-btn">
            ההזמנות שלי
          </Link>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-heading">פנייה שכבר פתחתם</h2>
        <p className="mt-2 text-sm text-body">
          כל הפניות שלכם, עם התשובות שלנו, נמצאות בחשבון. אפשר להשיב שם וזה ממשיך את אותה שיחה.
        </p>
        <p className="mt-3">
          <Link href="/account/tickets" className="account-btn">
            הפניות שלי
          </Link>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-heading">יצירת קשר</h2>
        <p className="mt-2 text-sm text-body">
          טופס{' '}
          <Link href="/contact" className="underline">
            צור קשר
          </Link>{' '}
          או במייל{' '}
          <a href={`mailto:${contactEmail()}`} className="underline">
            {contactEmail()}
          </a>
          .
        </p>
        <p className="mt-3 text-sm text-body">
          זמני התגובה שאנחנו מתחייבים אליהם, ולפיהם התור נמדד: פנייה דחופה (שובר שלא נסרק בבית העסק)
          — עד <bdi>{SLA_TARGETS.urgent.firstResponseHours}</bdi> שעות. בעיה בתשלום או בהזמנה ששולמה
          — עד <bdi>{SLA_TARGETS.high.firstResponseHours}</bdi> שעות. שאלה רגילה — עד{' '}
          <bdi>{SLA_TARGETS.normal.firstResponseHours}</bdi> שעות.
        </p>
      </section>
    </div>
  )
}
