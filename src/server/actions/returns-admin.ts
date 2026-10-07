'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { ilsToAgorot } from '@/lib/commerce/money'
import { sendEmail } from '@/lib/email/resend'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { buildReturnRejectedNotice } from '@/lib/returns/notices'
import { RETURN_REASONS } from '@/lib/returns/policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundOrder } from '@/server/actions/payments/refund'
import { refundToWallet } from '@/server/actions/payments/refund-wallet'
import { returnFromRow } from '@/server/queries/returns'
import type { Json } from '@/types/database'
import { revalidatePath } from 'next/cache'

/**
 * The admin's decision on a customer's return request (STEP 44).
 *
 * Two verbs. `reject` closes the row as `rejected` with the admin's note and
 * tells the customer. `approve` hands the row to the path its destination
 * names: `refundOrder` for the card (it claims the `requested` row and asks
 * Cardcom), `refundToWallet` for store credit (it claims the row and moves
 * the ledger). Both of those are the money paths; this action moves no money
 * itself and holds no second copy of their rules.
 *
 * The fee question is the admin's, and it is answered once, here: the
 * customer's reason code proposes a ground, the admin confirms or overrides
 * with `waiveFee`, and the ground written on the claim is the one the fee
 * constraint in 131 checks.
 */

export type ReturnDecisionResult =
  | { ok: true; decision: 'approved' | 'rejected'; rma: string; creditedAgorot: number | null }
  | {
      ok: false
      code:
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'STATE_INVALID'
        | 'INTERNAL'
        | 'MANUAL_RESOLUTION'
        | 'PROVIDER_ERROR'
      error: string
    }

export interface ReturnDecisionInput {
  refundId: string
  decision: 'approve' | 'reject'
  /** The admin's words: the rejection reason, or the refund's reason line. */
  note?: string
  /** Approve without the statutory fee even on a change-of-mind ground. */
  waiveFee?: boolean
}

const DECIDABLE = ['requested', 'approved'] as const

async function runDecideReturnRequest(input: ReturnDecisionInput): Promise<ReturnDecisionResult> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { ok: false, code: 'FORBIDDEN', error: 'אין הרשאה' }
  }
  const admin = createAdminClient()
  const now = new Date()

  const { data: row, error: readError } = await admin
    .from('refunds')
    .select('*')
    .eq('id', input.refundId)
    .maybeSingle()
  if (readError) {
    log.warn('returns.decide_read_failed', { refundId: input.refundId, err: readError.message })
    return { ok: false, code: 'INTERNAL', error: readError.message }
  }
  const request = row ? returnFromRow(row as Record<string, unknown>) : null
  if (!request) return { ok: false, code: 'NOT_FOUND', error: 'הבקשה לא נמצאה' }
  if (!(DECIDABLE as readonly string[]).includes(request.state)) {
    return { ok: false, code: 'STATE_INVALID', error: `הבקשה כבר במצב ${request.state}` }
  }
  const note = input.note?.trim() ?? ''
  const reasonLine = request.reasonCode ? RETURN_REASONS[request.reasonCode].label : request.ground

  if (input.decision === 'reject') {
    const { data: closed, error } = await admin
      .from('refunds')
      .update({
        state: 'rejected',
        decided_at: now.toISOString(),
        decided_by: session.userId,
        internal_note: note.length > 0 ? note : null,
      })
      .eq('id', request.id)
      .in('state', [...DECIDABLE])
      .select('id')
    if (error) {
      log.error('returns.reject_failed', { refundId: request.id, err: error.message })
      return { ok: false, code: 'INTERNAL', error: error.message }
    }
    if (!closed || closed.length === 0) {
      return { ok: false, code: 'STATE_INVALID', error: 'הבקשה כבר טופלה על ידי מישהו אחר.' }
    }

    await admin
      .from('audit_log')
      .insert({
        actor_id: session.userId,
        actor_role: session.role,
        action: 'status_change',
        entity_type: 'refund',
        entity_id: request.id,
        changes: { state: { from: request.state, to: 'rejected' } } as unknown as Json,
        metadata: {
          source: 'return_decision',
          order_id: request.orderId,
          rma: request.rma,
          note: note || null,
        } as unknown as Json,
      })
      .then(({ error: auditError }) => {
        if (auditError)
          log.warn('returns.audit_not_written', { refundId: request.id, err: auditError.message })
      })

    const requestedBy = typeof row?.requested_by === 'string' ? row.requested_by : null
    if (requestedBy) {
      const { data: profile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', requestedBy)
        .maybeSingle()
      if (profile?.email) {
        const notice = buildReturnRejectedNotice({
          rma: request.rma,
          orderRef: request.orderId.slice(0, 8).toUpperCase(),
          reason: note.length > 0 ? note : null,
          customerName: profile.full_name ?? null,
          appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il',
        })
        const sent = await sendEmail({ to: profile.email, ...notice })
        if (!sent.ok && !sent.skipped) {
          log.warn('returns.rejected_mail_failed', { rma: request.rma, reason: sent.reason })
        }
      }
    }

    revalidate(request.orderId)
    return { ok: true, decision: 'rejected', rma: request.rma, creditedAgorot: null }
  }

  // Approve: the destination picks the money path. The customer's ground
  // proposes whether the fee applies; `waiveFee` overrides it.
  const feeFree =
    input.waiveFee === true ||
    (request.reasonCode
      ? !RETURN_REASONS[request.reasonCode].feeApplies
      : request.ground !== 'distance_sale_14d')
  const reason = note.length > 0 ? `${reasonLine}: ${note}` : `${request.rma} ${reasonLine}`

  if (request.destination === 'wallet') {
    const outcome = await refundToWallet({ orderId: request.orderId, reason, now })
    if (!outcome.ok)
      return {
        ok: false,
        code: outcome.code === 'NO_WALLET' ? 'STATE_INVALID' : outcome.code,
        error: outcome.error,
      }
    revalidate(request.orderId)
    return {
      ok: true,
      decision: 'approved',
      rma: request.rma,
      creditedAgorot: outcome.creditedAgorot,
    }
  }

  const outcome = await refundOrder({
    orderId: request.orderId,
    reason,
    isDefectClaim: feeFree,
    now,
  })
  if (!outcome.ok) return { ok: false, code: outcome.code, error: outcome.error }
  revalidate(request.orderId)
  return {
    ok: true,
    decision: 'approved',
    rma: request.rma,
    creditedAgorot: outcome.replay ? null : ilsToAgorot(outcome.refundedIls.toFixed(2)),
  }
}

function revalidate(orderId: string): void {
  revalidatePath('/admin/orders/returns')
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/account/return')
  revalidatePath(`/account/orders/${orderId}`)
}

export async function decideReturnRequest(
  input: ReturnDecisionInput,
): Promise<ReturnDecisionResult> {
  return withActionContext('returns.decide', () => runDecideReturnRequest(input))
}
