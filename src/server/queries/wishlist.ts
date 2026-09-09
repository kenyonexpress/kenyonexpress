import { log } from '@/lib/observability/log'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'

/**
 * Wishlist reads, always on the user client: RLS (154, re-cut by 185) is the
 * boundary, and the auth check here only shapes the signed-out answer.
 *
 * ROWS WHOSE PRODUCT IS NOT SELLABLE ARE DROPPED ON READ, not on write.
 * A product can be delisted, drafted or soft-deleted long after it was saved,
 * and the wishlist row survives all three -- the FK only fires on a hard
 * delete. Pruning on read is what keeps a stale save from rendering a card
 * that links to a 404 and offers a buy button that cannot work.
 *
 * The embedded select does the filtering itself: PostgREST returns `product:
 * null` for a row whose join found nothing, and `products` has its own RLS
 * hiding non-active and soft-deleted rows from a customer. So an unsellable
 * product arrives here as a null embed and is dropped, without this file
 * needing to restate the catalogue's own visibility rules.
 */

export interface WishlistEntry {
  product_id: string
  created_at: string
  product: {
    name_he: string | null
    slug: string | null
    price_ils: number | null
    stock_quantity: number | null
    images: unknown
  }
}

interface RawWishlistRow {
  product_id: string
  created_at: string
  product: WishlistEntry['product'] | null
}

export async function getMyWishlist(): Promise<WishlistEntry[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('wishlists' as never)
    .select(
      'product_id, created_at, product:products(name_he, slug, price_ils, stock_quantity, images)',
    )
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('wishlist.read_failed', { code: error.code ?? null })
    }
    return []
  }

  const rows = (data ?? []) as unknown as RawWishlistRow[]
  return rows
    .filter((row): row is RawWishlistRow & { product: WishlistEntry['product'] } => {
      return row.product != null
    })
    .map((row) => ({
      product_id: row.product_id,
      created_at: row.created_at,
      product: row.product,
    }))
}

/** Which of `productIds` the signed-in user has saved. Empty when signed out. */
export async function getMyWishlistMarks(productIds: readonly string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Set()

  const { data, error } = await supabase
    .from('wishlists' as never)
    .select('product_id')
    .in('product_id', productIds as string[])
  if (error) return new Set()
  return new Set((data as unknown as { product_id: string }[]).map((row) => row.product_id))
}
