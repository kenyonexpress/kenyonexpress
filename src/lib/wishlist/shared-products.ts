import { orFail } from '@/lib/catalogue-read'
import { createPublicClient } from '@/lib/supabase/anon'

export interface SharedWishlistProduct {
  id: string
  name_he: string | null
  slug: string | null
  price_ils: number | null
  stock_quantity: number | null
  images: unknown
}

/**
 * Catalogue rows for a shared wishlist snapshot.
 *
 * ANON CLIENT, same as every other public product read: the token proved the
 * ids, not a right to see drafts. RLS on `products` already hides non-active
 * and soft-deleted rows from this key, so a delisted product simply drops out
 * of the list rather than 404ing the whole page.
 *
 * ORDER FOLLOWS THE TOKEN, not `created_at`. The share is a snapshot of ids,
 * not of the owner's current sort, and the token is already sorted for
 * signature stability.
 */
export async function loadSharedWishlistProducts(
  productIds: readonly string[],
): Promise<SharedWishlistProduct[]> {
  if (productIds.length === 0) return []
  const ids = [...new Set(productIds)]
  const rows = orFail(
    await createPublicClient()
      .from('products')
      .select('id, name_he, slug, price_ils, stock_quantity, images')
      .in('id', ids),
    'wishlist.share_products_failed',
    { productCount: ids.length },
  ) as SharedWishlistProduct[] | null

  const byId = new Map((rows ?? []).map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}
