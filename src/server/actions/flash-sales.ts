'use server'

import {
  CLAIM_OUTCOME_HE,
  type ClaimOutcome,
  type FlashClaimStatus,
  isClaimOutcome,
} from '@/lib/flash-sales/rules'
import { isMissingFlashSchema } from '@/lib/flash-sales/rules'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Taking a unit in a flash sale, or a place in its waiting room (STEP 61).
 *
 * AN ACCOUNT IS REQUIRED, because the checkout requires one: a hold a guest
 * could take would be a hold nobody could pay for, and the unit would sit
 * out the timer for nothing. The sale page offers the sign-in link with a
 * return path instead.
 *
 * THE DATABASE DECIDES. `claim_flash_sale` (266) locks the sale row, lapses
 * what ran out, promotes the queue, and only then answers for this shopper:
 * `held` with an expiry, `queued` with how many are ahead, or one of the
 * refusals. Two shoppers racing the last unit get one `held` and one
 * `queued`, in that order, before either sees a button change. This action
 * adds nothing to that decision; it translates the outcome into Hebrew and
 * refreshes the cart, whose price for the product now comes from the hold.
 *
 * Rate limited per USER: the budget is the shopper's, and a shopper
 * hammering "תפסו יחידה" against a full sale is a shopper, not an attack.
 */

const idSchema = z.string().uuid()
const quantitySchema = z.coerce.number().int().min(1).max(10)

export type FlashClaimResult = {
  ok: boolean
  outcome: ClaimOutcome | 'guest' | 'error'
  message: string
  claim: {
    status: FlashClaimStatus
    quantity: number
    position: number | null
    ahead: number | null
    expires_at: string | null
  } | null
  remaining: number | null
}

const GUEST_MESSAGE = 'כדי לתפוס יחידה במבצע צריך להתחבר.'
const GENERIC_ERROR = 'לא הצלחנו לרשום את הבקשה. נסו שוב בעוד רגע.'
const MIGRATION_MESSAGE = 'המבצע עדיין לא פתוח להזמנות.'

type RpcRow = {
  outcome: string
  status: string | null
  quantity: number | string | null
  queue_position: number | null
  ahead: number | null
  expires_at: string | null
  remaining: number | string | null
}

async function currentUser(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function runClaimFlashSale(saleId: string, quantity: number): Promise<FlashClaimResult> {
  const idParsed = idSchema.safeParse(saleId)
  const qtyParsed = quantitySchema.safeParse(quantity)
  if (!idParsed.success) {
    return {
      ok: false,
      outcome: 'not_found',
      message: CLAIM_OUTCOME_HE.not_found,
      claim: null,
      remaining: null,
    }
  }
  if (!qtyParsed.success) {
    return {
      ok: false,
      outcome: 'bad_quantity',
      message: CLAIM_OUTCOME_HE.bad_quantity,
      claim: null,
      remaining: null,
    }
  }

  const userId = await currentUser()
  if (!userId)
    return { ok: false, outcome: 'guest', message: GUEST_MESSAGE, claim: null, remaining: null }

  if (!(await checkRateLimit(`flash-claim:${userId}`, 30, 3600))) {
    return {
      ok: false,
      outcome: 'error',
      message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
      claim: null,
      remaining: null,
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc(
    'claim_flash_sale' as never,
    { p_sale: idParsed.data, p_user: userId, p_quantity: qtyParsed.data } as never,
  )
  if (error) {
    if (isMissingFlashSchema(error)) {
      return {
        ok: false,
        outcome: 'error',
        message: MIGRATION_MESSAGE,
        claim: null,
        remaining: null,
      }
    }
    log.warn('flash_sale.claim_failed', { saleId, reason: error.message })
    return { ok: false, outcome: 'error', message: GENERIC_ERROR, claim: null, remaining: null }
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined
  if (!row || !isClaimOutcome(row.outcome)) {
    log.warn('flash_sale.claim_unexpected', { saleId, outcome: row?.outcome ?? null })
    return { ok: false, outcome: 'error', message: GENERIC_ERROR, claim: null, remaining: null }
  }

  const outcome = row.outcome
  const held = outcome === 'held' || outcome === 'queued'
  const claim: FlashClaimResult['claim'] =
    outcome === 'held' || outcome === 'queued' || outcome === 'consumed'
      ? {
          status: outcome,
          quantity: Math.max(1, Math.trunc(Number(row.quantity ?? 1))),
          position: row.queue_position,
          ahead: row.ahead,
          expires_at: row.expires_at,
        }
      : null

  // The cart prices the product from the hold now; a cached cart page would
  // still show the ordinary price.
  if (outcome === 'held') revalidatePath('/cart')

  return {
    ok: held,
    outcome,
    message: CLAIM_OUTCOME_HE[outcome],
    claim,
    remaining: row.remaining == null ? null : Math.max(0, Math.trunc(Number(row.remaining))),
  }
}

async function runLeaveFlashSale(saleId: string): Promise<{ ok: boolean; message: string }> {
  const idParsed = idSchema.safeParse(saleId)
  if (!idParsed.success) return { ok: false, message: CLAIM_OUTCOME_HE.not_found }

  const userId = await currentUser()
  if (!userId) return { ok: false, message: GUEST_MESSAGE }

  const { data, error } = await createAdminClient().rpc(
    'leave_flash_sale' as never,
    { p_sale: idParsed.data, p_user: userId } as never,
  )
  if (error) {
    if (isMissingFlashSchema(error)) return { ok: false, message: MIGRATION_MESSAGE }
    log.warn('flash_sale.leave_failed', { saleId, reason: error.message })
    return { ok: false, message: GENERIC_ERROR }
  }
  revalidatePath('/cart')
  return {
    ok: true,
    message:
      data === true ? 'יצאתם מהמבצע. היחידה חזרה למלאי.' : 'לא הייתה לכם יחידה או מקום בתור.',
  }
}

export async function claimFlashSale(saleId: string, quantity: number): Promise<FlashClaimResult> {
  return withActionContext('flash_sale.claim', () => runClaimFlashSale(saleId, quantity))
}

export async function leaveFlashSale(saleId: string): Promise<{ ok: boolean; message: string }> {
  return withActionContext('flash_sale.leave', () => runLeaveFlashSale(saleId))
}
