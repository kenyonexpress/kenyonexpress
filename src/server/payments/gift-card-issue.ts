import { giftCardExpiryFromIssue } from '@/lib/commerce/gift-card'
import { createGiftCardCode, hashGiftCardCode, normalizeGiftCardCode } from '@/lib/gift-cards/code'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Minting gift cards for a paid order, inside finalize's replay-safe zone.
 *
 * WHERE THIS SITS. In the finalize item loop, BEFORE the paid_at stamp, unlike
 * gift-vouchers.ts which runs after it. The difference is deliberate: a card
 * that failed to mint IS fixable by replay (the dead-letter queue re-enters
 * finalize, the dedupe below finds what exists and mints only what is missing),
 * so this path earns the throwing side of finalize's boundary. A gift-card line
 * also must not reach `executeSplitForItem` - it has no supplier and the whole
 * charge is platform revenue - so the branch that calls this is the same branch
 * that keeps it out of the split.
 *
 * THE CODE'S CUSTODY, and the order of the two writes. The raw code exists only
 * in the outbox payload; `gift_cards` holds the SHA-256 (same rule as
 * `vouchers.gift_claim_token_hash`). The outbox row is written FIRST, keyed
 * `gift_card:<order_item_id>:<unit>`, and the card row is derived from it: a
 * crash between the two leaves an email payload whose code hashes to nothing
 * yet, and the replay re-reads that payload and mints the matching card. The
 * other order would strand a card whose code no one can ever recover, because
 * the hash is one-way and the raw code was never persisted anywhere.
 */

type AdminClient = SupabaseClient

/** Postgres: undefined_column, i.e. 234 has not been applied to this database. */
const UNDEFINED_COLUMN = '42703'

export interface GiftCardRecipient {
  /** Where the code is mailed: the gift recipient if the order names one, else the buyer. */
  email: string | null
  name: string | null
  message: string | null
  buyerUserId: string
}

/** Mirrors finalize's perUnit: the first unit absorbs the remainder. */
function perUnit(total: number, quantity: number): number[] {
  const base = Math.floor(total / quantity)
  return Array.from({ length: quantity }, (_, i) =>
    i === 0 ? total - base * (quantity - 1) : base,
  )
}

/**
 * Which of the order's products are gift cards. Defensive on the column, like
 * every schema-dependent read in finalize: a database without 234 has no
 * `is_gift_card`, and the right behaviour there is the behaviour before the
 * feature existed - no line is a gift card. Any OTHER failure throws, because
 * the caller is pre-stamp and a replay can fix it, whereas an empty set here
 * would silently route a supplier-less line into the split and fail the
 * finalize with the wrong sentence.
 */
export async function readGiftCardProductIds(
  admin: AdminClient,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const { data, error } = await admin
    .from('products')
    .select('id')
    .in('id', productIds)
    .eq('is_gift_card' as never, true as never)
  if (error) {
    if ((error as { code?: string }).code === UNDEFINED_COLUMN) {
      log.warn('gift_cards.column_missing', { productIds: productIds.length })
      return new Set()
    }
    throw new Error(`gift card product read failed: ${error.message}`)
  }
  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
}

/**
 * The buyer's email and, if the order names a gift recipient (108), theirs.
 * Never throws for the gift columns - a database without 108 simply has no
 * recipient to prefer - but a failed PROFILE read leaves email null, and the
 * issuer below refuses on that rather than minting a card no one is told about.
 */
export async function readGiftCardRecipient(
  admin: AdminClient,
  orderId: string,
  buyerUserId: string,
): Promise<GiftCardRecipient> {
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', buyerUserId)
    .maybeSingle()

  const buyerEmail = (profile as { email: string | null } | null)?.email ?? null

  const { data: giftRow, error: giftError } = await admin
    .from('orders')
    .select('gift_recipient_name, gift_recipient_email, gift_message')
    .eq('id', orderId)
    .maybeSingle()
  if (giftError) {
    return { email: buyerEmail, name: null, message: null, buyerUserId }
  }

  const gift = giftRow as {
    gift_recipient_name?: string | null
    gift_recipient_email?: string | null
    gift_message?: string | null
  } | null
  const recipientEmail = gift?.gift_recipient_email?.trim()
  if (recipientEmail) {
    return {
      email: recipientEmail,
      name: gift?.gift_recipient_name?.trim() || null,
      message: gift?.gift_message?.trim() || null,
      buyerUserId,
    }
  }
  return { email: buyerEmail, name: null, message: null, buyerUserId }
}

interface GiftCardOrderItem {
  id: string
  order_id: string
  product_id: string | null
  quantity: number
  paid_on_site_agorot: number | null
}

/**
 * Issues one card per purchased unit, replay-safe.
 *
 * Throws on anything it cannot prove done: the caller is pre-stamp, so a throw
 * buys a dead-letter replay that re-enters here and completes only the missing
 * units. The one tolerated "failure" is 23505 on the card insert - a concurrent
 * finalize minted the same unit first, which is the dedupe index doing its job.
 */
export async function issueGiftCardsForItem(
  admin: AdminClient,
  item: GiftCardOrderItem,
  recipient: GiftCardRecipient,
  now: Date,
): Promise<void> {
  if (!recipient.email) {
    // A card whose code is mailed nowhere is money the customer can never
    // spend. The profile read failed or the account has no email; both are
    // states a replay can meet repaired.
    throw new Error(`gift card order item ${item.id}: no recipient email to send the code to`)
  }

  const amounts = perUnit(item.paid_on_site_agorot ?? 0, item.quantity)
  if (amounts.some((amount) => amount <= 0)) {
    throw new Error(
      `gift card order item ${item.id}: non-positive unit value; refusing to mint a worthless card`,
    )
  }

  // The replay cap. Same contract as the voucher count in finalize: a discarded
  // error here reads as "none minted yet" and the loop would mint siblings, so
  // it throws instead.
  const { data: existing, error: existingError } = await admin
    .from('gift_cards')
    .select('unit_index')
    .eq('order_item_id', item.id)
  if (existingError) {
    throw new Error(`gift card issued read failed: ${existingError.message}`)
  }
  const minted = new Set(((existing ?? []) as { unit_index: number }[]).map((r) => r.unit_index))

  const expiresAt = giftCardExpiryFromIssue(now)

  for (let unit = 1; unit <= item.quantity; unit += 1) {
    if (minted.has(unit)) continue

    const dedupe = `gift_card:${item.id}:${unit}`
    let { code } = createGiftCardCode()

    // The outbox first; on a dedupe collision the surviving payload's code is
    // the one already promised to the customer, so the card must match IT.
    const { error: queueError } = await admin.from('notification_outbox').insert({
      kind: 'gift_card_issued',
      recipient_email: recipient.email,
      payload: {
        code,
        amount_agorot: amounts[unit - 1],
        expires_at: expiresAt.toISOString(),
        recipient_name: recipient.name,
        gift_message: recipient.message,
        order_id: item.order_id,
      },
      dedupe_key: dedupe,
    } as never)
    if (queueError) {
      if (!queueError.message.includes('duplicate')) {
        throw new Error(`gift card outbox enqueue failed: ${queueError.message}`)
      }
      const { data: queued, error: rereadError } = await admin
        .from('notification_outbox')
        .select('payload')
        .eq('dedupe_key', dedupe)
        .maybeSingle()
      const promised = (queued as { payload?: { code?: unknown } } | null)?.payload?.code
      if (rereadError || typeof promised !== 'string' || !promised) {
        throw new Error(
          `gift card outbox reread failed for ${dedupe}: ${rereadError?.message ?? 'no code in payload'}`,
        )
      }
      code = promised
    }

    const { error: insertError } = await admin.from('gift_cards').insert({
      code_hash: hashGiftCardCode(code),
      code_last4: normalizeGiftCardCode(code).slice(-4),
      amount_agorot: amounts[unit - 1],
      purchaser_user_id: recipient.buyerUserId,
      order_id: item.order_id,
      order_item_id: item.id,
      unit_index: unit,
      recipient_name: recipient.name,
      recipient_email: recipient.email,
      gift_message: recipient.message,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    } as never)
    if (insertError) {
      // 23505 on (order_item_id, unit_index): a concurrent finalize won the
      // race for this unit. Its card matches its own outbox row; done.
      if (insertError.message.includes('duplicate')) continue
      throw new Error(`gift card insert failed: ${insertError.message}`)
    }
    log.info('gift_cards.issued', { orderItemId: item.id, unit, amountAgorot: amounts[unit - 1] })
  }
}
