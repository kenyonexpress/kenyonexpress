'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { agorot, formatAgorot } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * The one admin verb a gift card has: cancel it before it is loaded (STEP 48).
 *
 * WHY ONLY CANCEL. Issuance is finalize's (one card per paid unit, replay
 * safe) and redemption is the holder's (`redeem_gift_card`, 234). An admin
 * cannot mint a card without an order, because the face value has to have
 * been paid into platform revenue before it can be turned into a liability;
 * and cannot un-redeem one, because the value is already a wallet entry and
 * the wallet is append-only. What an admin CAN do is withdraw a card that
 * should never pay out: a refunded order, a chargeback, a code mailed to the
 * wrong address. That is a status change on a row nobody has spent yet.
 *
 * THE GUARD IS IN THE WHERE. `status = 'issued'` travels with the UPDATE, so
 * a card redeemed between the read and the write updates zero rows and the
 * action reports that, instead of the status check racing the holder.
 */

export type GiftCardAdminResult = { error?: string; success?: string }

const cancelSchema = z.object({
  id: z.string().uuid('מזהה גיפט קארד לא תקין'),
  reason: z.string().trim().min(3, 'נדרש נימוק (לפחות 3 תווים)').max(500, 'נימוק ארוך מדי'),
})

/** Postgres undefined_table and PostgREST's "not in schema cache": 234 absent. */
const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

const NOT_INSTALLED = 'טבלת הגיפט קארד אינה מותקנת בבסיס הנתונים הזה: מיגרציה 234 ממתינה לאישור.'

const REFUSALS_HE: Record<string, string> = {
  redeemed: 'הגיפט קארד כבר נטען לארנק ואי אפשר לבטל אותו. קיזוז נעשה דרך התאמת קאשבק.',
  cancelled: 'הגיפט קארד כבר מבוטל.',
}

type CardRow = {
  id: string
  status: string
  amount_agorot: number
  code_last4: string
  purchaser_user_id: string | null
  order_id: string | null
}

async function guard(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('payments', 'write')
  } catch {
    return null
  }
}

async function runCancelGiftCard(input: {
  id: string
  reason: string
}): Promise<GiftCardAdminResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }
  const { id, reason } = parsed.data

  const admin = createAdminClient()
  const { data: before, error: readError } = await admin
    .from('gift_cards' as never)
    .select('id, status, amount_agorot, code_last4, purchaser_user_id, order_id')
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    if (TABLE_MISSING.has(readError.code)) return { error: NOT_INSTALLED }
    log.error('gift_card.admin_read_failed', { id, reason: readError.message })
    return { error: readError.message }
  }
  const card = (before as CardRow | null) ?? null
  if (!card) return { error: 'הגיפט קארד לא נמצא' }
  if (card.status !== 'issued') {
    return { error: REFUSALS_HE[card.status] ?? 'הגיפט קארד אינו במצב שניתן לבטל' }
  }

  const { data: updated, error } = await admin
    .from('gift_cards' as never)
    .update({ status: 'cancelled' } as never)
    .eq('id', id)
    .eq('status', 'issued')
    .select('id')
    .maybeSingle()
  if (error) {
    log.error('gift_card.admin_cancel_failed', { id, reason: error.message })
    return { error: error.message }
  }
  if (!updated) {
    // The holder got there first: the WHERE matched nothing. Not an error
    // in the money, and the sentence says what happened.
    return { error: REFUSALS_HE.redeemed }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'gift_cards',
    entityId: id,
    changes: {
      status: ['issued', 'cancelled'],
      reason,
      amount_agorot: card.amount_agorot,
      code_last4: card.code_last4,
      order_id: card.order_id,
    },
    before: { status: 'issued' },
    after: { status: 'cancelled' },
  })

  revalidatePath('/admin/gift-cards')
  revalidatePath('/account/gift-cards')
  return {
    success: `הגיפט קארד שמסתיים ב-${card.code_last4} (${formatAgorot(agorot(card.amount_agorot))}) בוטל.`,
  }
}

export async function cancelGiftCard(input: {
  id: string
  reason: string
}): Promise<GiftCardAdminResult> {
  return withActionContext('admin.gift_card.cancel', () => runCancelGiftCard(input))
}
