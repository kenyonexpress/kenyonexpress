'use server'

import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// The two decisions a human makes on the referral queue.
//
// Both go through the same RPCs the automatic path uses. A queue that pays
// through its own code is a queue whose payouts are not covered by the tests
// that cover the normal route, and the two drift the first time one is edited.

export type ReferralActionState = { ok: boolean; error?: string }

async function runApproveReferral(id: string): Promise<ReferralActionState> {
  const session = await requireSection('discounts', 'write')
  const admin = createAdminClient()

  // fn_pay_referral is idempotent and re-locks the row, so a double click
  // credits nothing twice.
  const { data, error } = await admin.rpc(
    'fn_pay_referral' as never,
    {
      p_referral_id: id,
      p_approved_by: session.userId,
    } as never,
  )

  if (error) return { ok: false, error: `אישור נכשל: ${error.message}` }
  const result = data as { ok?: boolean; reason?: string } | null
  if (result && result.ok === false) return { ok: false, error: `אישור נדחה: ${result.reason}` }

  revalidatePath('/admin/referrals')
  return { ok: true }
}

async function runRejectReferral(id: string, reason: string): Promise<ReferralActionState> {
  const session = await requireSection('discounts', 'write')
  if (!reason.trim()) return { ok: false, error: 'נדרשת סיבת דחייה' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc(
    'fn_reject_referral' as never,
    {
      p_referral_id: id,
      p_reason: reason.trim(),
      p_rejected_by: session.userId,
    } as never,
  )

  if (error) return { ok: false, error: `דחייה נכשלה: ${error.message}` }
  const result = data as { ok?: boolean; reason?: string } | null
  if (result && result.ok === false) return { ok: false, error: `דחייה נכשלה: ${result.reason}` }

  revalidatePath('/admin/referrals')
  return { ok: true }
}

export async function approveReferral(id: string): Promise<ReferralActionState> {
  return withActionContext('admin.referral.approve', () => runApproveReferral(id))
}

export async function rejectReferral(id: string, reason: string): Promise<ReferralActionState> {
  return withActionContext('admin.referral.reject', () => runRejectReferral(id, reason))
}
