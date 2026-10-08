import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aboutTeam } from '@/content/about'
import { describe, expect, it } from 'vitest'
import {
  BLOG_AUTHORS,
  BLOG_CATEGORIES,
  BLOG_POSTS,
  BLOG_TAGS,
  type BlogPost,
  categoriesInUse,
  findAuthor,
  findCategory,
  findPost,
  findTag,
  formatPostDate,
  postsInCategory,
  postsWithTag,
  relatedPosts,
  sortedPosts,
  tagsInUse,
} from './index'

const BLOG_DIR = join(process.cwd(), 'src', 'app', '(store)', 'blog')

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The value, or a thrown test failure: the registries are never empty here. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value')
  return value
}

function fixture(overrides: Partial<BlogPost> & { slug: string }): BlogPost {
  return {
    title: overrides.slug,
    description: 'x'.repeat(50),
    publishedAt: '2026-01-01',
    readingMinutes: 1,
    category: 'guides',
    tags: [],
    author: 'ofir',
    ...overrides,
  }
}

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

  it('every MDX file names its own slug in the header, the footer and the canonical', () => {
    // The file states the slug three times and all three must be ITS slug. A
    // post copied from another and left with the old slug would render the
    // other post's title, byline and related list under its own URL.
    for (const post of BLOG_POSTS) {
      const text = readFileSync(join(BLOG_DIR, post.slug, 'page.mdx'), 'utf8')
      expect(text, post.slug).toContain(`findPost('${post.slug}')`)
      expect(text, post.slug).toContain(`<BlogPostHeader slug="${post.slug}" />`)
      expect(text, post.slug).toContain(`<BlogPostFooter slug="${post.slug}" />`)
      expect(text, post.slug).toContain(`path: '/blog/${post.slug}'`)
    }
  })

  it('uses slugs that are safe in a URL', () => {
    for (const post of BLOG_POSTS) {
      expect(post.slug, post.slug).toMatch(SLUG)
    }
    for (const category of BLOG_CATEGORIES) expect(category.slug).toMatch(SLUG)
    for (const tag of BLOG_TAGS) expect(tag.slug).toMatch(SLUG)
  })

  it('has no duplicate slugs anywhere', () => {
    for (const list of [BLOG_POSTS, BLOG_CATEGORIES, BLOG_TAGS]) {
      const slugs = list.map((entry) => entry.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
    }
    const ids = BLOG_AUTHORS.map((author) => author.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not let a post slug collide with the category, tag or feed segments', () => {
    // `/blog/category/...`, `/blog/tag/...` and `/blog/feed.xml` are routes; a
    // post at `/blog/category` would be two routes on one address.
    for (const post of BLOG_POSTS) {
      expect(['category', 'tag', 'feed.xml']).not.toContain(post.slug)
    }
  })
})

describe('categories, tags and authors resolve', () => {
  it('every post names a registered category, registered tags and a registered author', () => {
    for (const post of BLOG_POSTS) {
      expect(findCategory(post.category), `${post.slug} category`).not.toBeNull()
      expect(findAuthor(post.author), `${post.slug} author`).not.toBeNull()
      for (const tag of post.tags) expect(findTag(tag), `${post.slug} tag ${tag}`).not.toBeNull()
    }
  })

  it('gives every post at least one tag and no tag twice', () => {
    for (const post of BLOG_POSTS) {
      expect(post.tags.length, post.slug).toBeGreaterThan(0)
      expect(new Set(post.tags).size, post.slug).toBe(post.tags.length)
    }
  })

  it('prints Hebrew labels, not the slugs', () => {
    for (const category of BLOG_CATEGORIES) expect(category.name).toMatch(/[א-ת]/)
    for (const tag of BLOG_TAGS) expect(tag.label).toMatch(/[א-ת]/)
    for (const category of BLOG_CATEGORIES) {
      expect(category.description.length).toBeGreaterThan(30)
    }
  })

  it('links only what has a post behind it', () => {
    for (const category of categoriesInUse()) {
      expect(postsInCategory(category.slug).length).toBeGreaterThan(0)
    }
    for (const tag of tagsInUse()) {
      expect(postsWithTag(tag.slug).length).toBeGreaterThan(0)
    }
    const unused = fixture({ slug: 'z', category: 'businesses', tags: ['payouts'] })
    expect(categoriesInUse([unused]).map((c) => c.slug)).toEqual(['businesses'])
    expect(tagsInUse([unused]).map((t) => t.slug)).toEqual(['payouts'])
  })

  it('the byline author is the person /about lists, by the same fields', () => {
    // A byline that disagreed with the team section would be two descriptions
    // of one person on one site.
    const author = findAuthor('ofir')
    expect(author).not.toBeNull()
    const founder = must(aboutTeam[0])
    expect(author?.name).toBe(founder.name)
    expect(author?.role).toBe(founder.role)
    expect(author?.bio).toBe(founder.about)
    expect(author?.url).toBe('/about')
  })

  it('returns null for unknown slugs rather than throwing', () => {
    expect(findCategory('nope')).toBeNull()
    expect(findTag('nope')).toBeNull()
    expect(findAuthor('nope')).toBeNull()
    expect(postsInCategory('nope')).toEqual([])
    expect(postsWithTag('nope')).toEqual([])
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

  it('formats the date in Hebrew, by the calendar day and not the local clock', () => {
    expect(formatPostDate('2026-08-10')).toBe('10 באוגוסט 2026')
  })
})

describe('ordering', () => {
  it('is newest first, which is what the index and the sitemap both assume', () => {
    const ordered = sortedPosts([
      fixture({ slug: 'a', publishedAt: '2026-01-01' }),
      fixture({ slug: 'b', publishedAt: '2026-06-01' }),
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

describe('relatedPosts', () => {
  const posts: BlogPost[] = [
    fixture({ slug: 'current', category: 'guides', tags: ['coupons', 'guide'] }),
    fixture({
      slug: 'two-tags',
      category: 'businesses',
      tags: ['coupons', 'guide'],
      publishedAt: '2026-01-02',
    }),
    fixture({
      slug: 'one-tag-same-category',
      category: 'guides',
      tags: ['coupons'],
      publishedAt: '2026-01-03',
    }),
    fixture({
      slug: 'same-category-only',
      category: 'guides',
      tags: ['refunds'],
      publishedAt: '2026-01-04',
    }),
    fixture({
      slug: 'unrelated-newest',
      category: 'businesses',
      tags: ['payouts'],
      publishedAt: '2026-09-01',
    }),
    fixture({
      slug: 'unrelated-older',
      category: 'businesses',
      tags: ['payouts'],
      publishedAt: '2026-02-01',
    }),
  ]

  it('ranks shared tags above a shared category, and never includes the post itself', () => {
    expect(relatedPosts('current', 3, posts).map((post) => post.slug)).toEqual([
      'two-tags',
      'one-tag-same-category',
      'same-category-only',
    ])
  })

  it('fills the list with the newest unrelated posts when fewer relate', () => {
    expect(relatedPosts('current', 5, posts).map((post) => post.slug)).toEqual([
      'two-tags',
      'one-tag-same-category',
      'same-category-only',
      'unrelated-newest',
      'unrelated-older',
    ])
  })

  it('breaks a tie by recency', () => {
    expect(relatedPosts('same-category-only', 2, posts).map((post) => post.slug)).toEqual([
      // One shared tag... none; same category: current (01-01), one-tag (01-03). Newer first.
      'one-tag-same-category',
      'current',
    ])
  })

  it('is deterministic over the real registry and never returns the post itself', () => {
    for (const post of BLOG_POSTS) {
      const first = relatedPosts(post.slug).map((item) => item.slug)
      const second = relatedPosts(post.slug).map((item) => item.slug)
      expect(first).toEqual(second)
      expect(first).not.toContain(post.slug)
      expect(first.length).toBe(Math.min(3, BLOG_POSTS.length - 1))
    }
  })

  it('returns nothing for an unknown slug', () => {
    expect(relatedPosts('nope', 3, posts)).toEqual([])
  })
})
