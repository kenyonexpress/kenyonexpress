import { createClient } from '@/lib/supabase/server'

/**
 * Get the count of order_items for a product in the last 30 days.
 * Used to display "X people bought this recently" social proof.
 */
export async function getProductPurchaseCount(productId: string): Promise<number> {
  const supabase = await createClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count, error } = await supabase
    .from('order_items')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (error) {
    console.error('[getProductPurchaseCount] Error fetching count:', error)
    return 0
  }

  return count ?? 0
}
