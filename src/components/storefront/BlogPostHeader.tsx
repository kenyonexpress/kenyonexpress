import { findPost } from '@/content/blog'
import { jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import Link from 'next/link'

/**
 * The title block and the structured data for one post.
 *
 * IT TAKES A SLUG, NOT THE FIELDS. An MDX file that spelled its own title,
 * date and reading time inline would be a second copy of what the registry
 * already holds, and the two would drift the first time a headline was edited -
 * with the index page and the article header disagreeing about the same post.
 * The slug is the only thing the file has to state, and it has to state it
 * anyway to be found.
 *
 * A slug with no registry entry renders nothing rather than throwing. The post
 * body still reaches the reader; what is lost is the header and the JSON-LD,
 * which is a smaller failure than a 500 on a published URL. `blog.test.ts`
 * catches the mismatch before it ships.
 */
export default function BlogPostHeader({ slug }: { slug: string }) {
  const post = findPost(slug)
  if (!post) return null

  const base = siteUrl()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    url: `${base}/blog/${post.slug}`,
    inLanguage: 'he-IL',
    publisher: { '@type': 'Organization', name: 'KenyonExpress', url: base },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${base}/blog/${post.slug}` },
  }

  const published = new Date(post.publishedAt).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content comes from the typed registry.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <Link href="/blog" className="hover:text-heading">
          הבלוג
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">{post.title}</span>
      </nav>

      <h1 className="text-3xl font-bold text-heading">{post.title}</h1>
      <p className="mt-2 text-sm text-heading/60">
        {published} · {post.readingMinutes} דקות קריאה
      </p>
    </>
  )
}
