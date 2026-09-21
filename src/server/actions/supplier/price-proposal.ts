'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { parseIls } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { validateProposalNote, validateProposedPrice } from '@/lib/supplier/price-proposals'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * A supplier proposes a new sticker price for one of their products; an admin
 * decides (src/server/actions/admin/supplier-price-proposals.ts).
 *
 * Same shape as the contact-change request: the row is filed through the
 * supplier's own session so 232's RLS is what proves ownership (the INSERT
 * policy joins `products.supplier_id`), and the service role is used only to
 * READ the product's current price, which the supplier may see anyway.
 * Money is integer agorot from `parseIls` at this edge and never a float.
 */

const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])
const UNIQUE_VIOLATION = '23505'
const RLS_DENIED = '42501'

export type PriceProposalState = { ok: boolean; message?: string; error?: string }

const uuid = z.string().uuid()

async function runProposePrice(
  productId: string,
  priceIls: string,
  note: string,
): Promise<PriceProposalState> {
  const session = await requireSupplierRole('owner', '/supplier/products')
  if (!uuid.safeParse(productId).success) return { ok: false, error: 'מוצר לא מוכר.' }

  const admin = createAdminClient()
  const { data: product, error: readError } = await admin
    .from('products')
    .select('id, supplier_id, kenyon_price')
    .eq('id', productId)
    .maybeSingle()
  if (readError) {
    log.warn('supplier.price_proposal_product_read_failed', { reason: readError.message })
    return { ok: false, error: 'לא הצלחנו לטעון את המוצר. נסו שוב.' }
  }
  if (!product || product.supplier_id !== session.supplierId) {
    return { ok: false, error: 'המוצר אינו משויך לעסק שלכם.' }
  }

  const currentAgorot =
    product.kenyon_price === null || product.kenyon_price === undefined
      ? null
      : parseIls(String(product.kenyon_price))
  const price = validateProposedPrice(priceIls, currentAgorot)
  if (!price.ok) return { ok: false, error: price.error }
  const parsedNote = validateProposalNote(note)
  if (!parsedNote.ok) return { ok: false, error: parsedNote.error }

  const supabase = await createClient()
  const { error } = await supabase.from('supplier_price_proposals' as never).insert({
    supplier_id: session.supplierId,
    product_id: product.id,
    current_kenyon_price_agorot: currentAgorot,
    proposed_kenyon_price_agorot: price.agorot,
    note: parsedNote.note,
    requested_by: session.userId,
    status: 'pending',
  } as never)
  if (error) {
    if (TABLE_ABSENT.has(error.code ?? '')) {
      log.warn('supplier.price_proposal_table_absent', { code: error.code })
      return { ok: false, error: 'הצעות מחיר עדיין לא זמינות.' }
    }
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, error: 'כבר קיימת הצעה פתוחה למוצר הזה. בטלו אותה כדי להגיש חדשה.' }
    }
    if (error.code === RLS_DENIED) {
      return { ok: false, error: 'אין הרשאה להגיש הצעה למוצר הזה.' }
    }
    log.warn('supplier.price_proposal_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'created',
    entityType: 'supplier_price_proposal',
    entityId: product.id,
    changes: {
      proposed_kenyon_price_agorot: price.agorot,
      current_kenyon_price_agorot: currentAgorot,
    },
    metadata: { via: 'supplier_portal', supplier_id: session.supplierId },
  })
  revalidatePath('/supplier/products')
  return { ok: true, message: 'ההצעה נשלחה ותיבדק על ידינו.' }
}

async function runWithdrawPriceProposal(proposalId: string): Promise<PriceProposalState> {
  const session = await requireSupplierRole('owner', '/supplier/products')
  if (!uuid.safeParse(proposalId).success) return { ok: false, error: 'בקשה לא מוכרת.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_price_proposals' as never)
    .update({ status: 'withdrawn', decided_at: new Date().toISOString() } as never)
    .eq('id', proposalId)
    .eq('supplier_id', session.supplierId)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    log.warn('supplier.price_proposal_withdraw_failed', { reason: error.message })
    return { ok: false, error: 'הביטול נכשל.' }
  }
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: 'ההצעה לא נמצאה או כבר טופלה.' }
  }
  await writeAuditLog({
    actorId: session.userId,
    actorRole: 'vendor',
    action: 'status_change',
    entityType: 'supplier_price_proposal',
    entityId: proposalId,
    changes: { status: { from: 'pending', to: 'withdrawn' } },
    metadata: { via: 'supplier_portal', supplier_id: session.supplierId },
  })
  revalidatePath('/supplier/products')
  return { ok: true, message: 'ההצעה בוטלה.' }
}

export async function proposePrice(
  productId: string,
  priceIls: string,
  note: string,
): Promise<PriceProposalState> {
  return withActionContext('supplier.price_proposal.create', () =>
    runProposePrice(productId, priceIls, note),
  )
}

export async function withdrawPriceProposal(proposalId: string): Promise<PriceProposalState> {
  return withActionContext('supplier.price_proposal.withdraw', () =>
    runWithdrawPriceProposal(proposalId),
  )
}
