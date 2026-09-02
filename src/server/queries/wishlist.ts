import { log } from '@/lib/observability/log'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'

/**
 * Wishlist reads, always on the user client: RLS (154, wishlists_owner_all)
 * is the boundary, the auth check here only shapes the signed-out answer.
 * Degrades to empty until pending/154 is applied (PGRST205).
 */

export interface WishlistEntry {
  product_id: string
  created_at: string
  product: {
    name_he: string | null
    slug: string | null
    price_ils: number | null
    images: unknown
  } | null
}

export async function getMyWishlist(): Promise<WishlistEntry[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('wishlists' as never)
    .select('product_id, created_at, product:products(name_he, slug, price_ils, images)')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code !== TABLE_MISSING) {
      log.warn('wishlist.read_failed', { code: error.code ?? null })
    }
    return []
  }
  return (data ?? []) as unknown as WishlistEntry[]
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
