import BlogPostList from '@/components/storefront/BlogPostList'
import { findTag, jsonLdPost, postsWithTag, tagsInUse } from '@/content/blog'
import { buildBlogJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { siteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

/**
 * One tag of the blog: `/blog/tag/coupons`.
 *
 * Same rules as the category page: prerendered only for tags with a post,
 * an unknown or unused tag is a 404. The description is written here rather
 * than per tag because a tag is a word, not a section with a thesis.
 */
export function generateStaticParams() {
  return tagsInUse().map((tag) => ({ slug: tag.slug }))
}

function tagDescription(label: string): string {
  return `כל הפוסטים בבלוג של קניון אקספרס בנושא ${label}: מדריכים והסברים על איך הדברים כאן עובדים.`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = findTag(slug)
  if (!tag) return {}
  return publicPageMetadata({
    title: `${tag.label} · הבלוג`,
    description: tagDescription(tag.label),
    path: `/blog/tag/${tag.slug}`,
  })
}

export default async function BlogTagPage({ params }: Props) {
  const { slug } = await params
  const tag = findTag(slug)
  if (!tag) notFound()

  const posts = postsWithTag(tag.slug)
  if (posts.length === 0) notFound()

  const jsonLd = buildBlogJsonLd(posts.map(jsonLdPost), siteUrl(), {
    name: `${tag.label} · הבלוג של קניון אקספרס`,
    path: `/blog/tag/${tag.slug}`,
  })

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content is the typed registry.
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
        <span className="text-heading">{tag.label}</span>
      </nav>

      <header className="mb-8">
        <p className="text-sm font-semibold text-heading/75">תגית</p>
        <h1 className="mt-1 text-3xl font-bold text-heading">{tag.label}</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">
          {tagDescription(tag.label)}
        </p>
      </header>

      <BlogPostList posts={posts} />
    </>
  )
}
