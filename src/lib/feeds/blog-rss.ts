import type { BlogAuthor, BlogCategory, BlogPost, BlogTag } from '@/content/blog'
import { escapeXml, rfc822, tag } from './xml'

/**
 * RSS 2.0 over the blog.
 *
 * Pure, like `rss.ts` beside it: takes the registry rows and returns a string,
 * and the route does the serving. It is a second builder and not a parameter
 * on the product one because the two have nothing in common past the channel
 * header: a post has an author, a category and tags and no price, image or
 * stock, and a shared builder would be two `if` ladders pretending to be one.
 *
 * `guid isPermaLink="true"` says the id IS the URL, so a reader that has seen
 * the post will not resurface it when the title is edited. `pubDate` is the
 * post's own date; `lastBuildDate` is the newest post's, not the clock, for
 * the reason the product feed gives: a value that moves on every request
 * tells a reader the feed changed every time it asked.
 */

export interface BlogFeedPost {
  post: BlogPost
  author: BlogAuthor | null
  category: BlogCategory | null
  tags: readonly BlogTag[]
}

export interface BlogRssOptions {
  siteUrl: string
  title: string
  description: string
  /** Absolute URL of the feed itself. */
  selfUrl: string
}

/** The `lastBuildDate`: the newest post's own date, or the epoch when there is none. */
export function blogFeedBuiltAt(posts: readonly BlogPost[]): Date {
  const newest = [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]
  return newest ? new Date(newest.updatedAt ?? newest.publishedAt) : new Date(0)
}

export function buildBlogRssFeed(
  entries: readonly BlogFeedPost[],
  options: BlogRssOptions,
): string {
  const site = options.siteUrl.replace(/\/+$/, '')

  const items = entries.map(({ post, author, category, tags }) => {
    const url = `${site}/blog/${encodeURIComponent(post.slug)}`
    return [
      '<item>',
      tag('title', post.title),
      tag('link', url),
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      tag('description', post.description),
      tag('pubDate', rfc822(new Date(post.publishedAt))),
      // `dc:creator`, not `author`: RSS 2.0's own `author` element is defined
      // as an e-mail address, and a reader that honours the spec shows a name
      // there as a malformed address. Dublin Core is what every reader uses.
      author ? tag('dc:creator', author.name) : '',
      // The category first, then the tags, each as its own element: RSS has
      // one `category` element that repeats, and a reader groups by it.
      category ? tag('category', category.name) : '',
      ...tags.map((entry) => tag('category', entry.label)),
      '</item>',
    ]
      .filter(Boolean)
      .join('')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    tag('title', options.title),
    tag('link', `${site}/blog`),
    tag('description', options.description),
    tag('language', 'he'),
    tag('lastBuildDate', rfc822(blogFeedBuiltAt(entries.map((entry) => entry.post)))),
    `<atom:link href="${escapeXml(options.selfUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '</channel>',
    '</rss>',
  ]
    .filter(Boolean)
    .join('')
}
