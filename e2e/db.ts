import type { Database } from '@/types/database'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

/**
 * Service-role database access for the money-path specs.
 *
 * WHY A SPEC IS ALLOWED TO READ THE DATABASE AT ALL. Most of this suite asserts
 * what a shopper can see, and that is the right level for a UI gate. The
 * settlement specs cannot work that way: what a coupon purchase writes to
 * `order_items` and `vouchers` is the money record, it is never rendered, and a
 * page that renders the right voucher code over a wrong settlement row looks
 * identical to one that got both right. The assertion has to reach the row.
 *
 * READ ONLY, BY CONVENTION AND BY SHAPE. Every helper here selects. Fixtures
 * are created by `pnpm seed:test`, which owns the reserved UUID namespace and
 * is idempotent; a spec that wrote its own rows would leave them behind on a
 * failure, in a project whose CI database is shared with the local one.
 *
 * The service key is read from the environment only. `.env.local` is
 * deliberately NOT consulted: the key sitting there is not this project's (it
 * answers "Invalid API key"), so falling back to it would turn a missing-secret
 * skip into a confusing auth failure.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

/**
 * True when the specs that read rows can run. False is a SKIP, not a failure:
 * a contributor without the service key still gets the whole UI suite, and the
 * job that does have the key is the one that gates the money path.
 */
export function dbEnabled(): boolean {
  return Boolean(url && key)
}

let client: SupabaseClient<Database> | null = null

export function db(): SupabaseClient<Database> {
  if (!url || !key) {
    throw new Error('e2e/db: NEXT_PUBLIC_SUPABASE_URL and a service key are required')
  }
  if (!client) {
    client = createClient<Database>(url, key, { auth: { persistSession: false } })
  }
  return client
}

/** Fixture ids from scripts/seed-test-data.mjs, in the reserved namespace. */
export const FIXTURE_IDS = {
  supplier: 'f47ac10b-58cc-4372-a567-0e02b2c3d901',
  category: 'f47ac10b-58cc-4372-a567-0e02b2c3d902',
  couponProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d903',
  physicalProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d904',
} as const

export const FIXTURE_SLUGS = {
  coupon: 'e2e-test-coupon',
  physical: 'e2e-test-physical',
} as const

/**
 * The order a signed-in fixture customer most recently paid for, with the rows
 * that carry its settlement. Returns null when the customer has never paid,
 * which is a legitimate state on a database the paid-flow spec has not run
 * against yet.
 */
export async function latestPaidOrderFor(userEmail: string) {
  const supabase = db()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', userEmail)
    .maybeSingle()
  if (!profile) return null

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, paid_at, user_id')
    .eq('user_id', profile.id)
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!order) return null

  const { data: items } = await supabase
    .from('order_items')
    .select(
      'id, product_id, product_type, settlement_status, item_status, platform_percent, paid_on_site_agorot, commission_agorot, balance_due_agorot, face_value_agorot',
    )
    .eq('order_id', order.id)

  return { order, items: items ?? [] }
}

/** Every voucher issued against one order item, newest first. */
export async function vouchersForOrderItem(orderItemId: string) {
  const { data } = await db()
    .from('vouchers')
    .select('id, code, status, order_item_id')
    .eq('order_item_id', orderItemId)
  return data ?? []
}

/**
 * How many escrow holds exist for an order.
 *
 * This exists to assert ZERO. See e2e/coupon-settlement.spec.ts for why that is
 * the interesting number under the current model.
 */
export async function escrowHoldCountForOrder(orderId: string): Promise<number> {
  const { count } = await db()
    .from('escrow_holds')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
  return count ?? 0
}

/** The split percentages a product currently carries. */
export async function productSplit(productId: string) {
  const { data } = await db()
    .from('products')
    .select('id, slug, platform_percent, supplier_split_percent')
    .eq('id', productId)
    .maybeSingle()
  return data
}
