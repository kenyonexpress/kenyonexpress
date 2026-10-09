'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { isScannable } from '@/lib/admin/voucher-view'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'

export type AdminVoucherLookup = {
  id: string
  code: string
  status: string
  productName: string | null
  customerName: string | null
  supplierName: string | null
  supplierId: string | null
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
  expiresAt: string
  redeemedAt: string | null
  scannable: boolean
}

export type AdminVoucherLookupState = { error: string } | { voucher: AdminVoucherLookup } | null

export type AdminVoucherRedeemState = { error: string } | { success: string; code: string } | null

type VoucherLookupRow = {
  id: string
  code: string
  status: string
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  expires_at: string
  redeemed_at: string | null
  supplier_id: string | null
  product: { name_he: string | null } | null
  supplier: { name: string | null } | null
}

function toLookup(row: VoucherLookupRow, now: Date): AdminVoucherLookup {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    productName: row.product?.name_he ?? null,
    customerName: null,
    supplierName: row.supplier?.name ?? null,
    supplierId: row.supplier_id,
    faceValueAgorot: row.face_value_agorot,
    couponPriceAgorot: row.coupon_price_agorot,
    remainingAmountDueAgorot: row.remaining_amount_due_agorot,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    scannable: isScannable({ status: row.status, expires_at: row.expires_at }, now),
  }
}

async function loadByCode(code: string): Promise<VoucherLookupRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vouchers')
    .select(
      `id, code, status, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, expires_at, redeemed_at, supplier_id,
       product:products(name_he),
       supplier:suppliers(name)`,
    )
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VoucherLookupRow | null) ?? null
}

async function runLookupAdminVoucher(
  _: AdminVoucherLookupState,
  formData: FormData,
): Promise<AdminVoucherLookupState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('catalog', 'read')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-lookup:${session.userId}`, 60, 3600)
  if (!allowed) return { error: 'יותר מדי בדיקות, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }

  try {
    const row = await loadByCode(code)
    if (!row) return { error: 'קוד שובר לא נמצא' }
    return { voucher: toLookup(row, new Date()) }
  } catch {
    return { error: 'לא ניתן לבדוק את השובר כרגע' }
  }
}

async function runRedeemAdminVoucher(
  _: AdminVoucherRedeemState,
  formData: FormData,
): Promise<AdminVoucherRedeemState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('orders', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-voucher-redeem:${session.userId}`, 30, 3600)
  if (!allowed) return { error: 'יותר מדי מימושים, נסו שוב בעוד רגע' }

  const code = normalizeVoucherCode(String(formData.get('code') ?? ''))
  const reason = String(formData.get('reason') ?? '').trim()
  if (code.length < 6) return { error: 'קוד שובר לא תקין' }
  if (reason.length < 3) return { error: 'חובה לציין סיבה למימוש ידני' }

  const admin = createAdminClient()
  let before: VoucherLookupRow | null
  try {
    before = await loadByCode(code)
  } catch {
    return { error: 'לא ניתן לקרוא את השובר כרגע' }
  }
  if (!before) return { error: 'קוד שובר לא נמצא' }

  const now = new Date()
  if (!isScannable({ status: before.status, expires_at: before.expires_at }, now)) {
    return { error: 'השובר אינו ניתן למימוש' }
  }

  const redeemedAt = now.toISOString()
  const { data: updated, error: updateError } = await admin
    .from('vouchers')
    .update({
      status: 'redeemed',
      redeemed_at: redeemedAt,
      redeemed_by_user_id: session.userId,
      redeemed_by_supplier_id: before.supplier_id,
    })
    .eq('id', before.id)
    .eq('status', 'issued')
    .select('id, status, redeemed_at')
    .maybeSingle()

  if (updateError) return { error: 'מימוש השובר נכשל' }
  if (!updated) return { error: 'השובר כבר לא ניתן למימוש' }

  await admin.from('voucher_redemptions').insert({
    voucher_id: before.id,
    supplier_id: before.supplier_id,
    scanned_by: session.userId,
    code_entered: code,
    outcome: 'success',
    scan_method: 'manual',
    amount_collected_agorot: before.remaining_amount_due_agorot,
    metadata: { source: 'admin_manual', reason },
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'vouchers',
    entityId: before.id,
    changes: {
      old: { status: before.status, redeemed_at: before.redeemed_at },
      new: { status: 'redeemed', redeemed_at: redeemedAt, reason },
    },
  })

  return { success: 'השובר מומש ידנית', code: before.code }
}

export async function lookupAdminVoucher(
  state: AdminVoucherLookupState,
  formData: FormData,
): Promise<AdminVoucherLookupState> {
  return withActionContext('admin.voucher.lookup', () => runLookupAdminVoucher(state, formData))
}

export async function redeemAdminVoucher(
  state: AdminVoucherRedeemState,
  formData: FormData,
): Promise<AdminVoucherRedeemState> {
  return withActionContext('admin.voucher.redeem', () => runRedeemAdminVoucher(state, formData))
}
