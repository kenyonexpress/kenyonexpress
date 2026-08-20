/**
 * The shape of a row in `public.notifications` (migration 088) as the browser
 * sees it.
 *
 * Hand-written rather than taken from `src/types/database.ts`: that file is
 * generated from production, `088` has not been applied, and a generated type
 * that does not yet exist cannot be imported. When the migration lands and the
 * types are regenerated, this becomes the place to delete.
 */

export type NotificationKind =
  | 'order_paid'
  | 'voucher_issued'
  | 'voucher_redeemed'
  | 'voucher_expiring'
  | 'supplier_sale'
  | (string & {})

export interface NotificationRow {
  id: string
  user_id: string | null
  supplier_id: string | null
  kind: NotificationKind
  title_he: string
  body_he: string | null
  href: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

/**
 * Whose bell this is.
 *
 * A supplier member has both: their own customer notifications and their
 * business's. The bell asks for one audience at a time because the two belong
 * to different screens — the storefront header and the supplier area — and
 * mixing a personal coupon reminder into a shop's order feed is how somebody
 * misses an order.
 */
export type NotificationAudience =
  | { scope: 'user'; userId: string }
  | { scope: 'supplier'; supplierId: string }

export interface NotificationFeed {
  rows: NotificationRow[]
  unread: number
  /** Null until the first load resolves; an error string after a failure. */
  error: string | null
  loading: boolean
}
