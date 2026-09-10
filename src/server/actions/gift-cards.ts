'use server'

import { type GiftCardState, judgeGiftCard } from '@/lib/commerce/gift-card'
import { hashGiftCardCode, isWellFormedGiftCardCode } from '@/lib/gift-cards/code'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'

/**
 * The gift card's two public verbs: what is it worth, and put it in my wallet.
 *
 * Both take the CODE, and the code is the whole authorisation: a gift card is
 * a bearer instrument, printed on a greeting card, and its recipient usually
 * has no account yet. What stands between this and an enumeration oracle is
 * arithmetic plus a limiter: ~78 bits of code space against a per-IP rate
 * limit, and a shape gate that answers free-of-charge for anything that is not
 * even 16 characters of the alphabet. The database is only ever asked about
 * well-formed codes, by hash; the raw code is never logged and never stored.
 *
 * Redemption requires a session because it must know WHOSE wallet, and the
 * heavy lifting is `redeem_gift_card` (234): one row lock, expiry judged
 * inside it, idempotent for the same user, wallet credit via fn_wallet_transfer
 * with a per-card idempotency key. This file only translates its refusal
 * tokens into sentences.
 */

const CODE_MESSAGES = {
  malformed: 'הקוד צריך להיות באורך 16 תווים, כפי שמופיע במייל.',
  not_found: 'הקוד לא נמצא. בדקו שהוקלד בדיוק כפי שמופיע במייל.',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
} as const

type GiftCardRow = {
  amount_agorot: number
  status: string
  expires_at: string
  redeemed_at: string | null
}

export type GiftCardBalanceState = {
  ok: boolean
  error?: string
  state?: GiftCardState
  /** Integer agorot. Face value while active, zero in every other state. */
  balanceAgorot?: number
  expiresAt?: string
}

export type GiftCardRedeemState = {
  ok: boolean
  error?: string
  /** Set when the caller has no session; the form links to login. */
  needsLogin?: boolean
  /** Integer agorot credited to the wallet on success. */
  creditedAgorot?: number
}

async function readCardByCode(code: string): Promise<GiftCardRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gift_cards' as never)
    .select('amount_agorot, status, expires_at, redeemed_at')
    .eq('code_hash', hashGiftCardCode(code))
    .maybeSingle()
  if (error) {
    log.error('gift_card.read_failed', { reason: error.message })
    throw new Error(`gift card read failed: ${error.message}`)
  }
  return (data as GiftCardRow | null) ?? null
}

async function runCheckGiftCardBalance(
  _prev: GiftCardBalanceState,
  formData: FormData,
): Promise<GiftCardBalanceState> {
  const raw = String(formData.get('code') ?? '')
  if (!isWellFormedGiftCardCode(raw)) {
    return { ok: false, error: CODE_MESSAGES.malformed }
  }

  const ip = await getClientIp()
  if (!(await checkRateLimit(`gift_card_check:${ip}`, 20, 3600))) {
    return { ok: false, error: CODE_MESSAGES.rate_limited }
  }

  const card = await readCardByCode(raw)
  if (!card) return { ok: false, error: CODE_MESSAGES.not_found }

  const judged = judgeGiftCard(card, new Date())
  return {
    ok: true,
    state: judged.state,
    balanceAgorot: judged.balanceAgorot,
    expiresAt: judged.expiresAt.toISOString(),
  }
}

/** What redeem_gift_card can answer, each with its own sentence. */
const REDEEM_REFUSALS_HE: Record<string, string> = {
  not_found: CODE_MESSAGES.not_found,
  expired: 'תוקף הגיפט קארד פג ולא ניתן לממש אותו.',
  cancelled: 'הגיפט קארד בוטל. לבירור אפשר לפנות לשירות הלקוחות.',
  redeemed: 'הגיפט קארד כבר מומש.',
  wallet_missing: 'לא הצלחנו לזכות את הארנק. נסו שוב מאוחר יותר.',
}

async function runRedeemGiftCard(
  _prev: GiftCardRedeemState,
  formData: FormData,
): Promise<GiftCardRedeemState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, needsLogin: true, error: 'כדי לממש צריך להתחבר לחשבון.' }

  const raw = String(formData.get('code') ?? '')
  if (!isWellFormedGiftCardCode(raw)) {
    return { ok: false, error: CODE_MESSAGES.malformed }
  }

  if (!(await checkRateLimit(`gift_card_redeem:${user.id}`, 10, 3600))) {
    return { ok: false, error: CODE_MESSAGES.rate_limited }
  }

  const admin = createAdminClient()
  const { data: refusal, error } = await admin.rpc(
    'redeem_gift_card' as never,
    {
      p_code_hash: hashGiftCardCode(raw),
      p_user_id: user.id,
    } as never,
  )
  if (error) {
    log.error('gift_card.redeem_failed', { userId: user.id, reason: error.message })
    return { ok: false, error: 'לא הצלחנו לממש את הקוד, נסו שוב.' }
  }
  if (typeof refusal === 'string' && refusal) {
    return { ok: false, error: REDEEM_REFUSALS_HE[refusal] ?? REDEEM_REFUSALS_HE.not_found }
  }

  // The RPC succeeded (or was a same-user replay of a success, which reads the
  // same); the card row now knows its value went to this wallet.
  const card = await readCardByCode(raw)
  revalidatePath('/account/wallet')
  return { ok: true, creditedAgorot: card?.amount_agorot ?? 0 }
}

export async function checkGiftCardBalance(
  prev: GiftCardBalanceState,
  formData: FormData,
): Promise<GiftCardBalanceState> {
  return withActionContext('gift_card.check_balance', () => runCheckGiftCardBalance(prev, formData))
}

export async function redeemGiftCard(
  prev: GiftCardRedeemState,
  formData: FormData,
): Promise<GiftCardRedeemState> {
  return withActionContext('gift_card.redeem', () => runRedeemGiftCard(prev, formData))
}
