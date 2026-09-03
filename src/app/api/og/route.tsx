import {
  categoryMetaDescription,
  collectionRule,
  getCategoryBySlug,
  getCategoryProductsCached,
} from '@/lib/category-page'
import { getCouponDeal } from '@/lib/coupon-deals'
import { loadProductBySlug } from '@/lib/product-detail'
import { ImageResponse } from 'next/og'
import { buildCategoryCard, buildDealCard, buildOgCard } from './cards'
import { heebo } from './fonts'
import { type ImageTile, imageTile, logoTile, siteHost } from './image'
import { type OgRequest, parseOgRequest } from './params'
import {
  CategoryTemplate,
  type Chrome,
  DealTemplate,
  DefaultTemplate,
  OG_SIZE,
  ProductTemplate,
} from './templates'

/**
 * `/api/og`: the dynamic share card for a product, a category, a deal, or the
 * site itself.
 *
 * WHY A ROUTE AND NOT FOUR MORE `opengraph-image.tsx` FILES. The file
 * convention binds a card to a route segment and gives it no URL, which is
 * exactly wrong for the three cases here: a category and a coupon deal both
 * want a card that `generateMetadata` can NAME (their metadata already sets
 * `openGraph`, and a page that claims the field wins against the file
 * convention. See the note in `src/app/og-fonts.test.ts`, which pins that
 * lesson on the product page), and the default card has no segment of its own
 * at all.
 *
 * `next/og`, not a separate `@vercel/og` install. `next/og` IS `@vercel/og`:
 * `node_modules/next/og.js` re-exports `dist/server/og/image-response`, whose
 * `ImageResponse` is declared as `ConstructorParameters<OgModule['ImageResponse']>`
 * over `next/dist/compiled/@vercel/og`. Adding the package separately would put
 * a second satori and a second resvg (several megabytes of wasm) into the
 * bundle, on a version nothing pins against next's.
 *
 * NODE RUNTIME, NOT EDGE, and both halves of the card need it: the Heebo faces
 * are read off disk with `node:fs`, and every image in this catalogue is WebP
 * or AVIF and has to go through sharp before Satori will look at it. It is NOT
 * declared: `export const runtime` fails the build outright under
 * `cacheComponents` ("Route segment config \"runtime\" is not compatible"),
 * measured here on the first `next build`. Node is the default and the two
 * imports above are what actually pin it. If either ever leaves, nothing will
 * say so, which is why they are named here.
 *
 * NOTHING HERE THROWS. Every load is guarded and every failure ends at the
 * default card. A share image is fetched by WhatsApp, by Facebook and by
 * iMessage while a real person waits on a real link; a 500 is a grey box beside
 * that link, and a grey box reads as a broken site rather than as a stale URL.
 */

/**
 * The card's CDN lifetime, by template.
 *
 * The deal card states a duration ("מסתיים בעוד יומיים") and a PNG cannot
 * count down, so the number is only as true as the cache entry is young. Five
 * minutes is short enough that the smallest unit the countdown prints (a
 * minute, and only in the last hour) is never badly stale, and long enough that
 * a link doing the rounds does not re-render per recipient.
 *
 * The other three describe catalogue rows, which are `cacheLife('hours')` at
 * the source. Matching that here is the honest number.
 */
const MAX_AGE_SECONDS = { deal: 300, other: 3600 }

function cacheHeaders(template: OgRequest['template']): HeadersInit {
  const sMaxAge = template === 'deal' ? MAX_AGE_SECONDS.deal : MAX_AGE_SECONDS.other
  return {
    'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}`,
  }
}

export async function GET(request: Request) {
  const target = parseOgRequest(new URL(request.url))
  const [fonts, logo] = await Promise.all([heebo(), logoTile()])
  const chrome: Chrome = { logo, host: siteHost() }

  const element = await render(target, chrome).catch(() => <DefaultTemplate chrome={chrome} />)

  return new ImageResponse(element, { ...OG_SIZE, fonts, headers: cacheHeaders(target.template) })
}

async function render(target: OgRequest, chrome: Chrome) {
  if (target.template === 'product' && target.slug) return productCard(target.slug, chrome)
  if (target.template === 'category' && target.slug) return categoryCard(target.slug, chrome)
  if (target.template === 'deal' && target.id) return dealCard(target.id, chrome)
  return <DefaultTemplate chrome={chrome} />
}

// ---------------------------------------------------------------------------

/**
 * The photo is drawn at 280 and the thumbnails at 128, so those are the pixel
 * boxes sharp is asked for. Decoding a 600x600 source to a tile larger than the
 * card draws would only make the base64 that Satori inlines bigger.
 */
const PHOTO_BOX = 280
const DEAL_PHOTO_BOX = 260
const THUMB_BOX = 128
const MAX_THUMBS = 3

async function productCard(slug: string, chrome: Chrome) {
  const data = await loadProductBySlug(slug)
  // A slug nobody has still gets a card. The link may be stale but it is being
  // shared right now, and a broken preview beside it reads worse than a brand
  // card that at least says whose link it is.
  if (!data) return <DefaultTemplate chrome={chrome} />

  const card = buildOgCard({
    name: data.product.name_he ?? 'דיל',
    supplierName: data.supplier?.name ?? null,
    priceIls: Number(data.product.kenyon_price ?? 0) || null,
    offer: data.couponOffer,
  })
  const photo = await imageTile(data.images[0], PHOTO_BOX)

  return <ProductTemplate card={card} photo={photo} chrome={chrome} />
}

async function categoryCard(slug: string, chrome: Chrome) {
  const category = await getCategoryBySlug(slug)
  if (!category) return <DefaultTemplate chrome={chrome} />

  /*
   * The SAME cached read the category page makes on its own first page, with
   * the same arguments. `menu_order` is what `parseSort` returns for a request
   * with no `?sort`, and page 1 is where a shared link lands. So a card and the
   * page it is a card FOR share one cache entry rather than minting a second.
   */
  const listing = await getCategoryProductsCached({
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort: 'menu_order',
    page: 1,
    collection: collectionRule(category.slug),
  }).catch(() => ({ items: [], total: 0 }))

  const card = buildCategoryCard({
    nameHe: category.name_he,
    // Almost no category row carries `description_he` (`/category/hot-deals`,
    // the one linked from the home page, is one of them) and the page's own
    // metadata falls back to this exact sentence. The card says what the
    // description says.
    description: category.description_he?.trim() || categoryMetaDescription(category.name_he),
    total: listing.total,
  })

  const thumbs = (
    await Promise.all(
      listing.items
        .slice(0, MAX_THUMBS)
        .map((item) => imageTile(firstImage(item.images), THUMB_BOX)),
    )
  ).filter((tile): tile is ImageTile => tile !== null)

  return <CategoryTemplate card={card} thumbs={thumbs} chrome={chrome} />
}

async function dealCard(id: string, chrome: Chrome) {
  // `getCouponDeal` reads with `.single()` behind `orFail`, so an id that
  // matches no active row THROWS rather than returning null. Caught here and
  // answered with the brand card, which is what a deal that ended should look
  // like when its link is forwarded a week later.
  const deal = await getCouponDeal(id).catch(() => null)
  if (!deal) return <DefaultTemplate chrome={chrome} />

  const card = buildDealCard({
    titleHe: deal.title_he,
    businessName: deal.business_name,
    originalPrice: deal.original_price,
    platformPrice: deal.platform_price,
    discountPercentage: deal.discount_percentage,
    validUntil: deal.valid_until,
  })
  const photo = await imageTile(deal.image_url, DEAL_PHOTO_BOX)

  return <DealTemplate card={card} photo={photo} chrome={chrome} />
}

/**
 * `products.images` is a jsonb column with no shape guarantee, read here the
 * same way `product-detail.ts` reads it: filtered to strings rather than cast.
 */
function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((value): value is string => typeof value === 'string' && !!value.trim())
  return first ?? null
}
