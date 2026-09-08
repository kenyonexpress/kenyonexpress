/**
 * The one place a page names an Open Graph image URL.
 *
 * `generateMetadata` sites import from here rather than writing the query
 * string themselves, because the query string is a CONTRACT with
 * `parseOgRequest` next door and a mistyped parameter fails the way this whole
 * route is built to avoid: silently, as a generic brand card where a product's
 * price should have been, with a 200 and a valid PNG in front of it.
 *
 * The returned path is site-relative. `src/app/layout.tsx` sets `metadataBase`,
 * so Next absolutises it into `og:image` for us, the same arrangement the
 * category page already uses for `openGraph.url`.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

export type OgImageTarget =
  | { template: 'product'; slug: string }
  | { template: 'category'; slug: string }
  | { template: 'deal'; id: string }
  | { template: 'default' }

export function ogImageUrl(target: OgImageTarget): string {
  const params = new URLSearchParams({ t: target.template })
  if (target.template === 'product' || target.template === 'category') {
    params.set('slug', target.slug)
  } else if (target.template === 'deal') {
    params.set('id', target.id)
  }
  return `/api/og?${params.toString()}`
}

/**
 * The whole `openGraph.images` entry, so a call site cannot supply the URL and
 * forget the dimensions.
 *
 * `width` and `height` are not decoration: WhatsApp and Facebook both decide
 * between a large card and a thumbnail from the declared size, and an
 * undeclared 1200x630 is fetched, measured and (often enough) shown small
 * anyway. That is the failure the product card was built for in the first
 * place, and it would be a shame to reintroduce it one field higher up.
 */
export function ogImage(target: OgImageTarget, alt: string) {
  return { url: ogImageUrl(target), ...OG_IMAGE_SIZE, alt } as const
}
