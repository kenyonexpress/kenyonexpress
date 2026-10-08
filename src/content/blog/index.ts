import { aboutTeam } from '@/content/about'
import type { BlogPostLike } from '@/lib/seo/json-ld'

/**
 * The post registry, with its categories, tags and authors.
 *
 * WHY A TYPED LIST AND NOT A DIRECTORY SCAN. The obvious alternative is
 * `fs.readdir` over the blog folder plus a frontmatter parser, and it fails in
 * exactly the place that matters: the index page and the sitemap are static, so
 * a filesystem read there either forces them dynamic or gets frozen at build
 * time in a way nobody notices until a post is missing from Google. A list in
 * source is checked by the compiler, is diffable in review, and cannot disagree
 * with itself.
 *
 * It CAN disagree with what is on disk - a post file with no entry here is
 * reachable by URL but absent from the index and the sitemap. That is the one
 * failure mode, it is caught by `blog.test.ts`, and it is the cheap direction:
 * a post nobody linked is invisible, not broken.
 *
 * NO DRAFTS FLAG. A post that should not be public is a post that is not
 * merged. A `published: false` field means unfinished copy sitting in the
 * repository behind a boolean somebody will eventually flip by accident.
 *
 * CATEGORIES, TAGS AND AUTHORS ARE REGISTRIES TOO (STEP 54). A post names a
 * category slug, tag slugs and an author id, and each must exist in the table
 * beside it: the compiler rejects a slug that is not in the union, so a typo
 * in a post cannot produce a category page with one post and a 404 chip. The
 * Hebrew label lives once, in the registry, and the URL segment is the Latin
 * slug, so `/blog/tag/coupons` is the address and "קופונים" is the chip.
 *
 * WHY NOT A TABLE. Three posts, three tags and one author are content that is
 * reviewed in a pull request, not data that changes at runtime. A table would
 * need a migration that is not approved, RLS, and an admin screen for a
 * handful of rows; the registry has the same shape and none of the surface.
 */

export const BLOG_CATEGORIES = [
  {
    slug: 'guides',
    name: 'מדריכים',
    description: 'איך הדברים כאן עובדים, שלב אחרי שלב: מהרכישה ועד הסריקה בבית העסק.',
  },
  {
    slug: 'businesses',
    name: 'לבתי עסק',
    description: 'מה בית עסק צריך לדעת לפני שהוא מעלה דיל, ואיך נראה הצד שלו ביום שאחרי.',
  },
] as const

export type BlogCategorySlug = (typeof BLOG_CATEGORIES)[number]['slug']
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

export const BLOG_TAGS = [
  { slug: 'coupons', label: 'קופונים' },
  { slug: 'guide', label: 'מדריך' },
  { slug: 'redemption', label: 'מימוש' },
  { slug: 'refunds', label: 'ביטולים והחזרים' },
  { slug: 'businesses', label: 'בתי עסק' },
  { slug: 'payouts', label: 'תשלומים לספקים' },
] as const

export type BlogTagSlug = (typeof BLOG_TAGS)[number]['slug']
export type BlogTag = (typeof BLOG_TAGS)[number]

export interface BlogAuthor {
  id: string
  /** As printed in the byline. */
  name: string
  role: string
  /** One line under the name at the foot of a post. */
  bio: string
  /** Where the byline links. The about page is the only profile this site has. */
  url: string
}

/**
 * The authors. One today, and the entry is the same person `/about` lists, by
 * the same fields: a byline that disagreed with the team section would be two
 * descriptions of one person on one site.
 */
export const BLOG_AUTHORS: readonly BlogAuthor[] = aboutTeam.slice(0, 1).map((founder) => ({
  id: 'ofir',
  name: founder.name,
  role: founder.role,
  bio: founder.about,
  url: '/about',
}))

export type BlogAuthorId = 'ofir'

export interface BlogPost {
  /** The URL segment. Must equal the directory name under `app/(store)/blog/`. */
  slug: string
  title: string
  /** Used for the card, the meta description and the OG description. */
  description: string
  /** ISO date. Drives ordering and the `datePublished` in the JSON-LD. */
  publishedAt: string
  updatedAt?: string
  /** Minutes. Stated because a reader decides on it, so it must be honest. */
  readingMinutes: number
  category: BlogCategorySlug
  tags: readonly BlogTagSlug[]
  author: BlogAuthorId
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'how-coupons-work',
    title: 'איך עובד קופון בקניון אקספרס',
    description:
      'מה בדיוק קורה מרגע התשלום ועד הסריקה בבית העסק: מקדמה, שובר עם QR, יתרה במקום, תוקף, ומה קורה לכסף אם לא מימשתם.',
    publishedAt: '2026-08-10',
    readingMinutes: 4,
    category: 'guides',
    tags: ['coupons', 'guide', 'refunds'],
    author: 'ofir',
  },
  {
    slug: 'redeeming-your-voucher',
    title: 'איך מממשים שובר בבית העסק',
    description:
      'איפה השובר נמצא אחרי הרכישה, מה מראים בקופה, למה הוא נסרק פעם אחת בלבד, ומה עושים אם הטלפון נגמר או שהתוקף מתקרב.',
    publishedAt: '2026-09-14',
    readingMinutes: 3,
    category: 'guides',
    tags: ['coupons', 'redemption', 'guide'],
    author: 'ofir',
  },
  {
    slug: 'for-businesses-how-a-deal-works',
    title: 'לבתי עסק: מה קורה מהרגע שהדיל עולה ועד התשלום',
    description:
      'הצד של בית העסק: איך נקבע הדיל, מה הלקוח משלם כאן ומה אצלכם, איך סורקים, מתי הכסף מגיע ומה רואים באזור הספקים.',
    publishedAt: '2026-10-01',
    readingMinutes: 4,
    category: 'businesses',
    tags: ['businesses', 'payouts', 'redemption'],
    author: 'ofir',
  },
] as const

/** Newest first. The order the index and the sitemap both use. */
export function sortedPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function findPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null
}

export function findCategory(slug: string): BlogCategory | null {
  return BLOG_CATEGORIES.find((category) => category.slug === slug) ?? null
}

export function findTag(slug: string): BlogTag | null {
  return BLOG_TAGS.find((tag) => tag.slug === slug) ?? null
}

export function findAuthor(id: string): BlogAuthor | null {
  return BLOG_AUTHORS.find((author) => author.id === id) ?? null
}

/** The posts of one category, newest first. */
export function postsInCategory(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return sortedPosts(posts.filter((post) => post.category === slug))
}

/** The posts carrying one tag, newest first. */
export function postsWithTag(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return sortedPosts(posts.filter((post) => (post.tags as readonly string[]).includes(slug)))
}

/**
 * The tags that have at least one post, in registry order.
 *
 * The index renders this and not `BLOG_TAGS`: a registered tag with no post
 * yet would be a chip leading to an empty page, and the sitemap would list it.
 */
export function tagsInUse(posts: readonly BlogPost[] = BLOG_POSTS): BlogTag[] {
  const used = new Set(posts.flatMap((post) => post.tags))
  return BLOG_TAGS.filter((tag) => used.has(tag.slug))
}

/** Same rule for categories: only the ones with a post are linked. */
export function categoriesInUse(posts: readonly BlogPost[] = BLOG_POSTS): BlogCategory[] {
  const used = new Set(posts.map((post) => post.category))
  return BLOG_CATEGORIES.filter((category) => used.has(category.slug))
}

/**
 * What to read next, after one post.
 *
 * Scored, not random and not "the newest three": two shared tags outrank one,
 * one shared tag outranks the same category alone, and a tie goes to the
 * newer post. When fewer than `limit` posts score at all, the newest
 * unrelated ones fill the list, because a reader at the foot of a post is a
 * reader who finished it, and "nothing else" is a worse answer than the
 * newest post on the site. The post itself is never in its own list.
 */
export function relatedPosts(
  slug: string,
  limit = 3,
  posts: readonly BlogPost[] = BLOG_POSTS,
): BlogPost[] {
  const current = posts.find((post) => post.slug === slug)
  if (!current) return []
  const currentTags = new Set<string>(current.tags)

  const scored = posts
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const sharedTags = post.tags.filter((tag) => currentTags.has(tag)).length
      const sameCategory = post.category === current.category ? 1 : 0
      return { post, score: sharedTags * 2 + sameCategory }
    })
    .sort((a, b) => b.score - a.score || b.post.publishedAt.localeCompare(a.post.publishedAt))

  return scored.slice(0, limit).map((entry) => entry.post)
}

/**
 * The post as the JSON-LD builders take it: the registry's ids resolved to
 * the printed names, so the `Person`, `articleSection` and `keywords` Google
 * reads are the byline, the breadcrumb and the chips the reader sees.
 */
export function jsonLdPost(post: BlogPost): BlogPostLike {
  const author = findAuthor(post.author)
  const category = findCategory(post.category)
  return {
    slug: post.slug,
    title: post.title,
    description: post.description,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    byline: author ? { name: author.name, url: author.url } : undefined,
    articleSection: category?.name,
    keywords: post.tags
      .map(findTag)
      .filter((tag) => tag !== null)
      .map((tag) => tag.label),
  }
}

/** `10 באוגוסט 2026`, the way every date on the site is printed. */
export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export const BLOG_FEED_PATH = '/blog/feed.xml'
export const BLOG_FEED_TITLE = 'הבלוג של קניון אקספרס'
