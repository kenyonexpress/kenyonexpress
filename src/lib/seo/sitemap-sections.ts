import { sortedPosts } from '@/content/blog'
import { LEGAL_PAGE_SLUGS, getLegalPage } from '@/content/legal'
import { REGIONS, regionHref } from '@/lib/regions'

/**
 * The sitemap, as an INDEX over five files split by type, and the pure half of
 * building them.
 *
 * WHY SPLIT AT ALL, GIVEN 44 ACTIVE PRODUCTS. Not size. Google's per-file cap
 * is 50,000 URLs and this catalogue emits around a hundred, so a single file
 * will not overflow for years. The reason is that Search Console reports
 * coverage PER SUBMITTED SITEMAP: "how many of my product pages are indexed,
 * and how many of my category pages" is a question one mixed file cannot answer
 * at all, and it is the question that tells you whether an indexing problem is
 * in the catalogue or in the navigation. Splitting is what turns the sitemap
 * from a submission into an instrument.
 *
 * WHAT THE SPLIT REVEALED. `/city/<region>` was in NO sitemap. Seventeen region
 * pages, prerendered by `generateStaticParams`, each with its own canonical and
 * its own `BreadcrumbList`, linked from the header's region menu -- and not one
 * of them was ever submitted, because `app/sitemap.ts` listed static entries,
 * categories, products and suppliers and nobody added a fifth list when the
 * route was built. A file that enumerates four kinds of thing gives no signal
 * when a fifth kind appears; five named sections that each answer "what is in
 * me" do.
 *
 * THIS MODULE IS PURE. No database, no `next/cache`, no request. Every function
 * takes rows and returns entries, which is why `sitemap-sections.test.ts` can
 * assert the exact URLs emitted rather than grepping the source for `${base}`
 * -- which is what the previous test had to do, and it says so in its own
 * comment: `sitemap.ts` was a `use cache` default export that a test could not
 * import. The reads live in `sitemap-data.ts`.
 */

export type SitemapChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never'

export type SitemapEntry = {
  url: string
  /** Omitted, not defaulted: see `newestTimestamp` on why a guessed date costs. */
  lastModified?: Date
  changeFrequency?: SitemapChangeFrequency
  priority?: number
}

/**
 * The five files, in the order the index lists them.
 *
 * Ordered most to least important, which is the order a person reading the
 * index in Search Console wants them and costs a crawler nothing.
 */
export const SITEMAP_SECTIONS = [
  'content',
  'categories',
  'products',
  'regions',
  'suppliers',
] as const

export type SitemapSection = (typeof SITEMAP_SECTIONS)[number]

/** Where a section's file is served. Written once so nothing can disagree. */
export function sectionPath(section: SitemapSection): string {
  return `/sitemap/${section}.xml`
}

function trimBase(base: string): string {
  return base.replace(/\/+$/, '')
}

/**
 * XML text escaping.
 *
 * `&` first, or the escapes escape each other. A product slug is catalogue text
 * an operator typed -- production already holds slugs containing `₪` and one
 * that is a bare import number -- and an unescaped `&` in a `<loc>` is not a
 * cosmetic problem: it makes the whole file fail to parse, and Search Console
 * rejects a sitemap that does not parse in its entirety rather than skipping
 * the bad line.
 */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** W3C datetime, which is what the sitemap protocol asks for. */
function w3cDate(value: Date): string {
  return value.toISOString()
}

/** A `<urlset>` document over one section's entries. */
export function urlsetXml(entries: readonly SitemapEntry[]): string {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(entry.url)}</loc>`]
      if (entry.lastModified) parts.push(`    <lastmod>${w3cDate(entry.lastModified)}</lastmod>`)
      if (entry.changeFrequency) {
        parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`)
      }
      if (entry.priority !== undefined) parts.push(`    <priority>${entry.priority}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

/** The `<sitemapindex>` that `/sitemap.xml` serves. */
export function sitemapIndexXml(entries: readonly { loc: string; lastModified?: Date }[]): string {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(entry.loc)}</loc>`]
      if (entry.lastModified) parts.push(`    <lastmod>${w3cDate(entry.lastModified)}</lastmod>`)
      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
}

export type SlugRow = { slug: string | null; updated_at?: string | null }
export type IdRow = { id: string; updated_at?: string | null }

export function categorySitemapEntries(base: string, rows: readonly SlugRow[]): SitemapEntry[] {
  const site = trimBase(base)
  return rows
    .filter((row): row is SlugRow & { slug: string } => Boolean(row.slug))
    .map((row) => ({
      url: `${site}/category/${encodeURIComponent(row.slug)}`,
      ...(row.updated_at ? { lastModified: new Date(row.updated_at) } : {}),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))
}

export function productSitemapEntries(base: string, rows: readonly SlugRow[]): SitemapEntry[] {
  const site = trimBase(base)
  return rows
    .filter((row): row is SlugRow & { slug: string } => Boolean(row.slug))
    .map((row) => ({
      url: `${site}/product/${encodeURIComponent(row.slug)}`,
      ...(row.updated_at ? { lastModified: new Date(row.updated_at) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
}

export function supplierSitemapEntries(base: string, rows: readonly IdRow[]): SitemapEntry[] {
  const site = trimBase(base)
  return rows.map((row) => ({
    url: `${site}/s/${row.id}`,
    ...(row.updated_at ? { lastModified: new Date(row.updated_at) } : {}),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))
}

/**
 * The seventeen region pages, which no sitemap has ever carried.
 *
 * NO `lastModified`, for the reason `/contact` has none: a region page renders
 * a name from `regions.ts` and a list of municipalities from `geo/cities.ts`,
 * both of them source files. It changes when the code changes and there is no
 * signal here for that, so omitting the field says "I do not know" -- which is
 * true, and better than a date that is wrong on every fetch. `newestTimestamp`
 * has the full argument.
 *
 * `regionHref` does the percent-encoding, in one place, because these are
 * live's own Hebrew URLs and re-encoding them a second way here would submit
 * addresses that differ from the canonical the page itself declares.
 */
export function regionSitemapEntries(base: string): SitemapEntry[] {
  const site = trimBase(base)
  return REGIONS.map((region) => ({
    url: `${site}${regionHref(region)}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
}

/**
 * The hand-written pages: entry points, marketing, blog and legal.
 *
 * `catalogueTouched` is the newest row in the catalogue, and it is the lastmod
 * for the three pages whose CONTENT is the catalogue. Everything else either
 * carries a real date of its own (posts, legal documents) or carries none.
 */
/**
 * A page whose body the operator can edit, as sitemap input.
 *
 * `path` and not `slug`, because four of the five built-in pages render at an
 * address they already had - `/about`, not `/page/about`. The decision is made
 * once, in `contentPageHref`.
 */
export type ContentPageEntry = { path: string; updatedAt: string | null }

export function contentSitemapEntries(
  base: string,
  catalogueTouched: Date | undefined,
  /**
   * Published `content_pages` rows. Defaults to none, which is what a caller
   * that only wants the fixed pages gets - and what the site emits until
   * migration 205 is applied.
   */
  contentPages: readonly ContentPageEntry[] = [],
): SitemapEntry[] {
  const site = trimBase(base)

  /**
   * When the CMS knows a page was last edited, that beats the guess.
   *
   * The four fixed content entries below carried NO `lastModified` and said why:
   * "`/contact` changes when the code changes, and there is no signal here for
   * that". A `content_pages` row IS that signal, so once one exists the entry
   * stops saying "I do not know" and starts saying a date that is true. With no
   * row it keeps omitting it, which is still better than a date that is wrong
   * every time.
   */
  const edited = new Map(
    contentPages
      .filter((page) => page.updatedAt !== null)
      .map((page) => [page.path, new Date(page.updatedAt as string)] as const),
  )
  const lastEdited = (path: string) => edited.get(path)

  const fixed: SitemapEntry[] = [
    { url: `${site}/`, lastModified: catalogueTouched, changeFrequency: 'daily', priority: 1 },
    {
      url: `${site}/products`,
      lastModified: catalogueTouched,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${site}/coupons`,
      lastModified: catalogueTouched,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${site}/contact`,
      lastModified: lastEdited('/contact'),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${site}/faq`,
      lastModified: lastEdited('/faq'),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${site}/about`,
      lastModified: lastEdited('/about'),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Higher than the other content pages because it is the page a business
    // lands on, and a business is worth more than a session.
    {
      url: `${site}/suppliers`,
      lastModified: lastEdited('/suppliers'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    { url: `${site}/blog`, changeFrequency: 'weekly', priority: 0.6 },
    // Each post carries a real `publishedAt`, so unlike `/contact` there IS a
    // date worth publishing. Driven off the same registry the index renders, so
    // a post cannot be listed in one and missing from the other.
    ...sortedPosts().map((post) => ({
      url: `${site}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt ?? post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    // The legal pages DO carry a date, because they have one: `updatedAt` is a
    // field of the document, so unlike `/contact` there is a real signal to
    // publish. They are also the four addresses the old site already has
    // indexed, which is why they are listed rather than left to be found.
    ...LEGAL_PAGE_SLUGS.map((slug) => ({
      url: `${site}/${slug}`,
      lastModified: new Date(getLegalPage(slug).updatedAt),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]

  /**
   * Pages the operator created, minus the ones already listed above.
   *
   * DEDUPED BY PATH RATHER THAN APPENDED. `/about` is both a fixed entry and a
   * `content_pages` row bound to that address, and a sitemap that lists one URL
   * twice is a sitemap Search Console reports as containing errors - for a
   * reason that would look like nothing at all in the code that emits it.
   *
   * The fixed entries WIN, because they carry the priorities and change
   * frequencies that were chosen per page, and a generated entry would flatten
   * `/suppliers` back down to the default.
   */
  const listed = new Set(fixed.map((entry) => entry.url))
  const extra: SitemapEntry[] = contentPages
    .map((page) => ({
      url: `${site}${page.path}`,
      lastModified: page.updatedAt ? new Date(page.updatedAt) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))
    .filter((entry) => !listed.has(entry.url))

  return [...fixed, ...extra]
}
