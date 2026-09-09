import 'server-only'

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { callPendingExpiryRpc, pendingExpiryRpc } from '@/lib/supabase/pending-expiry'
import { createClient } from '@/lib/supabase/server'
import { type SupplierExpiryCounts, toSupplierExpiryCounts } from '@/lib/vouchers/expiry-metrics'
import { expiryCreditKey } from '@/lib/vouchers/expiry-refund'

/**
 * The two reads SECTIONS 29 needs that nothing else already does: whether an
 * expired voucher's money has actually come back, and how often vouchers die
 * unused, per supplier.
 */

/**
 * The wallet entry `credit_expired_vouchers()` writes, or null.
 *
 * READ THROUGH THE REQUEST-SCOPED CLIENT, NOT THE ADMIN ONE. `wallet_entries`
 * carries `wallet_entries_select_unified`, which lets a customer see a row only
 * when one of its two accounts is theirs, so the SESSION is the filter. Reading
 * this with the service role and adding `.eq(...)` in TypeScript would move a
 * money-visibility rule out of the database and into a line somebody can forget
 * -- and the thing they would be shown is another customer's refund.
 *
 * `amount_ils_agorot` and never `amount_ils`. The agorot column is GENERATED
 * ALWAYS from the numeric one, so it is the same number with no float in the
 * path; `amount_ils` is `numeric` and would arrive as a JavaScript number.
 *
 * A FAILURE IS NOT AN ABSENCE, and here the difference is which sentence a
 * customer reads about their own money. So a real error returns `unknown` and
 * the page says nothing rather than asserting the refund is still pending -- a
 * refund that already landed, described as "coming within a day", is a customer
 * waiting for money they have.
 */
export type ExpiryCreditRead =
  | { known: true; credit: { amountAgorot: number; createdAt: string } | null }
  | { known: false }

export async function getVoucherExpiryCredit(voucherId: string): Promise<ExpiryCreditRead> {
  if (!/^[0-9a-fA-F-]{36}$/.test(voucherId)) return { known: true, credit: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wallet_entries')
    .select('amount_ils_agorot, created_at')
    .eq('idempotency_key', expiryCreditKey(voucherId))
    .maybeSingle()

  if (error) {
    // PGRST116 is `.maybeSingle()`'s "no row", which is an answer and not a
    // failure.
    if (error.code === 'PGRST116') return { known: true, credit: null }
    log.warn('voucher.expiry_credit_read_failed', { voucherId, reason: error.message })
    return { known: false }
  }

  if (!data) return { known: true, credit: null }

  const raw = (data as { amount_ils_agorot: number | string | null; created_at: string })
    .amount_ils_agorot
  const amountAgorot = Math.trunc(Number(raw ?? 0))
  if (!Number.isFinite(amountAgorot)) {
    log.warn('voucher.expiry_credit_unreadable_amount', { voucherId })
    return { known: false }
  }

  return {
    known: true,
    credit: { amountAgorot, createdAt: (data as { created_at: string }).created_at },
  }
}

/**
 * The same read for a whole page of vouchers, in one round trip.
 *
 * `/account/coupons` renders every coupon the customer owns. Calling the single
 * read per row is one query per expired coupon, which is the N+1 that turns a
 * page nobody complains about into one that times out for the customer with the
 * most coupons -- who is, by definition, the best customer on the page.
 *
 * The `.in()` list is built from ids the caller already read under RLS, and the
 * read itself is under RLS again, so a caller passing an id that is not theirs
 * gets nothing rather than somebody else's row.
 */
export async function getVoucherExpiryCredits(
  voucherIds: string[],
): Promise<Map<string, { amountAgorot: number; createdAt: string }>> {
  const found = new Map<string, { amountAgorot: number; createdAt: string }>()
  const ids = voucherIds.filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
  if (ids.length === 0) return found

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wallet_entries')
    .select('idempotency_key, amount_ils_agorot, created_at')
    .in(
      'idempotency_key',
      ids.map((id) => expiryCreditKey(id)),
    )

  if (error) {
    // An empty map here reads as "no refunds yet", which is the same shape a
    // successful read of nothing has. That collapse is acceptable on the LIST
    // page and is not on the detail page: the list shows a status chip, the
    // detail page shows a sentence about a specific sum. `getVoucherExpiryCredit`
    // is the one that distinguishes them.
    log.warn('voucher.expiry_credits_read_failed', { count: ids.length, reason: error.message })
    return found
  }

  for (const row of (data ?? []) as {
    idempotency_key: string
    amount_ils_agorot: number | string | null
    created_at: string
  }[]) {
    // `voucher:<uuid>:expiry_credit` -> `<uuid>`. Sliced rather than split on
    // ':' because a uuid contains none and a future key shape might.
    const id = row.idempotency_key.slice('voucher:'.length, -':expiry_credit'.length)
    const amountAgorot = Math.trunc(Number(row.amount_ils_agorot ?? 0))
    if (!id || !Number.isFinite(amountAgorot)) continue
    found.set(id, { amountAgorot, createdAt: row.created_at })
  }

  return found
}

export type SupplierExpiryRead =
  | { available: true; rows: SupplierExpiryCounts[] }
  | { available: false; missing: true }
  | { available: false; missing: false; reason: string }

/**
 * Per-supplier expiry counts, or an honest statement that they cannot be had.
 *
 * THE SERVICE ROLE IS DELIBERATE AND IS NOT A SHORTCUT AROUND RLS. The function
 * is granted to `service_role` alone and takes the supplier as an argument;
 * both callers resolve that supplier from a session first -- the supplier
 * console through `requireSupplierMember`, the admin table through
 * `requireSection` -- so the tenant boundary is enforced before the call, in the
 * same shape `getSupplierSales` and `getVoucherForRedemption` already use.
 *
 * Passing `supplierId: null` returns every supplier and is for the admin table
 * only. A supplier-side caller that forgot its own id would get the whole
 * platform, so the supplier wrapper below does not take an optional argument.
 */
export async function getSupplierExpiryMetrics(options?: {
  since?: Date | null
  supplierId?: string | null
}): Promise<SupplierExpiryRead> {
  const admin = createAdminClient()
  const result = await callPendingExpiryRpc<Record<string, unknown>>(() =>
    admin.rpc(pendingExpiryRpc('supplier_expiry_metrics'), {
      p_since: options?.since ? options.since.toISOString() : null,
      p_supplier_id: options?.supplierId ?? null,
    } as never),
  )

  if (!result.ok) {
    if (result.missing) {
      log.info('expiry_metrics.not_installed', { migration: '227' })
      return { available: false, missing: true }
    }
    log.error('expiry_metrics.read_failed', { reason: result.message })
    return { available: false, missing: false, reason: result.message }
  }

  return { available: true, rows: result.rows.map(toSupplierExpiryCounts) }
}

/** One supplier's own counts. Takes the id required, so it cannot be forgotten. */
export async function getOwnExpiryMetrics(
  supplierId: string,
  since?: Date | null,
): Promise<SupplierExpiryRead> {
  return getSupplierExpiryMetrics({ since: since ?? null, supplierId })
}
