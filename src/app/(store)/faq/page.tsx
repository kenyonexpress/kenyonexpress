import { getBoundContentPage } from '@/lib/content/read'
import { jsonLdScript } from '@/lib/seo/json-ld'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The FAQ, plus the `FAQPage` structured data for it, both now from the CMS.
 *
 * THE FAQ IS THE ONE PAGE THE CMS DOES NOT STORE AS PROSE. Its body kind is
 * `faq`: an array of question/answer pairs. The reason is the JSON-LD below.
 * Google penalises structured data that does not match the visible page, and
 * the only way to guarantee they match is to build both from ONE array - which
 * is what this file already did before the CMS existed, and what it still does.
 *
 * Storing the questions as markup instead would have meant reconstructing pairs
 * by guessing which headings are questions. That guess is wrong the first time
 * an operator writes a heading that is not a question, and the failure is
 * invisible: the page still looks right, and the rich result quietly stops
 * being served.
 *
 * With migration 205 unapplied, `getBoundContentPage('faq')` returns the
 * built-in, which is `src/content/legal/faq.ts` - the same array this file
 * imported directly until now.
 */

export async function generateMetadata(): Promise<Metadata> {
  const page = await getBoundContentPage('faq')
  return {
    title: page.seoTitle ?? page.title,
    description:
      page.seoDescription ??
      (page.body.kind === 'faq' ? (page.body.entries[0]?.answer ?? page.title) : page.title),
    alternates: { canonical: '/faq' },
  }
}

export default async function FaqPage() {
  const page = await getBoundContentPage('faq')
  const entries = page.body.kind === 'faq' ? page.body.entries : []

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }

  const updated = page.updatedAt
    ? new Date(page.updatedAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content is the same array the page renders below.
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
        <h1 className="text-3xl font-bold text-heading">{page.title}</h1>
        {updated && <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>}
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          לא מצאתם תשובה? אפשר לפנות אלינו דרך{' '}
          <Link href="/contact" className="font-medium text-heading underline underline-offset-2">
            עמוד צור קשר
          </Link>
          .
        </p>
      </header>

      <div className="max-w-3xl divide-y divide-heading/10 border-y border-heading/10">
        {entries.map((entry) => (
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
