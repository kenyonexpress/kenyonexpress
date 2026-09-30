import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import { isShareToken } from '@/lib/wishlist/share-token'
import { type SharedWishlistItem, getSharedWishlist } from '@/server/queries/wishlist'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

export const metadata: Metadata = {
  title: 'רשימת משאלות משותפת',
  // The URL is the secret. Indexing it would publish it.
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

/**
 * A friend's view of a shared wishlist (248). The token in the URL is the
 * whole authorisation: `fn_shared_wishlist` answers it for anon, returns the
 * saved products and nothing about the owner, and answers an unknown or
 * switched-off token with zero rows, so the page cannot tell those apart and
 * does not pretend to.
 *
 * The frame is static and the list streams: `params` is request-time data
 * and awaiting it in the page body would take the route out of the static
 * shell (the `cacheComponents` build error), the same reason the shop page
 * hands its search params down instead of resolving them at the top.
 */
export default function SharedWishlistPage({ params }: Props) {
  return (
    <div className="category-page mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 space-y-2">
        <p className="text-sm text-black/50">רשימת משאלות</p>
        <h1 className="text-2xl font-bold text-heading">מוצרים שמישהו שמר בשבילך</h1>
        <p className="text-sm text-black/60">
          הלב על כל מוצר שומר אותו גם ברשימה שלך, וכפתור הסל מוסיף אותו לסל שלך.
        </p>
      </header>

      <Suspense fallback={<CategoryGridSkeleton count={8} />}>
        <SharedList params={params} />
      </Suspense>

      <p className="mt-8 text-sm text-black/60">
        רוצים רשימה משלכם?{' '}
        <Link href="/wishlist" className="font-semibold text-price underline">
          לרשימת המשאלות שלי
        </Link>
      </p>
    </div>
  )
}

function toCard(item: SharedWishlistItem): CategoryProduct {
  return {
    id: item.product_id,
    slug: item.slug ?? '',
    name_he: item.name_he ?? 'מוצר',
    kenyon_price: item.kenyon_price ?? item.price_ils,
    full_price: item.full_price,
    images: item.images,
    stock_quantity: item.stock_quantity,
  }
}

async function SharedList({ params }: Props) {
  const { token } = await params
  if (!isShareToken(token)) notFound()

  const items = await getSharedWishlist(token)

  if (items === null) {
    return <p className="text-muted">שיתוף רשימות עוד לא פתוח. נסו שוב מאוחר יותר.</p>
  }
  if (items.length === 0) {
    return (
      <p className="text-muted">
        הרשימה ריקה, או שהקישור כבר לא פעיל. אפשר לבקש ממי ששלח אותו קישור חדש.
      </p>
    )
  }

  const cards = items.filter((item) => item.slug).map(toCard)
  return (
    <ul className="category-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((product) => (
        <li key={product.id}>
          <CategoryProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
