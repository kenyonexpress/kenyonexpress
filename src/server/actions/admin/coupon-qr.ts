'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { parseQrBatchInput } from '@/lib/coupons/qr-batch-input'
import { generateUnitCodes } from '@/lib/coupons/unit-codes'
import { growthClient } from '@/lib/growth/client'
import { withActionContext } from '@/lib/observability/action-context'
import { revalidatePath } from 'next/cache'

// Batch generation of printed QR coupon codes (migration 182).
//
// Same section gate as the campaigns themselves: a batch spends the same
// platform commission a campaign does, only through a printer. The action
// re-checks for itself because a server action is directly addressable and the
// page guard does not protect it.

export type CouponQrActionState = {
  ok: boolean
  batchId?: string
  error?: string
  fieldErrors?: Record<string, string[]>
}

async function runGenerateCouponQrBatch(
  _prev: CouponQrActionState,
  formData: FormData,
): Promise<CouponQrActionState> {
  const session = await requireSection('discounts', 'write')

  // Schema (and the "deadline must be in the future" rule) live in
  // lib/coupons/qr-batch-input.ts so they are tested without this action.
  const parsed = parseQrBatchInput(Object.fromEntries(formData))
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors }
  const v = parsed.value

  const growth = growthClient()

  // The FK would catch a bad id too, but "הקמפיין לא נמצא" beats a constraint
  // string, and archived campaigns must not grow new print runs.
  const { data: campaign } = await growth.campaigns().byId(v.campaign_id)
  if (!campaign) return { ok: false, error: 'הקמפיין לא נמצא או הועבר לארכיון' }

  // Generate, then subtract what the table already holds, then top up. Two
  // rounds cover any realistic collision count against a 10^7 keyspace; a
  // second collision on the SAME code between our check and the insert is
  // caught by the unique constraint below and reported, not retried silently.
  let codes = generateUnitCodes(v.quantity)
  const { data: taken, error: takenError } = await growth.qrBatches().existingCodes(codes)
  if (takenError) return { ok: false, error: `בדיקת הקודים נכשלה: ${takenError.message}` }
  if (taken && taken.length > 0) {
    const takenSet = new Set(taken.map((row) => row.code))
    const fresh = codes.filter((code) => !takenSet.has(code))
    codes = [
      ...fresh,
      ...generateUnitCodes(v.quantity - fresh.length, {
        exclude: new Set([...takenSet, ...fresh]),
      }),
    ]
  }

  const { data: batch, error: batchError } = await growth.qrBatches().insert({
    campaign_id: v.campaign_id,
    label: v.label,
    quantity: v.quantity,
    created_by: session.userId,
  })
  if (batchError || !batch) {
    return { ok: false, error: `יצירת הקבוצה נכשלה: ${batchError?.message ?? 'ללא פירוט'}` }
  }

  // One insert call: a single statement is atomic, so failure leaves the batch
  // row childless (visible as 0 קודים in the list) rather than half-filled.
  // `expires_at` is 217's per-code deadline (live in production since
  // 2026-09-09). NULL means the campaign window alone governs, which is what
  // every batch before this field meant.
  const { error: codesError } = await growth.qrBatches().insertCodes(
    codes.map((code) => ({
      batch_id: batch.id,
      campaign_id: v.campaign_id,
      code,
      expires_at: v.expires_at,
    })),
  )
  if (codesError) {
    return {
      ok: false,
      error: `יצירת הקודים נכשלה (${codesError.message}). הקבוצה נוצרה בלי קודים. נסה שוב ומחק אותה ידנית.`,
    }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'coupon_qr_batches',
    entityId: batch.id,
    changes: {
      campaign_id: v.campaign_id,
      campaign_code: campaign.code,
      label: v.label,
      quantity: v.quantity,
      expires_at: v.expires_at,
    },
  })

  revalidatePath(`/admin/discounts/${v.campaign_id}`)
  return { ok: true, batchId: batch.id }
}

export async function generateCouponQrBatch(
  _prev: CouponQrActionState,
  formData: FormData,
): Promise<CouponQrActionState> {
  return withActionContext('admin.coupon_qr.generate_batch', () =>
    runGenerateCouponQrBatch(_prev, formData),
  )
}
