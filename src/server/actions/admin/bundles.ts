'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { isMissingBundleTable } from '@/lib/bundles/load'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

// Admin composition of product bundles (STEP 60).
//
// A bundle spends the platform's commission like a discount code, so it sits
// under the `discounts` section: content_uploader cannot reach it and support
// reads only. The page gate is layer 3 of 4 and every action here re-checks,
// because a server action is directly addressable and a page guard does not
// protect it.
//
// Every write is the service role. The tables carry a `has_role('admin')`
// policy as well, but the admin client has no auth.uid(), which is why each
// write below carries its own audit row naming the actor.

/** Postgres: foreign_key_violation. A product id that is not a product. */
const FK_VIOLATION = '23503'

const MIGRATION_HINT = 'טבלאות החבילות עוד לא הוחלו (מיגרציה 265).'

const itemSchema = z.object({
  product_id: z.string().uuid('מזהה מוצר לא תקין'),
  quantity: z.coerce.number().int().min(1, 'כמות לפחות 1').max(99, 'כמות לכל היותר 99'),
})

const schema = z
  .object({
    id: z.string().uuid().optional(),
    name_he: z
      .string()
      .trim()
      .min(2, 'שם החבילה חייב להכיל לפחות 2 תווים')
      .max(120, 'שם החבילה ארוך מדי'),
    description_he: z.string().trim().max(600, 'התיאור ארוך מדי').nullable().optional(),
    // Entered in shekels by a human, stored as agorot.
    discount_ils: z.coerce.number().positive('סכום החיסכון חייב להיות גדול מאפס'),
    is_active: z.coerce.boolean().default(true),
    starts_at: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    items: z.array(itemSchema).min(1, 'חבילה צריכה לפחות מוצר אחד'),
  })
  .superRefine((v, ctx) => {
    if (v.starts_at && v.expires_at && new Date(v.starts_at) >= new Date(v.expires_at)) {
      ctx.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'תאריך הסיום חייב להיות אחרי ההתחלה',
      })
    }
    // "Buy one, save" is a price cut, not a bundle. A set is at least two
    // units: two products, or two of one.
    const units = v.items.reduce((sum, item) => sum + item.quantity, 0)
    if (units < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'חבילה היא לפחות שתי יחידות: שני מוצרים, או שניים מאותו מוצר',
      })
    }
    const seen = new Set<string>()
    for (const item of v.items) {
      if (seen.has(item.product_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'כל מוצר מופיע בחבילה פעם אחת, עם הכמות שלו',
        })
        break
      }
      seen.add(item.product_id)
    }
  })

export type BundleActionState = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  /** The saved bundle's id, so a new one can navigate to its edit page. */
  id?: string
}

/** Shekels in the form, agorot in the database. Converted once, here. */
const toAgorot = (ils: number): number => Math.round(ils * 100)

/**
 * The item rows arrive as one JSON field the form serialises from its own
 * state; a FormData of repeated fields cannot say which quantity belongs to
 * which product once a row is removed from the middle.
 */
function parseItems(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

async function runSaveBundle(
  _prev: BundleActionState,
  formData: FormData,
): Promise<BundleActionState> {
  const session = await requireSection('discounts', 'write')

  const raw = Object.fromEntries(formData) as Record<string, unknown>
  const parsed = schema.safeParse({
    ...raw,
    description_he: raw.description_he === '' ? null : raw.description_he,
    is_active: raw.is_active === 'on' || raw.is_active === 'true',
    starts_at: raw.starts_at === '' ? null : raw.starts_at,
    expires_at: raw.expires_at === '' ? null : raw.expires_at,
    items: parseItems(raw.items_json),
  })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data

  const row = {
    name_he: v.name_he,
    description_he: v.description_he || null,
    discount_agorot: toAgorot(v.discount_ils),
    is_active: v.is_active,
    starts_at: v.starts_at || null,
    expires_at: v.expires_at || null,
  }

  const admin = createAdminClient()
  let bundleId = v.id ?? null

  const saved = v.id
    ? await admin
        .from('product_bundles' as never)
        .update(row as never)
        .eq('id', v.id)
        .select('id')
        .maybeSingle()
    : await admin
        .from('product_bundles' as never)
        .insert({ ...row, created_by: session.userId } as never)
        .select('id')
        .single()

  if (saved.error) {
    if (isMissingBundleTable(saved.error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `שמירה נכשלה: ${saved.error.message}` }
  }
  bundleId = (saved.data as { id: string } | null)?.id ?? bundleId
  if (!bundleId) return { ok: false, error: 'החבילה לא נמצאה.' }

  // The members are replaced wholesale: the form's list IS the bundle, and a
  // diff would have to reason about a row the admin removed. The cart reads
  // the two tables in one request, and a shopper pricing a cart in the
  // instant between the delete and the insert sees an incomplete set, which
  // is no saving rather than a wrong one.
  const cleared = await admin
    .from('product_bundle_items' as never)
    .delete()
    .eq('bundle_id', bundleId)
  if (cleared.error) {
    return { ok: false, error: `עדכון המוצרים בחבילה נכשל: ${cleared.error.message}` }
  }
  const inserted = await admin.from('product_bundle_items' as never).insert(
    v.items.map((item) => ({
      bundle_id: bundleId,
      product_id: item.product_id,
      quantity: item.quantity,
    })) as never,
  )
  if (inserted.error) {
    if (inserted.error.code === FK_VIOLATION) {
      return { ok: false, fieldErrors: { items: ['אחד המוצרים אינו קיים בקטלוג'] } }
    }
    return { ok: false, error: `שמירת המוצרים בחבילה נכשלה: ${inserted.error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: v.id ? 'updated' : 'created',
    entityType: 'product_bundles',
    entityId: bundleId,
    changes: {
      name_he: row.name_he,
      discount_agorot: row.discount_agorot,
      is_active: row.is_active,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
      items: v.items,
    },
  })

  revalidateBundles(bundleId)
  return { ok: true, id: bundleId }
}

/** The kill switch: one flag, no form. */
async function runSetBundleActive(id: string, isActive: boolean): Promise<BundleActionState> {
  const session = await requireSection('discounts', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { error } = await createAdminClient()
    .from('product_bundles' as never)
    .update({ is_active: isActive } as never)
    .eq('id', id)
  if (error) {
    if (isMissingBundleTable(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `עדכון נכשל: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'product_bundles',
    entityId: id,
    changes: { is_active: isActive },
  })

  revalidateBundles(id)
  return { ok: true, id }
}

/**
 * Hard delete. Unlike a campaign, a bundle has no redemption ledger to
 * reference it: the orders that used it keep their own row in
 * `order_bundle_discounts` with the name copied and `bundle_id` set to null
 * by the database, so nothing about a past order is lost.
 */
async function runDeleteBundle(id: string): Promise<BundleActionState> {
  const session = await requireSection('discounts', 'write')
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'מזהה לא תקין' }

  const { error } = await createAdminClient()
    .from('product_bundles' as never)
    .delete()
    .eq('id', id)
  if (error) {
    if (isMissingBundleTable(error)) return { ok: false, error: MIGRATION_HINT }
    return { ok: false, error: `מחיקה נכשלה: ${error.message}` }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'product_bundles',
    entityId: id,
  })

  revalidateBundles(id)
  return { ok: true }
}

/**
 * The storefront reads bundles through the catalogue cache (the product
 * page's offer block); the cart reads them live. Both the list and the cart
 * page are revalidated so an admin checking their own change sees it.
 */
function revalidateBundles(id: string) {
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/bundles')
  revalidatePath(`/admin/bundles/${id}`)
  revalidatePath('/cart')
}

export async function saveBundle(
  prev: BundleActionState,
  formData: FormData,
): Promise<BundleActionState> {
  return withActionContext('admin.bundle.save', () => runSaveBundle(prev, formData))
}

export async function setBundleActive(id: string, isActive: boolean): Promise<BundleActionState> {
  return withActionContext('admin.bundle.set_active', () => runSetBundleActive(id, isActive))
}

export async function deleteBundle(id: string): Promise<BundleActionState> {
  return withActionContext('admin.bundle.delete', () => runDeleteBundle(id))
}
