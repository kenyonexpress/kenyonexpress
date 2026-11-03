import type { Metadata } from 'next'

/**
 * The Open Graph + Twitter card pair for a page, built in one place.
 *
 * Two Next 16 merge rules make writing these by hand a trap:
 *
 *   - A page-level `openGraph` REPLACES the resolved block, images included,
 *     so the root `app/opengraph-image.tsx` card disappears from that page
 *     unless the page names it again. Only a segment with its own card file
 *     (today `/product/[slug]`) gets one filled in.
 *   - `twitter` is not merged from the root with the page's title: a page that
 *     sets none shows the site-wide title in an X/Twitter card.
 *
 * So pages pass title, description and path, and this claims the root card
 * (`/opengraph-image`, which answers 200 without the hash query) unless the
 * segment owns a card file.
 */
export const ROOT_CARD = '/opengraph-image'

export function socialMetadata(input: {
  title: string
  description: string
  path: string
  /** The segment has its own opengraph-image file; leave `images` unset. */
  ownCard?: boolean
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const { title, description, path, ownCard = false } = input
  const images = ownCard ? undefined : [{ url: ROOT_CARD, width: 1200, height: 630 }]
  return {
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      locale: 'he_IL',
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(images ? { images: [ROOT_CARD] } : {}),
    },
  }
}
