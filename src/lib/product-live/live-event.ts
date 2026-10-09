/**
 * The live half of a product page, as pure data.
 *
 * `loadProductBySlug` is `'use cache'` for an hour, and everything the page
 * paints comes from that entry. The one field that moves inside the hour is
 * availability (`finalize.ts` decrements stock on every sale and deliberately
 * leaves the catalogue tag alone). Migration 235 broadcasts the post-update
 * row to the public topic `product:<id>` through `realtime.send`, and this
 * module is the client-side contract for that payload: what a message must
 * look like to be believed, and how it overrides the cached values.
 *
 * PURE ON PURPOSE. The hook (`use-product-live.ts`) owns the socket; this file
 * owns the decisions, so the decisions are testable without one. A payload
 * that fails the shape check is ignored rather than partially applied -- a
 * half-trusted message that sets the price and not the stock is worse than a
 * stale page.
 */

export interface ProductLiveEvent {
  productId: string
  /** The shelf level after the update. Null when the product is untracked. */
  stockQuantity: number | null
  /** Level minus live reservations, as `available_stock` computes it. */
  available: number | null
  kenyonPrice: number | null
  fullPrice: number | null
  status: string
  deletedAt: string | null
}

/** The topic 235 broadcasts on. One place, so the hook and the script agree. */
export function productLiveTopic(productId: string): string {
  return `product:${productId}`
}

/** The event name 235 sends. */
export const PRODUCT_LIVE_EVENT = 'live'

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  // numeric columns arrive as strings through jsonb in some drivers.
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

/**
 * The payload as the trigger builds it, or null.
 *
 * Every field the page acts on must be present with the right type; a missing
 * `stock_quantity` is not "unknown", it is "not our message".
 */
export function parseProductLiveEvent(raw: unknown): ProductLiveEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>

  if (typeof p.product_id !== 'string' || p.product_id.length === 0) return null
  if (typeof p.status !== 'string') return null
  if (!('stock_quantity' in p) || !('kenyon_price' in p)) return null

  const stockQuantity = optionalNumber(p.stock_quantity)
  const available = optionalNumber(p.available)
  const kenyonPrice = optionalNumber(p.kenyon_price)
  const fullPrice = optionalNumber(p.full_price)
  if (stockQuantity === undefined || kenyonPrice === undefined) return null

  const deletedAt = p.deleted_at
  if (deletedAt !== null && deletedAt !== undefined && typeof deletedAt !== 'string') return null

  return {
    productId: p.product_id,
    stockQuantity,
    available: available === undefined ? null : available,
    kenyonPrice,
    fullPrice: fullPrice === undefined ? null : fullPrice,
    status: p.status,
    deletedAt: typeof deletedAt === 'string' ? deletedAt : null,
  }
}

export interface ProductLiveState {
  /**
   * The level to size the buy row by. `available` when the trigger could
   * compute it (it subtracts live holds), else the raw shelf level.
   */
  stock: number | null
  price: number
  oldPrice: number | null
  /** False once the product is withdrawn: inactive or soft-deleted. */
  onSale: boolean
  /** True after the first accepted event; lets the UI say "updated". */
  live: boolean
}

export function initialProductLiveState(base: {
  stock: number | null
  price: number
  oldPrice: number | null
}): ProductLiveState {
  return {
    stock: base.stock,
    price: base.price,
    oldPrice: base.oldPrice,
    onSale: true,
    live: false,
  }
}

/**
 * Fold one accepted event into the state.
 *
 * A message for another product is ignored outright, not just filtered by
 * the channel name: the topic is a string the client chose, and a mismatched
 * id is the one signal that the two disagree.
 */
export function applyProductLiveEvent(
  state: ProductLiveState,
  event: ProductLiveEvent,
  productId: string,
): ProductLiveState {
  if (event.productId !== productId) return state

  // A price that comes back null or zero is not "free", it is a row being
  // edited; keep the last known price rather than painting ₪0 under a buy
  // button `beginCheckout` would refuse.
  const price = event.kenyonPrice != null && event.kenyonPrice > 0 ? event.kenyonPrice : state.price
  const oldPrice = event.fullPrice != null && event.fullPrice > price ? event.fullPrice : null

  return {
    stock: event.available ?? event.stockQuantity,
    price,
    oldPrice,
    onSale: event.status === 'active' && event.deletedAt === null,
    live: true,
  }
}
