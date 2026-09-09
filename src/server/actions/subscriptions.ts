'use server'

import { canCancel, canPause, canResume, pauseUpdate, resumeUpdate } from '@/lib/commerce/recurring'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import {
  type PendingSubscriptionRow,
  isMissingRelation,
  pendingTable,
  selectPending,
} from '@/lib/supabase/pending-schema'
import { createClient } from '@/lib/supabase/server'
import type { AccountActionState } from '@/lib/validations/account'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Cancelling a subscription from the customer's own account page.
 *
 * Three properties this has to hold, and all three are checked rather than
 * assumed:
 *
 *   OWNERSHIP is RLS's job, not this function's. The write goes through the
 *   request-scoped client, so a customer who guesses another person's id gets
 *   zero rows updated instead of an unauthorised cancellation. That is why the
 *   update is not filtered by user_id here as well - a second filter would
 *   suggest the first one is optional.
 *
 *   IT MOVES NO MONEY. Cancellation stops the next charge; it does not refund
 *   the cycle already paid for. Nothing here touches the wallet, `payments`, or
 *   the escrow hold, and it must stay that way: refunding a subscription is
 *   `refund.ts`, a separate decision with a separate audit trail.
 *
 *   IT IS IDEMPOTENT. A double-clicked button, or a customer cancelling in two
 *   tabs, must not produce two writes with two different canceled_at values.
 *   The row is read first and a subscription that is already cancelled reports
 *   success without writing.
 */

const cancelSchema = z.object({
  id: z.string().uuid('מזהה מנוי לא תקין'),
  // Free text, optional, kept short. Stored so support can see why people leave
  // without having to ask them again.
  reason: z.string().trim().max(500).nullable().optional(),
})

async function runCancelSubscription(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר' }

  const parsed = cancelSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'מזהה מנוי לא תקין' }
  }

  // Read before write, so an already-cancelled subscription is a no-op rather
  // than a second UPDATE that moves canceled_at forward.
  const current = await selectPending<Pick<PendingSubscriptionRow, 'id' | 'status'>>(() =>
    supabase.from(pendingTable('subscriptions')).select('id, status').eq('id', parsed.data.id),
  )

  if (!current.ok) {
    if (current.missing) {
      log.info('subscription.cancel.table_absent', { reason: '135 not applied' })
      return { error: 'המנויים אינם זמינים כרגע' }
    }
    log.error('subscription.cancel.read_failed', { reason: current.message })
    return { error: 'ביטול המנוי נכשל' }
  }

  const row = current.rows[0]
  // Zero rows means RLS filtered it out or it does not exist. The message is
  // the same either way on purpose: telling the difference would confirm to a
  // stranger that a given subscription id is real.
  if (!row) return { error: 'המנוי לא נמצא' }

  if (!canCancel(row.status as never)) {
    return { success: 'המנוי כבר בוטל' }
  }

  const { error } = await supabase
    .from(pendingTable('subscriptions'))
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      // Cleared because subscriptions_canceled_is_terminal requires it, and
      // because a cancelled row with a future date is one forgotten status
      // check away from being billed.
      next_charge_at: null,
      cancel_reason: parsed.data.reason ?? null,
    } as never)
    .eq('id', parsed.data.id)

  if (error) {
    if (isMissingRelation(error)) return { error: 'המנויים אינם זמינים כרגע' }
    log.error('subscription.cancel.write_failed', { reason: error.message })
    return { error: 'ביטול המנוי נכשל' }
  }

  log.info('subscription.canceled', { subscriptionId: parsed.data.id })
  revalidatePath('/account/subscriptions')
  return { success: 'המנוי בוטל. לא יבוצע חיוב נוסף.' }
}

export async function cancelSubscription(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.cancel_subscription', () =>
    runCancelSubscription(_prev, formData),
  )
}

const holdSchema = z.object({ id: z.string().uuid('מזהה מנוי לא תקין') })

/**
 * Pause and resume, which [90] asks for and which nothing could do.
 *
 * `paused` has been a permitted status since 135b: the database CHECK allows
 * it, `dueSubscriptions` skips it, `canCancel` accepts it - and the only action
 * that existed was cancel. A state the whole system understands and no path
 * produces is a feature that reads as built.
 *
 * The decisions are in `lib/commerce/recurring.ts` and are pure, for the same
 * reason the charge outcome is: what a resume does to `next_charge_at` and to
 * `failed_attempts` is testable without a database, and it is the half most
 * likely to be got wrong.
 */
async function runHoldSubscription(
  formData: FormData,
  intent: 'pause' | 'resume',
): Promise<AccountActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר' }

  const parsed = holdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'מזהה מנוי לא תקין' }

  const current = await selectPending<
    Pick<PendingSubscriptionRow, 'id' | 'status' | 'next_charge_at'> & {
      billing_interval: string
      billing_interval_count: number
    }
  >(() =>
    supabase
      .from(pendingTable('subscriptions'))
      .select('id, status, next_charge_at, billing_interval, billing_interval_count')
      .eq('id', parsed.data.id),
  )

  if (!current.ok) {
    if (current.missing) return { error: 'המנויים אינם זמינים כרגע' }
    log.error('subscription.hold.read_failed', { intent, reason: current.message })
    return { error: 'העדכון נכשל' }
  }

  const row = current.rows[0]
  // Same message for "not yours" and "does not exist", for the same reason
  // cancel gives: telling them apart confirms an id to a stranger.
  if (!row) return { error: 'המנוי לא נמצא' }

  const status = row.status as never

  if (intent === 'pause') {
    if (!canPause(status)) return { success: 'המנוי אינו פעיל, אין מה להשהות' }
    const update = pauseUpdate({ next_charge_at: row.next_charge_at ?? null })
    const { error } = await supabase
      .from(pendingTable('subscriptions'))
      .update(update as never)
      .eq('id', parsed.data.id)
    if (error) {
      if (isMissingRelation(error)) return { error: 'המנויים אינם זמינים כרגע' }
      log.error('subscription.pause.write_failed', { reason: error.message })
      return { error: 'ההשהיה נכשלה' }
    }
    log.info('subscription.paused', { subscriptionId: parsed.data.id })
    revalidatePath('/account/subscriptions')
    return { success: 'המנוי הושהה. לא יבוצע חיוב עד שתחדשו אותו.' }
  }

  if (!canResume(status)) return { success: 'המנוי אינו מושהה' }

  const interval = row.billing_interval === 'yearly' ? 'yearly' : 'monthly'
  const update = resumeUpdate({
    nowIso: new Date().toISOString(),
    interval,
    intervalCount: row.billing_interval_count ?? 1,
  })

  const { error } = await supabase
    .from(pendingTable('subscriptions'))
    .update(update as never)
    .eq('id', parsed.data.id)

  if (error) {
    if (isMissingRelation(error)) return { error: 'המנויים אינם זמינים כרגע' }
    log.error('subscription.resume.write_failed', { reason: error.message })
    return { error: 'החידוש נכשל' }
  }

  log.info('subscription.resumed', { subscriptionId: parsed.data.id })
  revalidatePath('/account/subscriptions')
  return { success: 'המנוי חודש. החיוב הבא יתבצע בתום התקופה הנוכחית.' }
}

export async function pauseSubscription(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.pause_subscription', () =>
    runHoldSubscription(formData, 'pause'),
  )
}

export async function resumeSubscription(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.resume_subscription', () =>
    runHoldSubscription(formData, 'resume'),
  )
}
