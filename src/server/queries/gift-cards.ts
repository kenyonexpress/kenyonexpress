import { type GiftCardState, judgeGiftCard } from '@/lib/commerce/gift-card'
import type { Agorot } from '@/lib/commerce/money'
import { agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * The customer's own gift cards (STEP 48): the ones they paid for and the
 * ones they loaded into their wallet.
 *
 * Read on the SESSION client so 234's `gift_cards_select_own` policy is the
 * filter: `purchaser_user_id = auth.uid() or redeemed_by_user_id = auth.uid()`.
 * No `.eq('user_id')` here on purpose, because the row has two owner columns
 * and the policy already names both; a second filter in code could only ever
 * be narrower than the policy, never safer.
 *
 * The balance is the same judgement the redemption page and the RPC make
 * (`judgeGiftCard`): face value while active, zero once redeemed, expired or
 * cancelled. A redeemed card's value lives on in the wallet ledger as the
 * `gift_card_redeem` entry, which is where "balance tracking" continues.
 */

export type GiftCardRole = 'bought' | 'received'

export interface MyGiftCard {
  id: string
  /** For support conversations and the list: "the card ending in 7K2M". */
  codeLast4: string
  amountAgorot: Agorot
  /** Integer agorot. Face value while active, zero in every other state. */
  balanceAgorot: Agorot
  state: GiftCardState
  issuedAt: string
  expiresAt: string
  redeemedAt: string | null
  /**
   * 'bought' when the signed-in customer paid for it (whoever redeemed it),
   * 'received' when someone else bought it and this customer loaded it.
   */
  role: GiftCardRole
  recipientName: string | null
  recipientEmail: string | null
  orderId: string | null
}

type GiftCardRow = {
  id: string
  code_last4: string
  amount_agorot: number
  status: string
  purchaser_user_id: string | null
  redeemed_by_user_id: string | null
  recipient_name: string | null
  recipient_email: string | null
  order_id: string | null
  issued_at: string
  expires_at: string
  redeemed_at: string | null
}

/** Postgres undefined_table and PostgREST's "not in schema cache": 234 absent. */
const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

const SELECT =
  'id, code_last4, amount_agorot, status, purchaser_user_id, redeemed_by_user_id, ' +
  'recipient_name, recipient_email, order_id, issued_at, expires_at, redeemed_at'

export function toMyGiftCard(row: GiftCardRow, userId: string, now: Date): MyGiftCard {
  const judged = judgeGiftCard(row, now)
  return {
    id: row.id,
    codeLast4: row.code_last4,
    amountAgorot: agorot(Math.max(0, Math.trunc(row.amount_agorot))),
    balanceAgorot: judged.balanceAgorot,
    state: judged.state,
    issuedAt: row.issued_at,
    expiresAt: judged.expiresAt.toISOString(),
    redeemedAt: row.redeemed_at,
    role: row.purchaser_user_id === userId ? 'bought' : 'received',
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    orderId: row.order_id,
  }
}

/** Null without a session; an empty list when the table is not installed. */
export async function getMyGiftCards(now: Date = new Date()): Promise<MyGiftCard[] | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('gift_cards' as never)
    .select(SELECT)
    .order('issued_at', { ascending: false })
    .limit(100)

  if (error) {
    if (TABLE_MISSING.has(error.code)) {
      log.warn('gift_cards.table_missing', { userId: user.id })
      return []
    }
    log.error('gift_cards.my_cards_read_failed', { userId: user.id, reason: error.message })
    return []
  }

  return ((data ?? []) as unknown as GiftCardRow[]).map((row) => toMyGiftCard(row, user.id, now))
}
