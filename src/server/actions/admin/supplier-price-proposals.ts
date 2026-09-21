'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { type ProductMoneyType, buildProductMoneyWrite } from '@/lib/commerce/product-money'
import { agorot, agorotToIls } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * An admin decides a supplier's price proposal.
 *
 * Approval does not write the proposed number into `kenyon_price`. It hands
 * the number to `buildProductMoneyWrite`, the one module the admin form and
 * checkout already trust, with every other money input taken from the product
 * as it is now, and writes what THAT returns: the full price, the split, the
 * coupon price, all recomputed together. A proposal can therefore never leave
 * a product whose columns disagree with each other, which a direct UPDATE of
 * one column could.
 */

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
const MONEY_TYPES: readonly string[] = ['coupon', 'physical', 'recurring']

const decisionSchema = z.object({
  id: z.string().uuid(),
  note: z.string().max(1000).optional(),
})

export type ProposalDecisionState = { error: string } | { success: string } | null

type ProposalRow = {
  id: string
  supplier_id: string
  product_id: string
  current_kenyon_price_agorot: number | null
  proposed_kenyon_price_agorot: number
  status: string
}

async function loadPending(id: string): Promise<{ row?: ProposalRow; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_price_proposals' as never)
    .select(
      'id, supplier_id, product_id, current_kenyon_price_agorot, proposed_kenyon_price_agorot, status',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) return { error: 'הצעות מחיר עדיין לא זמינות.' }
    log.warn('admin.price_proposal_read_failed', { reason: error.message })
    return { error: 'קריאת ההצעה נכשלה.' }
  }
  const row = data as ProposalRow | null
  if (!row) return { error: 'ההצעה לא נמצאה.' }
  if (row.status !== 'pending') return { error: 'ההצעה כבר טופלה.' }
  return { row }
}

async function markDecided(
  row: ProposalRow,
  status: 'approved' | 'rejected',
  session: AdminSessionInfo,
  note: string | undefined,
): Promise<string | null> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('supplier_price_proposals' as never)
    .update({
      status,
      decided_by: session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    } as never)
    .eq('id', row.id)
  if (error) {
    log.error('admin.price_proposal_mark_failed', { proposalId: row.id, reason: error.message })
    return error.message
  }
  return null
}

async function runApprovePriceProposal(id: string, note?: string): Promise<ProposalDecisionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = decisionSchema.safeParse({ id, note })
  if (!parsed.success) return { error: 'מזהה לא תקין' }
  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (loadError || !row) return { error: loadError ?? 'ההצעה לא נמצאה.' }

  const admin = createAdminClient()
  const { data: product, error: productError } = await admin
    .from('products')
    .select(
      'id, supplier_id, type, kenyon_price, platform_percent, supplier_split_percent, discount_percent, coupon_price_ils, coupon_expiry_days, recurring_amount_agorot, billing_interval, billing_interval_count',
    )
    .eq('id', row.product_id)
    .maybeSingle()
  if (productError || !product) {
    log.warn('admin.price_proposal_product_read_failed', { reason: productError?.message })
    return { error: 'המוצר לא נמצא. ההצעה נשארה פתוחה.' }
  }
  if (product.supplier_id !== row.supplier_id) {
    log.error('admin.price_proposal_supplier_mismatch', { proposalId: row.id })
    return { error: 'המוצר כבר אינו שייך לספק שהגיש. ההצעה נשארה פתוחה.' }
  }
  if (!MONEY_TYPES.includes(product.type)) {
    return { error: 'לסוג המוצר הזה אין מסלול תמחור אוטומטי. עדכנו ידנית בטופס המוצר.' }
  }

  const money = buildProductMoneyWrite({
    type: product.type as ProductMoneyType,
    kenyonPrice: agorotToIls(agorot(row.proposed_kenyon_price_agorot)),
    platformPercent: product.platform_percent,
    supplierSplitPercent: product.supplier_split_percent,
    discountPercent: product.discount_percent,
    couponPriceIls: product.coupon_price_ils,
    couponExpiryDays: product.coupon_expiry_days,
    recurringAmountAgorot: product.recurring_amount_agorot,
    billingInterval: product.billing_interval,
    billingIntervalCount: product.billing_interval_count ?? 1,
  })
  if (!money.ok) return { error: `המחיר המוצע אינו עובר את חוקי התמחור: ${money.message}` }

  const { error: applyError } = await admin
    .from('products')
    .update(money.fields as never)
    .eq('id', product.id)
  if (applyError) {
    log.warn('admin.price_proposal_apply_failed', { reason: applyError.message })
    return { error: 'עדכון המחיר נכשל. ההצעה נשארה פתוחה.' }
  }
  updateTag(CATALOGUE_TAG)

  const markError = await markDecided(row, 'approved', session, parsed.data.note)
  if (markError) return { error: 'המחיר עודכן אך סימון ההצעה נכשל. אשרו שוב כדי לסגור אותה.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'updated',
    entityType: 'product',
    entityId: product.id,
    changes: {
      kenyon_price: {
        from: product.kenyon_price,
        to: agorotToIls(agorot(row.proposed_kenyon_price_agorot)),
      },
    },
    metadata: { via: 'supplier_price_proposal', proposal_id: row.id, supplier_id: row.supplier_id },
  })
  revalidatePath('/admin/suppliers/price-proposals')
  revalidatePath('/supplier/products')
  return { success: 'ההצעה אושרה והמחיר עודכן.' }
}

async function runRejectPriceProposal(id: string, note?: string): Promise<ProposalDecisionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  const parsed = decisionSchema.safeParse({ id, note })
  if (!parsed.success) return { error: 'מזהה לא תקין' }
  const { row, error: loadError } = await loadPending(parsed.data.id)
  if (loadError || !row) return { error: loadError ?? 'ההצעה לא נמצאה.' }
  const markError = await markDecided(row, 'rejected', session, parsed.data.note)
  if (markError) return { error: 'הדחייה נכשלה.' }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'admin',
    action: 'status_change',
    entityType: 'supplier_price_proposal',
    entityId: row.id,
    changes: { status: { from: 'pending', to: 'rejected' } },
    metadata: { supplier_id: row.supplier_id, product_id: row.product_id },
  })
  revalidatePath('/admin/suppliers/price-proposals')
  revalidatePath('/supplier/products')
  return { success: 'ההצעה נדחתה.' }
}

export async function approvePriceProposal(
  id: string,
  note?: string,
): Promise<ProposalDecisionState> {
  return withActionContext('admin.price_proposal.approve', () => runApprovePriceProposal(id, note))
}

export async function rejectPriceProposal(
  id: string,
  note?: string,
): Promise<ProposalDecisionState> {
  return withActionContext('admin.price_proposal.reject', () => runRejectPriceProposal(id, note))
}
