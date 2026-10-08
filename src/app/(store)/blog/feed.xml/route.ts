import {
  BLOG_FEED_PATH,
  BLOG_FEED_TITLE,
  findAuthor,
  findCategory,
  findTag,
  sortedPosts,
} from '@/content/blog'
import { CacheControl } from '@/lib/cache/http'
import { buildBlogRssFeed } from '@/lib/feeds/blog-rss'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { siteUrl } from '@/lib/site-url'
import { NextResponse } from 'next/server'

/**
 * `/blog/feed.xml`: every post, newest first.
 *
 * No database and no `use cache`: the registry is source, so the feed is as
 * static as the index page and changes only with a deploy. The edge header is
 * the product feed's, because a reader polls this one the same way.
 */
function handleGET(): NextResponse {
  const site = siteUrl()

  const entries = sortedPosts().map((post) => ({
    post,
    author: findAuthor(post.author),
    category: findCategory(post.category),
    tags: post.tags.map(findTag).filter((tag) => tag !== null),
  }))

  const xml = buildBlogRssFeed(entries, {
    siteUrl: site,
    title: BLOG_FEED_TITLE,
    description: 'מדריכים והסברים על קופונים, מימוש בבתי עסק, תוקף, ביטולים והזמנות.',
    selfUrl: `${site}${BLOG_FEED_PATH}`,
  })

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': CacheControl.feed,
    },
  })
}

export const GET = withRequestLog(BLOG_FEED_PATH, handleGET)
