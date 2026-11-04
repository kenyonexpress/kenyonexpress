import { log } from '@/lib/observability/log'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/**
 * The guest's contact details, on the anonymous user's profile row (S07).
 *
 * An anonymous auth user has no email, and every mail after payment (the
 * voucher, the invoice, the order confirmation) reads its recipient from
 * `profiles.email` - `server/payments/voucher-email.ts`, `invoices.ts`,
 * `finalize.ts`. Writing the typed address there is what makes a guest
 * order deliverable without a new column. The row itself exists already:
 * measured 04.11.2026, 319 of 319 anonymous users on production have one.
 *
 * Upsert rather than update, so a profile trigger that has not run yet does
 * not turn into a guest order with nowhere to send the coupon.
 */
export async function saveGuestContact(
  admin: Admin,
  userId: string,
  contact: { email: string; fullName: string | null; phone: string | null },
): Promise<boolean> {
  const row: Record<string, string> = { id: userId, email: contact.email }
  if (contact.fullName) row.full_name = contact.fullName
  if (contact.phone) row.phone = contact.phone
  const { error } = await admin.from('profiles').upsert(row as never, { onConflict: 'id' })
  if (error) {
    log.error('checkout.guest_contact_save_failed', { userId, reason: error.message })
    return false
  }
  return true
}

/** The email a guest gave on an earlier order in this browser, if any. */
export async function readGuestEmail(admin: Admin, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  // A failed read is "no saved email": the guest is asked to type it, which is
  // the honest answer, not a silent order with nowhere to send the coupon.
  if (error) {
    log.warn('checkout.guest_email_read_failed', { userId, reason: error.message })
    return null
  }
  return (data as { email: string | null } | null)?.email ?? null
}

/**
 * Every table a guest checkout writes to, with the column that names the owner.
 *
 * Orders and vouchers are the purchase; the address and the card token are
 * "saved for next time", which is the reason the shopper signed in at all.
 * Wallet and cashback are left behind on purpose: they are ledgers with
 * balances derived from them, and moving rows under a balance is a money
 * change this function must not make. docs/S07-guest.md records the gap.
 */
export const GUEST_OWNED_TABLES = [
  { table: 'orders', column: 'user_id' },
  { table: 'vouchers', column: 'user_id' },
  { table: 'user_addresses', column: 'user_id' },
  { table: 'payment_tokens', column: 'profile_id' },
] as const

export type AttachResult = { ok: boolean; moved: Record<string, number> }

/**
 * Hands a guest's orders to the account they signed into after paying.
 *
 * The normal path never gets here: `linkIdentity` turns the anonymous user
 * into the Google user and the id does not change. This is the other case,
 * a Google account that already exists, where Supabase refuses the link and
 * the shopper signs in to that account instead. The ANONYMOUS SESSION is the
 * proof of ownership - the caller read it from the request cookies before the
 * code exchange replaced it - so this is never reachable with an id the
 * browser merely typed.
 */
export async function attachGuestOrders(
  admin: Admin,
  from: { id: string; is_anonymous?: boolean },
  toUserId: string,
): Promise<AttachResult> {
  const moved: Record<string, number> = {}
  if (from.is_anonymous !== true || from.id === toUserId) return { ok: true, moved }

  let ok = true
  for (const { table, column } of GUEST_OWNED_TABLES) {
    const { data, error } = await admin
      .from(table)
      .update({ [column]: toUserId } as never)
      .eq(column, from.id)
      .select('id')
    if (error) {
      ok = false
      log.error('auth.guest_attach_failed', {
        table,
        from: from.id,
        to: toUserId,
        reason: error.message,
      })
      continue
    }
    moved[table] = (data ?? []).length
  }
  log.info('auth.guest_orders_attached', { from: from.id, to: toUserId, moved })
  return { ok, moved }
}
