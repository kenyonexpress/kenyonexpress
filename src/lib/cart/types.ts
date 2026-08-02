export type CartStorageItem = {
  product_id: string
  variant_id: string | null
  quantity: number
}

export type CartViewItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  name_he: string
  slug: string
  image_url: string | null
  unit_price: number
  line_total: number
  type: 'physical' | 'coupon'
  available: boolean
  platform_fee: number
  supplier_due: number
  customer_pays_now: number
  balance_due_at_business: number
}

export type CartView = {
  id: string | null
  items: CartViewItem[]
  item_count: number
  subtotal: number
  platform_fee: number
  supplier_due: number
  balance_due_at_business: number
}

export const EMPTY_CART: CartView = {
  id: null,
  items: [],
  item_count: 0,
  subtotal: 0,
  platform_fee: 0,
  supplier_due: 0,
  balance_due_at_business: 0,
}

export type CartActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; error: string; code: string }
