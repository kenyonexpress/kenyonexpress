import { WishlistGridSkeleton } from '@/components/account/WishlistGridSkeleton'
import { getMyWishlist } from '@/server/queries/wishlist'
import Link from 'next/link'
import { Suspense } from 'react'
import WishlistPageClient from './wishlist-client'

export const metadata = { title: 'רשימת המשאלות שלי' }

async function WishlistContent() {
  const entries = await getMyWishlist()

  return (
    <>
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

export default function WishlistPage() {
  return (
    <>
      <h1 className="account-title">רשימת המשאלות שלי</h1>
      <Suspense fallback={<WishlistGridSkeleton count={4} />}>
        <WishlistContent />
      </Suspense>
    </>
  )
}
