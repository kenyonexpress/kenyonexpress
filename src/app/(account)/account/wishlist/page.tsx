import WishlistItemActions from '@/components/wishlist/WishlistItemActions'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { getMyWishlist } from '@/server/queries/wishlist'
import Link from 'next/link'

export const metadata = {
  title: 'רשימת מועדפים',
  // A wishlist is browsing history. It is behind a session and behind RLS, so
  // nothing here is crawlable anyway, but the tag says so rather than relying
  // on the redirect to be the whole answer.
  robots: { index: false, follow: false },
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string')
  return first ?? null
}

/**
 * The saved-products list the masthead heart points at.
 *
 * Server-rendered from the user client (RLS owns the boundary) so the products
 * arrive with the first byte; the two per-row buttons are the only client
 * pieces. `getMyWishlist` already drops rows whose product is no longer
 * sellable, so nothing here has to re-state the catalogue's visibility rules.
 *
 * The empty state covers both "nothing saved" and a read that failed, and says
 * the same thing, because there is nothing useful a customer can do about the
 * difference.
 */
export default async function WishlistPage() {
  const entries = await getMyWishlist()

  return (
    <>
      <h1 className="account-title">רשימת מועדפים</h1>
      {entries.length === 0 ? (
        <p className="text-muted">
          עדיין אין מוצרים במועדפים. לחיצה על הלב בעמוד מוצר או על כרטיס מוצר שומרת אותו כאן.{' '}
          <Link href="/products" className="font-semibold text-price underline">
            להמשך קניות
          </Link>
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => {
            const image = firstImage(entry.product.images)
            const name = entry.product.name_he ?? 'מוצר'
            const href = entry.product.slug ? `/product/${entry.product.slug}` : null
            const price = entry.product.price_ils
            // Matches what `addToCart` will decide: no price is not sellable,
            // and a zero stock level is refused there too. The button says so
            // up front instead of letting the move fail.
            const canAddToCart = price != null && entry.product.stock_quantity !== 0
            const body = (
              <span className="flex items-center gap-3">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-16 w-16 rounded-lg bg-surface-hover" />
                )}
                <span>
                  <span className="block font-semibold">{name}</span>
                  {price != null ? (
                    <span className="block text-sm text-price">{shekelsFromIlsRounded(price)}</span>
                  ) : null}
                </span>
              </span>
            )
            return (
              <li key={entry.product_id} className="rounded-lg border border-border-alt p-3">
                {href ? <Link href={href}>{body}</Link> : body}
                <WishlistItemActions
                  productId={entry.product_id}
                  productName={name}
                  canAddToCart={canAddToCart}
                />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
