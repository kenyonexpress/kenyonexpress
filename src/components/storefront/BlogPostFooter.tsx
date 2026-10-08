import FacebookShareButton from '@/components/shared/FacebookShareButton'
import ShareButton from '@/components/shared/ShareButton'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import { findAuthor, findPost, formatPostDate, relatedPosts } from '@/content/blog'
import Link from 'next/link'

/**
 * What follows the body of a post: the share row, the author card and what
 * to read next.
 *
 * THE SHARE BUTTONS ARE THE PRODUCT PAGE'S. WhatsApp and Facebook because
 * that is where Israeli readers forward things, and the device share sheet
 * for everything else. All three read the URL at click time, so a post opened
 * with campaign parameters shares the page the reader is on. The WhatsApp
 * message is the title and nothing else: the URL is appended by the button
 * on its own line, and a message that also carried it would send it twice.
 *
 * THE AUTHOR CARD repeats the byline with the one-line bio from the registry,
 * which is the same text `/about` prints for this person.
 *
 * RELATED POSTS come from `relatedPosts`, scored on shared tags and category
 * and never random, so the same post always offers the same three. When the
 * registry holds nothing but this post, the section is omitted rather than
 * rendered empty.
 */
export default function BlogPostFooter({ slug }: { slug: string }) {
  const post = findPost(slug)
  if (!post) return null

  const author = findAuthor(post.author)
  const related = relatedPosts(slug, 3)

  return (
    <footer className="mt-12 border-t border-heading/10 pt-8">
      <section aria-labelledby="blog-share-heading" data-testid="blog-share">
        <h2 id="blog-share-heading" className="text-base font-semibold text-heading">
          שיתוף הפוסט
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <WhatsAppShareButton message={post.title} appendCurrentUrl />
          <FacebookShareButton />
          <ShareButton title={post.title} text={post.description} />
        </div>
      </section>

      {author ? (
        <section
          aria-labelledby="blog-author-heading"
          className="mt-8 rounded-xl border border-heading/10 p-5"
          data-testid="blog-author"
        >
          <h2 id="blog-author-heading" className="text-sm text-heading/75">
            על הכותב
          </h2>
          <p className="mt-1 text-base font-semibold text-heading">
            <Link href={author.url} className="hover:underline">
              {author.name}
            </Link>
            <span className="font-normal text-heading/75"> · {author.role}</span>
          </p>
          <p className="mt-1.5 text-base leading-relaxed text-heading/80">{author.bio}</p>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section aria-labelledby="blog-related-heading" className="mt-8" data-testid="blog-related">
          <h2 id="blog-related-heading" className="text-xl font-semibold text-heading">
            כדאי לקרוא גם
          </h2>
          <ul className="mt-4 divide-y divide-heading/10 border-y border-heading/10">
            {related.map((item) => (
              <li key={item.slug} className="py-4">
                <Link href={`/blog/${item.slug}`} className="group block">
                  <h3 className="text-base font-semibold text-heading group-hover:underline">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-heading/75">
                    <time dateTime={item.publishedAt}>{formatPostDate(item.publishedAt)}</time>
                    {' · '}
                    {item.readingMinutes} דקות קריאה
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </footer>
  )
}
