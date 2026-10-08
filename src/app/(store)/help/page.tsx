import HelpContext from '@/components/help/HelpContext'
import WhatsAppSupportButton from '@/components/help/WhatsAppSupportButton'
import { HELP_TOPICS, groupFaqByTopic, helpTopicAnchor } from '@/content/help/topics'
import { faqEntries } from '@/content/legal/faq'
import { contactEmail } from '@/lib/contact-address'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata: Metadata = publicPageMetadata({
  title: 'מרכז העזרה',
  description:
    'מרכז העזרה של קניון אקספרס: תשובות לפי נושא על הזמנות, קופונים, ביטולים וחשבון, טופס פנייה ותמיכה בוואטסאפ.',
  path: '/help',
})

/**
 * The help centre (STEP 50).
 *
 * One page, in the order a customer with a problem reads it: the two fastest
 * ways to a person, the FAQ by shelf, and a form that already knows which
 * order it is about when the customer arrived from one. The FAQ is the SAME
 * array `/faq` renders, so the two pages cannot disagree; the `FAQPage`
 * structured data stays on `/faq` alone, because the same questions marked up
 * on two URLs is the duplication Google penalises.
 *
 * The page is static. `?order=` and `?topic=` are read by `HelpContext` in the
 * browser, inside Suspense, which keeps every other byte prerendered.
 */
export default function HelpPage() {
  const shelves = groupFaqByTopic(faqEntries)
  const email = contactEmail()

  return (
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">מרכז העזרה</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">מרכז העזרה</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          שאלה על הזמנה, קופון או החזר? התשובות המהירות למטה לפי נושא, ואם צריך אדם, אנחנו כאן.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <WhatsAppSupportButton />
          <a
            href={`mailto:${email}`}
            dir="ltr"
            className="inline-flex min-h-12 items-center rounded-xl border border-heading/20 bg-white px-5 py-3 text-base font-medium text-heading hover:border-heading/40"
          >
            {email}
          </a>
        </div>
      </header>

      <nav aria-label="נושאי עזרה" className="mb-8 max-w-3xl">
        <ul className="flex flex-wrap gap-2">
          {HELP_TOPICS.filter((t) => shelves.some((s) => s.topic.id === t.id)).map((topic) => (
            <li key={topic.id}>
              <a
                href={`#${helpTopicAnchor(topic.id)}`}
                className="inline-flex min-h-11 items-center rounded-full border border-heading/20 px-4 py-2 text-sm font-medium text-heading hover:border-heading/40"
              >
                {topic.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Suspense fallback={null}>
        <HelpContext />
      </Suspense>

      <div className="mt-12 max-w-3xl space-y-10">
        {shelves.map((shelf) => (
          <section
            key={shelf.topic.id}
            id={helpTopicAnchor(shelf.topic.id)}
            aria-labelledby={`${helpTopicAnchor(shelf.topic.id)}-title`}
            className="scroll-mt-24"
          >
            <h2
              id={`${helpTopicAnchor(shelf.topic.id)}-title`}
              className="text-xl font-bold text-heading"
            >
              {shelf.topic.label}
            </h2>
            <p className="mt-1 text-sm text-heading/75">{shelf.topic.blurb}</p>
            <div className="mt-3 divide-y divide-heading/10 border-y border-heading/10">
              {shelf.entries.map((entry) => (
                // <details> as on /faq: opens with no hydration and is keyboard
                // operable and searchable by the browser's find.
                <details key={entry.question} className="group py-4">
                  <summary className="cursor-pointer list-none text-base font-semibold text-heading marker:content-none">
                    <span className="inline-block w-5 text-heading/75 transition-transform group-open:rotate-90">
                      ‹
                    </span>
                    {entry.question}
                  </summary>
                  <p className="mt-2 ps-5 text-base leading-relaxed text-heading/80">
                    {entry.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 max-w-3xl text-sm text-heading/75">
        הרשימה המלאה של השאלות, ללא חלוקה לנושאים, נמצאת בעמוד{' '}
        <Link href="/faq" className="font-medium text-heading underline underline-offset-2">
          שאלות נפוצות
        </Link>
        . מדיניות הביטולים וההחזרות המלאה נמצאת בעמוד{' '}
        <Link
          href="/legal/returns"
          className="font-medium text-heading underline underline-offset-2"
        >
          ביטולים והחזרות
        </Link>
        .
      </p>
    </div>
  )
}
