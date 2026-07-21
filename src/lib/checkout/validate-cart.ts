import type { CartView } from '@/lib/cart/types'

export type CartValidationIssue = {
  code: 'EMPTY' | 'UNAVAILABLE' | 'MIXED_INVALID'
  message: string
  product_id?: string
}

export type CartValidationResult = {
  ok: boolean
  issues: CartValidationIssue[]
  hasPhysical: boolean
  hasCoupon: boolean
  requiresAddress: boolean
}

/**
 * Pure cart gate before beginCheckout. Prices are never trusted from the client;
 * availability flags come from server-built CartView.
 */
export function validateCartView(cart: CartView): CartValidationResult {
  const issues: CartValidationIssue[] = []

  if (cart.items.length === 0 || cart.item_count === 0) {
    issues.push({ code: 'EMPTY', message: 'העגלה ריקה' })
  }

  for (const item of cart.items) {
    if (!item.available) {
      issues.push({
        code: 'UNAVAILABLE',
        message: `המוצר "${item.name_he}" אינו זמין בכמות המבוקשת`,
        product_id: item.product_id,
      })
    }
  }

  const hasPhysical = cart.items.some((i) => i.type === 'physical')
  const hasCoupon = cart.items.some((i) => i.type === 'coupon')

  return {
    ok: issues.length === 0,
    issues,
    hasPhysical,
    hasCoupon,
    requiresAddress: hasPhysical,
  }
}
