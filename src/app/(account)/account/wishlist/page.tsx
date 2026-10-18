import { getMyWishlist } from '@/server/queries/wishlist'
import Link from 'next/link'
import WishlistPageClient from './wishlist-client'

export const metadata = { title: 'רשימת המשאלות שלי' }

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
        <WishlistPageClient initialEntries={entries} />
      )}
    </>
  )
}
