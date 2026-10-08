import BlogPostList from '@/components/storefront/BlogPostList'
import { categoriesInUse, findCategory, jsonLdPost, postsInCategory } from '@/content/blog'
import { buildBlogJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { siteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

/**
 * One category of the blog: `/blog/category/guides`.
 *
 * Prerendered for every category that has a post (`categoriesInUse`), and
 * nothing else: a registered category with no post is not a page yet, and an
 * unknown slug is a 404, not an empty list with a 200 that Google would index.
 */
export function generateStaticParams() {
  return categoriesInUse().map((category) => ({ slug: category.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = findCategory(slug)
  if (!category) return {}
  return publicPageMetadata({
    title: `${category.name} · הבלוג`,
    description: category.description,
    path: `/blog/category/${category.slug}`,
  })
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params
  const category = findCategory(slug)
  if (!category) notFound()

  const posts = postsInCategory(category.slug)
  if (posts.length === 0) notFound()

  const jsonLd = buildBlogJsonLd(posts.map(jsonLdPost), siteUrl(), {
    name: `${category.name} · הבלוג של קניון אקספרס`,
    path: `/blog/category/${category.slug}`,
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
        <span className="text-heading">{category.name}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-heading">{category.name}</h1>
        <p className="mt-3 text-base leading-relaxed text-heading/80">{category.description}</p>
      </header>

      <BlogPostList posts={posts} />
    </>
  )
}
