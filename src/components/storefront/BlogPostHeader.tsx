import {
  findAuthor,
  findCategory,
  findPost,
  findTag,
  formatPostDate,
  jsonLdPost,
} from '@/content/blog'
import { buildBlogPostingJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
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
 *
 * THE BYLINE (STEP 54) names the author from the registry and links to the
 * only profile the site has, `/about`. The same author goes into the JSON-LD
 * as a `Person`, so the byline a reader sees and the author Google reads are
 * one field.
 */
export default function BlogPostHeader({ slug }: { slug: string }) {
  const post = findPost(slug)
  if (!post) return null

  const base = siteUrl()
  const author = findAuthor(post.author)
  const category = findCategory(post.category)
  const tags = post.tags.map(findTag).filter((tag) => tag !== null)
  const jsonLd = buildBlogPostingJsonLd(jsonLdPost(post), base)

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
        {category ? (
          <>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <Link href={`/blog/category/${category.slug}`} className="hover:text-heading">
              {category.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">{post.title}</span>
      </nav>

      <h1 className="text-3xl font-bold text-heading">{post.title}</h1>
      <p className="mt-2 text-sm text-heading/75" data-testid="blog-byline">
        {author ? (
          <>
            מאת{' '}
            <Link href={author.url} className="font-semibold text-heading hover:underline">
              {author.name}
            </Link>
            {' · '}
          </>
        ) : null}
        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
        {post.updatedAt ? (
          <>
            {' · '}עודכן <time dateTime={post.updatedAt}>{formatPostDate(post.updatedAt)}</time>
          </>
        ) : null}
        {' · '}
        {post.readingMinutes} דקות קריאה
      </p>
      {tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="תגיות">
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
      ) : null}
    </>
  )
}
