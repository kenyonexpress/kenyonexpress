import {
  BLOG_POSTS,
  type BlogPost,
  findAuthor,
  findCategory,
  findTag,
  sortedPosts,
} from '@/content/blog'
import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'
import { type BlogFeedPost, blogFeedBuiltAt, buildBlogRssFeed } from './blog-rss'

const parser = new XMLParser({ ignoreAttributes: false })

/** The value, or a thrown test failure: the registries are never empty here. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value')
  return value
}

const OPTIONS = {
  siteUrl: 'https://kenyonexpress.co.il/',
  title: 'הבלוג של קניון אקספרס',
  description: 'מדריכים',
  selfUrl: 'https://kenyonexpress.co.il/blog/feed.xml',
}

function entry(post: BlogPost): BlogFeedPost {
  return {
    post,
    author: findAuthor(post.author),
    category: findCategory(post.category),
    tags: post.tags.map(findTag).filter((tag) => tag !== null),
  }
}

function build(posts: readonly BlogPost[] = sortedPosts()): string {
  return buildBlogRssFeed(posts.map(entry), OPTIONS)
}

type Item = Record<string, unknown>
function items(xml: string): Item[] {
  const parsed = parser.parse(xml)
  const item = parsed.rss.channel.item
  return item === undefined ? [] : Array.isArray(item) ? item : [item]
}

describe('buildBlogRssFeed', () => {
  it('is a well-formed RSS 2.0 document with one item per post', () => {
    const xml = build()
    const parsed = parser.parse(xml)
    expect(parsed.rss['@_version']).toBe('2.0')
    expect(parsed.rss.channel.title).toBe(OPTIONS.title)
    expect(parsed.rss.channel.link).toBe('https://kenyonexpress.co.il/blog')
    expect(parsed.rss.channel.language).toBe('he')
    expect(items(xml)).toHaveLength(BLOG_POSTS.length)
  })

  it('declares itself through atom:link rel=self at the feed URL', () => {
    const parsed = parser.parse(build())
    const self = parsed.rss.channel['atom:link']
    expect(self['@_rel']).toBe('self')
    expect(self['@_href']).toBe(OPTIONS.selfUrl)
    expect(self['@_type']).toBe('application/rss+xml')
  })

  it('links each item to the post URL and uses that URL as a permalink guid', () => {
    const first = must(items(build())[0])
    const newest = must(sortedPosts()[0])
    const url = `https://kenyonexpress.co.il/blog/${newest.slug}`
    expect(first.link).toBe(url)
    expect((first.guid as Record<string, unknown>)['#text']).toBe(url)
    expect((first.guid as Record<string, unknown>)['@_isPermaLink']).toBe('true')
    expect(first.title).toBe(newest.title)
    expect(first.description).toBe(newest.description)
  })

  it('names the author in dc:creator, not in the e-mail-shaped author element', () => {
    const first = must(items(build())[0])
    expect(first['dc:creator']).toBe(findAuthor('ofir')?.name)
    expect(first.author).toBeUndefined()
    expect(build()).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
  })

  it('lists the category first and then every tag label as category elements', () => {
    const newest = must(sortedPosts()[0])
    const first = must(items(build())[0])
    const categories = first.category as string[]
    expect(categories[0]).toBe(findCategory(newest.category)?.name)
    expect(categories.slice(1)).toEqual(newest.tags.map((tag) => findTag(tag)?.label))
  })

  it('dates each item by the post date in RFC 822', () => {
    const newest = must(sortedPosts()[0])
    const first = must(items(build())[0])
    expect(first.pubDate).toBe(new Date(newest.publishedAt).toUTCString())
  })

  it('stamps lastBuildDate with the newest post, not the clock', () => {
    const parsed = parser.parse(build())
    expect(parsed.rss.channel.lastBuildDate).toBe(blogFeedBuiltAt(BLOG_POSTS).toUTCString())
  })

  it('escapes a title that would otherwise break the document', () => {
    const post: BlogPost = {
      ...must(BLOG_POSTS[0]),
      slug: 'ampersand',
      title: 'קפה & מאפה <לא תג>',
    }
    const xml = buildBlogRssFeed([entry(post)], OPTIONS)
    expect(parser.parse(xml).rss.channel.item.title).toBe('קפה & מאפה <לא תג>')
  })

  it('does not double the slash when the site url ends with one', () => {
    expect(build()).not.toContain('.co.il//')
  })
})

describe('blogFeedBuiltAt', () => {
  it('is the epoch for an empty registry so a reader sees no change', () => {
    expect(blogFeedBuiltAt([]).getTime()).toBe(0)
  })

  it('prefers updatedAt over publishedAt for the newest post', () => {
    const post: BlogPost = {
      ...must(BLOG_POSTS[0]),
      publishedAt: '2026-01-01',
      updatedAt: '2026-03-01',
    }
    expect(blogFeedBuiltAt([post]).toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
})
