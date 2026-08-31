import { sortedPosts } from '@/content/blog'
import { jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'הבלוג',
  description: 'מדריכים והסברים על קופונים, מימוש בבתי עסק, תוקף, ביטולים והזמנות.',
  alternates: { canonical: '/blog' },
}

function hebrewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * The post index.
 *
 * The `Blog` JSON-LD is built from the SAME array the page renders, for the
 * reason `/faq` gives about its `FAQPage` data: two hand-maintained copies
 * drift, and the copy that drifts is the invisible one - the copy Google reads.
 */
export default function BlogIndexPage() {
  const posts = sortedPosts()
  const base = siteUrl()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'הבלוג של קניון אקספרס',
    url: `${base}/blog`,
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt ?? post.publishedAt,
      url: `${base}/blog/${post.slug}`,
    })),
  }

  return (
    <>
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
        <span className="text-heading">הבלוג</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-heading">הבלוג</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          מדריכים קצרים על איך הדברים כאן באמת עובדים.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-base text-heading/75">עוד לא פורסמו פוסטים.</p>
      ) : (
        <ul className="divide-y divide-heading/10 border-y border-heading/10">
          {posts.map((post) => (
            <li key={post.slug} className="py-5">
              <Link href={`/blog/${post.slug}`} className="group block">
                <h2 className="text-lg font-semibold text-heading group-hover:underline">
                  {post.title}
                </h2>
                <p className="mt-1.5 text-base leading-relaxed text-heading/80">
                  {post.description}
                </p>
                <p className="mt-2 text-sm text-heading/60">
                  {hebrewDate(post.publishedAt)} · {post.readingMinutes} דקות קריאה
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
