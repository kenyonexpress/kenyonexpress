import { FAQ_UPDATED_AT, faqEntries } from '@/content/legal/faq'
import { jsonLdScript } from '@/lib/seo/json-ld'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'שאלות נפוצות',
  description:
    'שאלות נפוצות על קניון אקספרס: איך עובד קופון, מה משלמים בבית העסק, תוקף, ביטולים, החזרים, ארנק וחשבוניות.',
  alternates: { canonical: '/faq' },
}

/**
 * The FAQ, plus the `FAQPage` structured data for it.
 *
 * The JSON-LD is built from the SAME array the page renders, not written
 * alongside it. Two hand-maintained copies of an answer drift, and the copy
 * that drifts is the invisible one - which is the copy Google reads out as a
 * rich result. Google also penalises structured data that does not match the
 * visible page, so the duplication would be a risk in both directions.
 */
export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }

  const updated = new Date(FAQ_UPDATED_AT).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content is this file's own array.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">שאלות נפוצות</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">שאלות נפוצות</h1>
        <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          לא מצאתם תשובה? אפשר לפנות אלינו דרך{' '}
          <Link href="/contact" className="font-medium text-heading underline underline-offset-2">
            עמוד צור קשר
          </Link>
          .
        </p>
      </header>

      <div className="max-w-3xl divide-y divide-heading/10 border-y border-heading/10">
        {faqEntries.map((entry) => (
          // <details> rather than a JS accordion: it opens with no hydration,
          // is keyboard operable and searchable by the browser's find, and
          // survives the page being read before any script runs.
          <details key={entry.question} className="group py-4">
            <summary className="cursor-pointer list-none text-base font-semibold text-heading marker:content-none">
              <span className="inline-block w-5 text-heading/60 transition-transform group-open:rotate-90">
                ‹
              </span>
              {entry.question}
            </summary>
            <p className="mt-2 ps-5 text-base leading-relaxed text-heading/80">{entry.answer}</p>
          </details>
        ))}
      </div>
    </main>
  )
}
