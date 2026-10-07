import type { Metadata } from 'next'

/**
 * The head tags every indexable page owes a crawler, built in one place.
 *
 * WHY ONE HELPER AND NOT A PATTERN. Before this file, nineteen public pages
 * each wrote their own `alternates` and `openGraph` blocks, and the survey
 * that preceded it found three shapes in the wild: pages with a canonical and
 * nothing else (`/about`, `/faq`, the four legal documents), pages with a
 * canonical and an `openGraph` that lost the site name (`/category/[slug]`,
 * `/s/[id]`), and pages with neither (`/products`, `/coupons`). None carried
 * hreflang, and none set a Twitter card, so a product link pasted anywhere
 * that reads `twitter:*` first fell back to whatever the root layout said
 * about the home page.
 *
 * THE MERGE RULE THAT CAUSED THE SECOND SHAPE. Next merges `metadata` by
 * top-level key, not deeply: a page that sets `openGraph: { title }` replaces
 * the root layout's whole `openGraph`, including `siteName` and `locale`. So a
 * page either repeats the site-wide fields or loses them, and repeating them
 * by hand is how they drift. Here they are repeated once.
 *
 * HREFLANG ON A SINGLE-LANGUAGE SITE. `docs/ARCHITECTURE-SEO.md` §5.1 asks
 * for an explicit `he-IL` plus `x-default`, both pointing at the canonical,
 * so Google is told the market rather than left to infer it from `lang="he"`.
 * When a second locale arrives, `languages` grows a key; nothing else moves.
 *
 * WHICH IMAGE. The root card by default (see `ROOT_OG_IMAGE` for why it has
 * to be named rather than inherited), a page's own `image` when it passes
 * one, and NOTHING when `ownCard` is set: a segment with its own
 * `opengraph-image.tsx` gets that file only if metadata claims no image, and
 * the product page was measured losing its generated price card to a 600x600
 * catalogue photo the moment metadata named one (see the comment in
 * `product/[slug]/page.tsx`).
 */

export const SITE_NAME = 'קניון אקספרס'
export const OG_LOCALE = 'he_IL'
export const HREFLANG = 'he-IL'

/**
 * The site card, `app/opengraph-image.tsx`, named by its route.
 *
 * MEASURED, AND THE OPPOSITE OF WHAT THE FILE CONVENTION PROMISES. Next merges
 * a segment's `opengraph-image` file into the resolved metadata AT THAT
 * SEGMENT, and a page that then sets `openGraph` of its own replaces the whole
 * resolved block, images included (`mergeMetadata` in
 * next/dist/lib/metadata/resolve-metadata.js). So every page that wrote an
 * `openGraph` title lost the root card: the first served audit found
 * `og:image` on the product page alone, because that is the one segment with
 * a card file of its own. The root card is therefore claimed here by URL.
 * The route answers without the cache-busting query Next appends, and the
 * image changes with the code, so a stale copy on a scraper is a design
 * change late, not a wrong card.
 */
export const ROOT_OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'קניון אקספרס — קופונים ומבצעים',
} as const

export interface PublicPageMetadataInput {
  title: string
  description: string
  /** Site-relative canonical path, e.g. `/product/x`. Query strings are dropped. */
  path: string
  /** `article` for blog posts; everything else is a `website`. */
  type?: 'website' | 'article'
  /** Site-relative or absolute. Only when the site card is wrong for this page. */
  image?: string
  /**
   * The segment has an `opengraph-image.tsx` of its own (today: `/product/[slug]`).
   * Claim nothing, so Next fills `og:image` and `twitter:image` from that file;
   * claiming any image here, even the root card, would hide it.
   */
  ownCard?: boolean
  /** ISO date; `article` only. */
  publishedTime?: string
  /** ISO date; `article` only. */
  modifiedTime?: string
}

/**
 * `alternates` for a path: the canonical and the hreflang pair that points at it.
 *
 * The path is normalised to its pathname. A canonical that carries `?sort=` or
 * `#top` is a canonical to a filtered view, and the point of the tag is to
 * collapse those onto the bare page.
 */
export function hreflangAlternates(path: string): NonNullable<Metadata['alternates']> {
  const canonical = canonicalPath(path)
  return {
    canonical,
    languages: {
      [HREFLANG]: canonical,
      'x-default': canonical,
    },
  }
}

/** The pathname of a site-relative path: no query, no fragment, one leading slash. */
export function canonicalPath(path: string): string {
  const trimmed = path.trim()
  const cut = trimmed.split(/[?#]/, 1)[0] ?? ''
  const withSlash = cut.startsWith('/') ? cut : `/${cut}`
  // `/` stays `/`; everything else loses a trailing slash so one page has one
  // address (next.config sets trailingSlash: false, and the two must agree).
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

/** The full `Metadata` of an indexable page. */
export function publicPageMetadata(input: PublicPageMetadataInput): Metadata {
  const path = canonicalPath(input.path)
  const type = input.type ?? 'website'
  const images = input.ownCard ? undefined : [input.image ?? ROOT_OG_IMAGE]

  const openGraph: NonNullable<Metadata['openGraph']> =
    type === 'article'
      ? {
          type: 'article',
          siteName: SITE_NAME,
          locale: OG_LOCALE,
          title: input.title,
          description: input.description,
          url: path,
          ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
          ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
          ...(images ? { images } : {}),
        }
      : {
          type: 'website',
          siteName: SITE_NAME,
          locale: OG_LOCALE,
          title: input.title,
          description: input.description,
          url: path,
          ...(images ? { images } : {}),
        }

  return {
    title: input.title,
    description: input.description,
    alternates: hreflangAlternates(path),
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(images ? { images } : {}),
    },
  }
}

/**
 * The sitemap half of the hreflang pair: `alternates.languages` for one
 * absolute URL, pointing at itself under `he-IL` and `x-default`.
 */
export function sitemapLanguages(url: string): { languages: Record<string, string> } {
  return { languages: { [HREFLANG]: url, 'x-default': url } }
}
