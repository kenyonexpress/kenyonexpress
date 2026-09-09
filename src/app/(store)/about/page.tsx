import RichText from '@/components/content/RichText'
import { excerpt } from '@/lib/content/markup'
import { getBoundContentPage } from '@/lib/content/read'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The about page, whose words now come from the CMS.
 *
 * WHAT CHANGED AND WHAT DID NOT. The address, the frame, the breadcrumb and the
 * typography are untouched: `max-w-page` outside, `max-w-3xl` for the measure,
 * copied from `/faq`, which was measured against the live template. What moved
 * is the source of the text. `getBoundContentPage('about')` returns the
 * published `content_pages` row if there is one and the built-in otherwise, and
 * the built-in IS `src/content/about.ts` reassembled by `BUILT_IN_PAGES` - so
 * with migration 205 unapplied this page renders exactly the words it rendered
 * before, from exactly the module it read before.
 *
 * THE SUPPLIER CALL TO ACTION IS NOT PART OF THE BODY. It is a card with a
 * button, and an operator editing prose has no reason to be able to delete the
 * one link on this page that turns a reader into a business. The CMS owns the
 * prose; the page owns its furniture.
 */

export async function generateMetadata(): Promise<Metadata> {
  const page = await getBoundContentPage('about')
  return {
    title: page.seoTitle ?? page.title,
    description:
      page.seoDescription ?? (page.body.kind === 'prose' ? excerpt(page.body.markup) : page.title),
    alternates: { canonical: '/about' },
  }
}

export default async function AboutPage() {
  const page = await getBoundContentPage('about')

  const updated = page.updatedAt
    ? new Date(page.updatedAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">אודות</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">{page.title}</h1>
        {updated && <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>}
      </header>

      <div className="max-w-3xl space-y-8">
        {page.body.kind === 'prose' && <RichText markup={page.body.markup} />}

        <section className="rounded-xl border border-heading/10 bg-brand-accent/40 p-5">
          <h2 className="text-lg font-semibold text-heading">רוצים להצטרף כספקים?</h2>
          <p className="mt-2 text-base leading-relaxed text-heading/80">
            בתי עסק שרוצים למכור דרכנו מוזמנים להשאיר פרטים, ונחזור אליכם.
          </p>
          <Link
            href="/suppliers"
            className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-heading"
          >
            הצטרפות כספק
          </Link>
        </section>
      </div>
    </main>
  )
}
