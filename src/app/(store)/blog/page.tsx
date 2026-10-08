import BlogPostList from '@/components/storefront/BlogPostList'
import {
  BLOG_FEED_PATH,
  BLOG_FEED_TITLE,
  categoriesInUse,
  jsonLdPost,
  sortedPosts,
  tagsInUse,
} from '@/content/blog'
import { buildBlogJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { siteUrl } from '@/lib/site-url'
import { Rss } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = publicPageMetadata({
  title: 'הבלוג',
  description: 'מדריכים והסברים על קופונים, מימוש בבתי עסק, תוקף, ביטולים והזמנות.',
  path: '/blog',
})

/**
 * The post index.
 *
 * The `Blog` JSON-LD is built from the SAME array the page renders, for the
 * reason `/faq` gives about its `FAQPage` data: two hand-maintained copies
 * drift, and the copy that drifts is the invisible one - the copy Google reads.
 *
 * The category and tag rows (STEP 54) list only what has a post behind it,
 * through `categoriesInUse` and `tagsInUse`, so a chip never leads to an
 * empty page. The feed link is a visible `<a>` and not only a `<link>` in the
 * head: a reader who wants the feed has to be able to find it.
 */
export default function BlogIndexPage() {
  const posts = sortedPosts()
  const categories = categoriesInUse(posts)
  const tags = tagsInUse(posts)
  const base = siteUrl()

  const jsonLd = buildBlogJsonLd(posts.map(jsonLdPost), base)

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-heading">הבלוג</h1>
          <a
            href={BLOG_FEED_PATH}
            type="application/rss+xml"
            className="tap-area tap-area--36 inline-flex items-center gap-1.5 text-sm font-semibold text-heading/80 hover:text-heading"
            data-testid="blog-feed-link"
          >
            <Rss size={16} aria-hidden="true" />
            <span>RSS</span>
            <span className="sr-only">{BLOG_FEED_TITLE}</span>
          </a>
        </div>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          מדריכים קצרים על איך הדברים כאן באמת עובדים.
        </p>
      </header>

      {categories.length > 0 ? (
        <nav aria-label="קטגוריות" className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/blog/category/${category.slug}`}
                  className="inline-block rounded-full border border-heading/15 px-3 py-1 text-sm font-semibold text-heading hover:bg-heading/5"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <BlogPostList posts={posts} />

      {tags.length > 0 ? (
        <nav aria-label="תגיות" className="mt-8">
          <h2 className="text-sm font-semibold text-heading/75">תגיות</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.slug}>
                <Link
                  href={`/blog/tag/${tag.slug}`}
                  className="inline-block rounded-full bg-heading/5 px-2.5 py-0.5 text-xs font-semibold text-heading hover:bg-heading/10"
                >
                  {tag.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </>
  )
}
