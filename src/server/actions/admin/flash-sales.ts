'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { isMissingFlashSchema } from '@/lib/flash-sales/rules'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

// Admin composition of flash sales (STEP 61).
//
// A flash price is sold below the product's ordinary price, so it sits under
// the `discounts` section like bundles and campaigns: content_uploader cannot
// reach it and support reads only. The page gate is layer 3 of 4 and every
// action here re-checks, because a server action is directly addressable.
//
// Every write is the service role. The table carries a `has_role('admin')`
// policy as well, but the admin client has no auth.uid(), which is why each
// write below carries its own audit row naming the actor.

/** Postgres: foreign_key_violation. A product id that is not a product. */
const FK_VIOLATION = '23503'

const MIGRATION_HINT = 'טבלאות מבצעי הבזק עוד לא הוחלו (מיגרציה 266).'

const schema = z
  .object({
    id: z.string().uuid().optional(),
    product_id: z.string().uuid('בחרו מוצר'),
    name_he: z
      .string()
      .trim()
      .min(2, 'שם המבצע חייב להכיל לפחות 2 תווים')
      .max(120, 'שם המבצע ארוך מדי'),
    // Entered in shekels by a human, stored as agorot.
    price_ils: z.coerce.number().positive('מחיר הבזק חייב להיות גדול מאפס'),
    reference_ils: z.coerce.number().positive('מחיר "לפני" חייב להיות גדול מאפס').nullable(),
    allocation: z.coerce
      .number()
      .int('כמות יחידות היא מספר שלם')
      .min(1, 'לפחות יחידה אחת')
      .max(100000, 'יותר מדי יחידות'),
    max_per_claim: z.coerce.number().int().min(1, 'לפחות 1').max(10, 'לכל היותר 10 לקונה'),
    hold_minutes: z.coerce.number().int().min(1, 'לפחות דקה').max(60, 'לכל היותר 60 דקות'),
    starts_at: z.string().min(1, 'נא לבחור תחילת מבצע'),
    ends_at: z.string().min(1, 'נא לבחור סיום מבצע'),
    is_active: z.coerce.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const start = Date.parse(v.starts_at)
    const end = Date.parse(v.ends_at)
    if (Number.isNaN(start)) {
      ctx.addIssue({ code: 'custom', path: ['starts_at'], message: 'תאריך התחלה לא תקין' })
    }
    if (Number.isNaN(end)) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'תאריך סיום לא תקין' })
    }
    if (!Number.isNaN(start) && !Number.isNaN(end) && start >= end) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'הסיום חייב להיות אחרי ההתחלה',
      })
    }
    if (v.reference_ils !== null && v.reference_ils <= v.price_ils) {
      ctx.addIssue({
        code: 'custom',
        path: ['reference_ils'],
        message: 'מחיר "לפני" חייב להיות גבוה ממחיר הבזק',
      })
    }
  })

export type FlashSaleActionState = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  /** The saved sale's id, so a new one can navigate to its edit page. */
  id?: string
}

/** Shekels in the form, agorot in the database. Converted once, here. */
const toAgorot = (ils: number): number => Math.round(ils * 100)

const emptyToNull = (value: unknown): unknown =>
  value === '' || value === undefined ? null : value

async function runSaveFlashSale(
  _prev: FlashSaleActionState,
  formData: FormData,
): Promise<FlashSaleActionState> {
  const session = await requireSection('discounts', 'write')

  const raw = Object.fromEntries(formData) as Record<string, unknown>
  const parsed = schema.safeParse({
    ...raw,
    id: raw.id === '' ? undefined : raw.id,
    reference_ils: emptyToNull(raw.reference_ils),
    max_per_claim: raw.max_per_claim === '' ? 1 : raw.max_per_claim,
    hold_minutes: raw.hold_minutes === '' ? 10 : raw.hold_minutes,
    is_active: raw.is_active === 'on' || raw.is_active === 'true',
  })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data

  const row = {
    product_id: v.product_id,
    name_he: v.name_he,
    price_agorot: toAgorot(v.price_ils),
    reference_agorot: v.reference_ils === null ? null : toAgorot(v.reference_ils),
    allocation: v.allocation,
    max_per_claim: v.max_per_claim,
    hold_minutes: v.hold_minutes,
    starts_at: new Date(v.starts_at).toISOString(),
    ends_at: new Date(v.ends_at).toISOString(),
    is_active: v.is_active,
  }

  const admin = createAdminClient()
  const saved = v.id
    ? await admin
        .from('flash_sales' as never)
        .update(row as never)
        .eq('id', v.id)
        .select('id')
        .maybeSingle()
    : await admin
        .from('flash_sales' as never)
        .insert({ ...row, created_by: session.userId } as never)
        .select('id')
        .single()

  if (saved.error) {
    if (isMissingFlashSchema(saved.error)) return { ok: false, error: MIGRATION_HINT }
    if (saved.error.code === FK_VIOLATION) {
      return { ok: false, fieldErrors: { product_id: ['המוצר אינו קיים בקטלוג'] } }
    }
    return { ok: false, error: `שמירה נכשלה: ${saved.error.message}` }
  }
  const saleId = (saved.data as { id: string } | null)?.id ?? v.id ?? null
  if (!saleId) return { ok: false, error: 'המבצע לא נמצא.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: v.id ? 'updated' : 'created',
    entityType: 'flash_sales',
    entityId: saleId,
    changes: row,
  })

  revalidateFlashSales(saleId)
  return { ok: true, id: saleId }
}

/** The kill switch: one flag, no form. Switching off lapses the waiting room on the next sweep. */
async function runSetFlashSaleActive(id: string, isActive: boolean): Promise<FlashSaleActionState> {
  const session = await requireSection('discounts', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { error } = await createAdminClient()
    .from('flash_sales' as never)
    .update({ is_active: isActive } as never)
    .eq('id', id)
  if (error) {
    if (isMissingFlashSchema(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `עדכון נכשל: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'flash_sales',
    entityId: id,
    changes: { is_active: isActive },
  })

  revalidateFlashSales(id)
  return { ok: true, id }
}

/**
 * Hard delete. The claims cascade with the sale; a paid order keeps its own
 * line at the price it was charged, so nothing about a past order is lost.
 */
async function runDeleteFlashSale(id: string): Promise<FlashSaleActionState> {
  const session = await requireSection('discounts', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { error } = await createAdminClient()
    .from('flash_sales' as never)
    .delete()
    .eq('id', id)
  if (error) {
    if (isMissingFlashSchema(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `מחיקה נכשלה: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'flash_sales',
    entityId: id,
  })

  revalidateFlashSales(id)
  return { ok: true }
}

/**
 * The banner and the product notice read through the catalogue cache; the
 * sale page and the cart read live. Both admin pages are revalidated so an
 * admin checking their own change sees it.
 */
function revalidateFlashSales(id: string) {
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/flash-sales')
  revalidatePath(`/admin/flash-sales/${id}`)
  revalidatePath(`/flash/${id}`)
}

export async function saveFlashSale(
  prev: FlashSaleActionState,
  formData: FormData,
): Promise<FlashSaleActionState> {
  return withActionContext('admin.flash_sale.save', () => runSaveFlashSale(prev, formData))
}

export async function setFlashSaleActive(
  id: string,
  isActive: boolean,
): Promise<FlashSaleActionState> {
  return withActionContext('admin.flash_sale.set_active', () => runSetFlashSaleActive(id, isActive))
}

export async function deleteFlashSale(id: string): Promise<FlashSaleActionState> {
  return withActionContext('admin.flash_sale.delete', () => runDeleteFlashSale(id))
}
