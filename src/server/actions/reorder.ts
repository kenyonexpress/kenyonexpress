'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { getOrderDetail } from '@/server/queries/orders'
import { addToCart } from './cart'

/**
 * Add all items from a previous order to the current cart.
 *
 * Validates the order belongs to the signed-in user and that all products
 * are available. Returns success even if some items fail to add (e.g.,
 * deleted products).
 */
type ReorderResult = {
  success: boolean
  addedCount: number
  failedCount: number
  errors: string[]
}

async function runReorderFromOrder(orderId: string): Promise<ReorderResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      success: false,
      addedCount: 0,
      failedCount: 0,
      errors: ['יש להתחבר כדי להזמין שוב'],
    }
  }

  const order = await getOrderDetail(orderId)
  if (!order) {
    return {
      success: false,
      addedCount: 0,
      failedCount: 0,
      errors: ['ההזמנה לא נמצאה'],
    }
  }

  const errors: string[] = []
  let addedCount = 0
  let failedCount = 0

  for (const line of order.lines) {
    if (!line.productId) {
      failedCount++
      errors.push(`${line.productName}: המוצר אינו זמין`)
      continue
    }

    try {
      const result = await addToCart(line.productId, null, line.quantity)
      if (result.ok) {
        addedCount++
      } else {
        failedCount++
        errors.push(`${line.productName}: ${result.error || 'שגיאה בהוספה'}`)
      }
    } catch (_err) {
      failedCount++
      errors.push(`${line.productName}: שגיאה בהוספה`)
    }
  }

  return {
    success: addedCount > 0,
    addedCount,
    failedCount,
    errors: errors.slice(0, 3), // Limit to first 3 errors
  }
}

export async function reorderFromOrder(orderId: string): Promise<ReorderResult> {
  return withActionContext('account.reorder', () => runReorderFromOrder(orderId))
}
