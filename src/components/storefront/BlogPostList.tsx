import { type BlogPost, findAuthor, findCategory, formatPostDate } from '@/content/blog'
import Link from 'next/link'

/**
 * The post cards: one list, rendered by the index, every category page and
 * every tag page.
 *
 * It takes posts rather than reading the registry so each page decides WHICH
 * posts and this file decides only how a post looks. The category chip on a
 * card is a link because a reader who found a guide wants the other guides,
 * and a chip that only labels is a chip that gets clicked anyway.
 *
 * `heading` is `h2` by default. A category page has an `h1` of its own above
 * the list, so the titles stay `h2`; the index has the same shape. Nothing here
 * ever renders an `h1`, which keeps one per page.
 */
export default function BlogPostList({
  posts,
  emptyCopy = 'עוד לא פורסמו פוסטים.',
}: {
  posts: readonly BlogPost[]
  emptyCopy?: string
}) {
  if (posts.length === 0) {
    return <p className="text-base text-heading/75">{emptyCopy}</p>
  }

  return (
    <ul className="divide-y divide-heading/10 border-y border-heading/10">
      {posts.map((post) => {
        const category = findCategory(post.category)
        const author = findAuthor(post.author)
        return (
          <li key={post.slug} className="py-5" data-testid="blog-post-card">
            <article>
              {category ? (
                <Link
                  href={`/blog/category/${category.slug}`}
                  className="inline-block rounded-full bg-heading/5 px-2.5 py-0.5 text-xs font-semibold text-heading hover:bg-heading/10"
                >
                  {category.name}
                </Link>
              ) : null}
              <h2 className="mt-2 text-lg font-semibold text-heading">
                <Link href={`/blog/${post.slug}`} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-1.5 text-base leading-relaxed text-heading/80">{post.description}</p>
              <p className="mt-2 text-sm text-heading/75">
                {author ? <span>{author.name} · </span> : null}
                <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                {' · '}
                {post.readingMinutes} דקות קריאה
              </p>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
