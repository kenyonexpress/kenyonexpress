import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import BlogCategoryPage, {
  generateStaticParams as categoryParams,
} from '@/app/(store)/blog/category/[slug]/page'
import BlogIndexPage from '@/app/(store)/blog/page'
import BlogTagPage, { generateStaticParams as tagParams } from '@/app/(store)/blog/tag/[slug]/page'
import {
  BLOG_FEED_PATH,
  BLOG_POSTS,
  categoriesInUse,
  findAuthor,
  findCategory,
  findTag,
  postsInCategory,
  postsWithTag,
  relatedPosts,
  sortedPosts,
  tagsInUse,
} from '@/content/blog'
import { validateJsonLd } from '@/lib/seo/json-ld-validate.mjs'
import BlogPostFooter from './BlogPostFooter'
import BlogPostHeader from './BlogPostHeader'

/**
 * The blog pages print the registry and nothing else (STEP 54).
 *
 * Every assertion reads the same module the pages read, so adding a post, a
 * tag or a category cannot fail here, and a title retyped into markup would.
 * Rendering is static server markup: these are server components with no
 * data access, and the share buttons are client components that render their
 * initial state.
 */

/** The value, or a thrown test failure: the registries are never empty here. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value')
  return value
}

function jsonLdNodes(html: string): unknown[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  return scripts.map((match) => JSON.parse(match[1] ?? 'null'))
}

describe('/blog index', () => {
  const html = renderToStaticMarkup(<BlogIndexPage />)

  it('lists every post newest first, with its category chip and byline', () => {
    const posts = sortedPosts()
    expect(html.match(/data-testid="blog-post-card"/g)).toHaveLength(posts.length)
    const positions = posts.map((post) => html.indexOf(`href="/blog/${post.slug}"`))
    for (const [i, pos] of positions.entries()) expect(pos, posts[i]?.slug).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const post of posts) {
      expect(html).toContain(post.title)
      expect(html).toContain(post.description)
      expect(html).toContain(`href="/blog/category/${post.category}"`)
      expect(html).toContain(findAuthor(post.author)?.name)
    }
  })

  it('links every category and tag in use, and nothing that is not', () => {
    for (const category of categoriesInUse()) {
      expect(html).toContain(`href="/blog/category/${category.slug}"`)
    }
    for (const tag of tagsInUse()) {
      expect(html).toContain(`href="/blog/tag/${tag.slug}"`)
    }
    expect(html.match(/href="\/blog\/tag\//g)).toHaveLength(tagsInUse().length)
  })

  it('offers the feed as a visible link', () => {
    expect(html).toContain(`href="${BLOG_FEED_PATH}"`)
    expect(html).toContain('data-testid="blog-feed-link"')
  })

  it('carries a valid Blog node over the same posts', () => {
    const [node] = jsonLdNodes(html) as Record<string, unknown>[]
    expect(node?.['@type']).toBe('Blog')
    expect((node?.blogPost as unknown[]).length).toBe(BLOG_POSTS.length)
    expect(validateJsonLd(node).filter((issue) => issue.level === 'error')).toEqual([])
  })
})

describe('one post: header and footer', () => {
  const post = must(sortedPosts()[0])
  const header = renderToStaticMarkup(<BlogPostHeader slug={post.slug} />)
  const footer = renderToStaticMarkup(<BlogPostFooter slug={post.slug} />)

  it('prints the byline with the author linked to /about, the date and the reading time', () => {
    const author = findAuthor(post.author)
    expect(header).toContain('data-testid="blog-byline"')
    expect(header).toContain(`href="${author?.url}"`)
    expect(header).toContain(author?.name)
    expect(header).toMatch(new RegExp(`datetime="${post.publishedAt}"`, 'i'))
    expect(header).toContain(`${post.readingMinutes} דקות קריאה`)
  })

  it('puts the category in the breadcrumb and every tag as a chip', () => {
    expect(header).toContain(`href="/blog/category/${post.category}"`)
    for (const tag of post.tags) {
      expect(header).toContain(`href="/blog/tag/${tag}"`)
      expect(header).toContain(findTag(tag)?.label)
    }
  })

  it('writes the author as a Person and the section and keywords into the BlogPosting', () => {
    const [node] = jsonLdNodes(header) as Record<string, unknown>[]
    expect(node?.['@type']).toBe('BlogPosting')
    const author = node?.author as Record<string, unknown>
    expect(author['@type']).toBe('Person')
    expect(author.name).toBe(findAuthor(post.author)?.name)
    expect(String(author.url)).toMatch(/^https?:\/\/.+\/about$/)
    expect(node?.articleSection).toBe(findCategory(post.category)?.name)
    expect(node?.keywords).toBe(post.tags.map((tag) => findTag(tag)?.label).join(', '))
    expect(validateJsonLd(node).filter((issue) => issue.level === 'error')).toEqual([])
  })

  it('offers WhatsApp, Facebook and the device share sheet', () => {
    expect(footer).toContain('data-testid="blog-share"')
    expect(footer).toContain('שתפו בוואטסאפ')
    expect(footer).toContain('שיתוף בפייסבוק')
    expect(footer).toContain('העתקת קישור')
  })

  it('prints the author card from the registry', () => {
    const author = findAuthor(post.author)
    expect(footer).toContain('data-testid="blog-author"')
    expect(footer).toContain(author?.role)
    expect(footer).toContain(author?.bio)
  })

  it('lists the related posts the ranking returns, in that order, never itself', () => {
    const related = relatedPosts(post.slug, 3)
    expect(related.length).toBeGreaterThan(0)
    const positions = related.map((item) => footer.indexOf(`href="/blog/${item.slug}"`))
    for (const pos of positions) expect(pos).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(footer).not.toContain(`href="/blog/${post.slug}"`)
  })

  it('renders nothing for a slug that is not in the registry', () => {
    expect(renderToStaticMarkup(<BlogPostHeader slug="nope" />)).toBe('')
    expect(renderToStaticMarkup(<BlogPostFooter slug="nope" />)).toBe('')
  })
})

describe('category and tag pages', () => {
  it('prerender exactly the categories and tags in use', () => {
    expect(categoryParams()).toEqual(categoriesInUse().map((c) => ({ slug: c.slug })))
    expect(tagParams()).toEqual(tagsInUse().map((t) => ({ slug: t.slug })))
  })

  it('a category page lists only its posts under its own heading', async () => {
    const category = must(categoriesInUse()[0])
    const html = renderToStaticMarkup(
      await BlogCategoryPage({ params: Promise.resolve({ slug: category.slug }) }),
    )
    expect(html).toContain(`>${category.name}</h1>`)
    expect(html).toContain(category.description)
    const posts = postsInCategory(category.slug)
    expect(html.match(/data-testid="blog-post-card"/g)).toHaveLength(posts.length)
    for (const post of BLOG_POSTS) {
      const present = html.includes(`href="/blog/${post.slug}"`)
      expect(present, post.slug).toBe(post.category === category.slug)
    }
    const [node] = jsonLdNodes(html) as Record<string, unknown>[]
    expect(String(node?.url)).toMatch(new RegExp(`/blog/category/${category.slug}$`))
    expect(validateJsonLd(node).filter((issue) => issue.level === 'error')).toEqual([])
  })

  it('a tag page lists only the posts carrying it', async () => {
    const tag = must(tagsInUse()[0])
    const html = renderToStaticMarkup(
      await BlogTagPage({ params: Promise.resolve({ slug: tag.slug }) }),
    )
    expect(html).toContain(`>${tag.label}</h1>`)
    const posts = postsWithTag(tag.slug)
    expect(html.match(/data-testid="blog-post-card"/g)).toHaveLength(posts.length)
    for (const post of BLOG_POSTS) {
      const present = html.includes(`href="/blog/${post.slug}"`)
      expect(present, post.slug).toBe((post.tags as readonly string[]).includes(tag.slug))
    }
  })
})
