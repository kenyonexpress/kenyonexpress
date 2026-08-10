/**
 * The post registry.
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
 */

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
  tags: readonly string[]
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'how-coupons-work',
    title: 'איך עובד קופון בקניון אקספרס',
    description:
      'מה בדיוק קורה מרגע התשלום ועד הסריקה בבית העסק: מקדמה, שובר עם QR, יתרה במקום, תוקף, ומה קורה לכסף אם לא מימשתם.',
    publishedAt: '2026-08-10',
    readingMinutes: 4,
    tags: ['קופונים', 'מדריך'],
  },
] as const

/** Newest first. The order the index and the sitemap both use. */
export function sortedPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function findPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null
}
