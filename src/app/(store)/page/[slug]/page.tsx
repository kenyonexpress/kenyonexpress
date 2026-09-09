import RichText from '@/components/content/RichText'
import { excerpt } from '@/lib/content/markup'
import { BUILT_IN_PAGES, type ContentPage } from '@/lib/content/pages'
import { getContentPage } from '@/lib/content/read'
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

/**
 * A content page that has no address of its own: `/page/<slug>`.
 *
 * FOUR OF THE FIVE BUILT-IN PAGES ARE NOT SERVED HERE, and that is the point of
 * `boundRoute`. `/about`, `/faq`, `/contact` and `/suppliers` already have
 * addresses that are in the sitemap, carry canonicals and are linked from the
 * footer; answering at `/page/about` as well would be the same words at two
 * URLs competing with each other. Those routes read the CMS themselves. This
 * one exists for pages an operator creates, and for `how-it-works`, which is
 * the only built-in that has never had a route.
 *
 * AN UNPUBLISHED PAGE IS A 404 AND NOT A 403. `getContentPage` reads through
 * the anon client and the RLS policy in 205 only exposes published rows, so a
 * draft is indistinguishable here from a slug that was never created - which is
 * the correct answer to give a stranger about a page that is not finished.
 *
 * `dynamicParams` is left at its default. `how-it-works` is prerendered because
 * it ships with the build; a page the operator creates next week is rendered on
 * demand and then cached by the same `use cache` scope the read lives in.
 */

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return Object.values(BUILT_IN_PAGES)
    .filter((page) => page.boundRoute === null)
    .map((page) => ({ slug: page.slug }))
}

/** The description a crawler gets: the override, or the body's own first words. */
function description(page: ContentPage): string {
  if (page.seoDescription) return page.seoDescription
  return page.body.kind === 'prose'
    ? excerpt(page.body.markup)
    : (page.body.entries[0]?.answer ?? '')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await getContentPage(slug)

  // An unknown or unpublished slug renders notFound() below, which emits its
  // own noindex. Returning metadata for it would describe a 404.
  if (!page || page.boundRoute !== null) return {}

  return {
    title: page.seoTitle ?? page.title,
    description: description(page),
    alternates: { canonical: `/page/${page.slug}` },
    ...(page.ogImageUrl ? { openGraph: { images: [{ url: page.ogImageUrl }] } } : {}),
  }
}

export default async function ContentPageRoute({ params }: Props) {
  const { slug } = await params
  const page = await getContentPage(slug)

  // A bound page refuses to answer here even though the row exists. Otherwise
  // publishing `/about` through the CMS would silently create a second address
  // for it, which is the duplicate `boundRoute` is here to prevent.
  if (!page || page.boundRoute !== null) notFound()

  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      { name: page.title, path: `/page/${page.slug}` },
    ],
    siteUrl(),
  )

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
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the values are a page title and a slug that already passed the CHECK in 205.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />

      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">{page.title}</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">{page.title}</h1>
        {updated && <p className="mt-2 text-sm text-heading/75">עודכן לאחרונה: {updated}</p>}
      </header>

      {page.body.kind === 'prose' ? (
        <RichText markup={page.body.markup} className="max-w-3xl" />
      ) : (
        <div className="max-w-3xl divide-y divide-heading/10 border-y border-heading/10">
          {page.body.entries.map((entry) => (
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
      )}
    </main>
  )
}
