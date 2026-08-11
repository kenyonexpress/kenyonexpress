import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLOG_POSTS, findPost, sortedPosts } from './index'

const BLOG_DIR = join(process.cwd(), 'src', 'app', '(store)', 'blog')

describe('the post registry matches what is on disk', () => {
  it('has an MDX file for every registered post', () => {
    // The one failure mode of a hand-written registry: an entry whose file was
    // renamed or never committed. The index would link it and the sitemap would
    // publish it, and both would 404.
    for (const post of BLOG_POSTS) {
      const file = join(BLOG_DIR, post.slug, 'page.mdx')
      expect(existsSync(file), `missing ${post.slug}/page.mdx`).toBe(true)
    }
  })

  it('uses slugs that are safe in a URL', () => {
    for (const post of BLOG_POSTS) {
      expect(post.slug, post.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('has no duplicate slugs', () => {
    const slugs = BLOG_POSTS.map((post) => post.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('post metadata is fit to publish', () => {
  it('states a real date, not a placeholder', () => {
    for (const post of BLOG_POSTS) {
      expect(post.publishedAt, post.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(new Date(post.publishedAt).getTime())).toBe(false)
    }
  })

  it('carries a description short enough to survive a search result', () => {
    // Google truncates around 160 characters, and a description that is cut
    // mid-sentence reads worse than a shorter one that finishes.
    for (const post of BLOG_POSTS) {
      expect(post.description.length, post.slug).toBeGreaterThan(40)
      expect(post.description.length, post.slug).toBeLessThanOrEqual(200)
    }
  })

  it('states a reading time a reader can act on', () => {
    for (const post of BLOG_POSTS) {
      expect(post.readingMinutes, post.slug).toBeGreaterThan(0)
      expect(post.readingMinutes, post.slug).toBeLessThan(60)
    }
  })
})

describe('ordering', () => {
  it('is newest first, which is what the index and the sitemap both assume', () => {
    const ordered = sortedPosts([
      {
        slug: 'a',
        title: 'a',
        description: 'x'.repeat(50),
        publishedAt: '2026-01-01',
        readingMinutes: 1,
        tags: [],
      },
      {
        slug: 'b',
        title: 'b',
        description: 'x'.repeat(50),
        publishedAt: '2026-06-01',
        readingMinutes: 1,
        tags: [],
      },
    ])
    expect(ordered.map((post) => post.slug)).toEqual(['b', 'a'])
  })

  it('does not mutate the array it was given', () => {
    const input = [...BLOG_POSTS]
    sortedPosts(input)
    expect(input).toEqual([...BLOG_POSTS])
  })
})

describe('findPost', () => {
  it('returns null for an unknown slug rather than throwing', () => {
    // `BlogPostHeader` relies on this: a post whose registry entry is missing
    // still renders its body, losing only the header and the JSON-LD.
    expect(findPost('nope')).toBeNull()
  })
})
