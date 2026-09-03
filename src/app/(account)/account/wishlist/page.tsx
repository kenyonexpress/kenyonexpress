import { getMyWishlist } from '@/server/queries/wishlist'
import Link from 'next/link'

export const metadata = { title: 'רשימת המשאלות שלי' }

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string')
  return first ?? null
}

/**
 * The saved-products list the masthead heart points at. Reads on the user
 * client (RLS owns the boundary) and renders an empty state both for "nothing
 * saved" and for "table not applied yet" -- the second resolves the moment
 * pending/154 lands, with no code change here.
 */
export default async function WishlistPage() {
  const entries = await getMyWishlist()

  return (
    <>
      <h1 className="account-title">רשימת המשאלות שלי</h1>
      {entries.length === 0 ? (
        <p className="text-muted">
          עוד לא שמרת מוצרים. לחיצה על הלב בעמוד מוצר שומרת אותו כאן.{' '}
          <Link href="/products" className="font-semibold text-price underline">
            לכל המוצרים
          </Link>
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => {
            const image = firstImage(entry.product?.images)
            const name = entry.product?.name_he ?? 'מוצר'
            const href = entry.product?.slug ? `/product/${entry.product.slug}` : null
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
                  {entry.product?.price_ils != null ? (
                    <span className="block text-sm text-price">
                      ₪{entry.product.price_ils.toLocaleString('he-IL')}
                    </span>
                  ) : null}
                </span>
              </span>
            )
            return (
              <li key={entry.product_id} className="rounded-lg border border-border-alt p-3">
                {href ? <Link href={href}>{body}</Link> : body}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
