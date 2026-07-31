'use server'

import { requireSection } from '@/lib/admin/rbac'
import { normalizeDiscountCode } from '@/lib/growth/discount'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Admin CRUD for site-wide discount campaigns.
//
// Every write here spends the platform's commission, so the section is gated to
// admin/super_admin: content_uploader has no access at all and support is
// read-only (see lib/admin/permissions.ts). The page gate is layer 3 of 4 and
// this action re-checks for itself, because a server action is directly
// addressable and a page guard does not protect it.

const AMOUNT_HINT = 'סכומים נשמרים באגורות'

const schema = z
  .object({
    id: z.string().uuid().optional(),
    code: z
      .string()
      .min(3, 'קוד חייב להכיל לפחות 3 תווים')
      .max(40, 'קוד ארוך מדי')
      // Latin, digits, dash and underscore only. A Hebrew code is unusable:
      // it cannot be dictated over the phone, and it arrives percent-encoded
      // from half the places a shopper pastes it from.
      .regex(/^[A-Za-z0-9_-]+$/, 'קוד יכול להכיל אותיות לועזיות, מספרים, מקף וקו תחתון בלבד'),
    name: z.string().min(2, 'שם הקמפיין נדרש'),
    description: z.string().nullable().optional(),

    kind: z.enum(['percent', 'fixed']),
    // Entered as a percentage by a human, stored as basis points.
    percent: z.coerce.number().min(0.01).max(100).nullable().optional(),
    // Entered in shekels by a human, stored as agorot.
    amount_ils: z.coerce.number().positive().nullable().optional(),
    max_discount_ils: z.coerce.number().positive().nullable().optional(),
    min_order_ils: z.coerce.number().min(0).default(0),

    starts_at: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),

    max_uses: z.coerce.number().int().positive().nullable().optional(),
    max_uses_per_user: z.coerce.number().int().min(1).default(1),

    allow_stacking: z.coerce.boolean().default(false),
    is_active: z.coerce.boolean().default(true),
  })
  // The DB has the same CHECK. Validating here too means the admin sees a field
  // error instead of a constraint violation, and the constraint stays as the
  // backstop for anything that does not come through this form.
  .superRefine((v, ctx) => {
    if (v.kind === 'percent' && (v.percent === null || v.percent === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['percent'], message: 'אחוז הנחה נדרש' })
    }
    if (v.kind === 'fixed' && (v.amount_ils === null || v.amount_ils === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount_ils'],
        message: `סכום הנחה נדרש (${AMOUNT_HINT})`,
      })
    }
    if (v.kind === 'fixed' && v.max_discount_ils) {
      ctx.addIssue({
        code: 'custom',
        path: ['max_discount_ils'],
        message: 'תקרה רלוונטית רק להנחה באחוזים',
      })
    }
    if (v.starts_at && v.expires_at && new Date(v.starts_at) >= new Date(v.expires_at)) {
      ctx.addIssue({
        code: 'custom',
        path: ['expires_at'],
        message: 'תאריך הסיום חייב להיות אחרי ההתחלה',
      })
    }
  })

export type DiscountActionState = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

/** Shekels in the form, agorot in the database. Converted once, here. */
const toAgorot = (ils: number | null | undefined): number | null =>
  ils === null || ils === undefined ? null : Math.round(ils * 100)

export async function saveDiscountCampaign(
  _prev: DiscountActionState,
  formData: FormData,
): Promise<DiscountActionState> {
  const session = await requireSection('discounts', 'write')

  const raw = Object.fromEntries(formData) as Record<string, unknown>
  const parsed = schema.safeParse({
    ...raw,
    allow_stacking: raw.allow_stacking === 'on' || raw.allow_stacking === 'true',
    is_active: raw.is_active === 'on' || raw.is_active === 'true',
    percent: raw.percent === '' ? null : raw.percent,
    amount_ils: raw.amount_ils === '' ? null : raw.amount_ils,
    max_discount_ils: raw.max_discount_ils === '' ? null : raw.max_discount_ils,
    max_uses: raw.max_uses === '' ? null : raw.max_uses,
    starts_at: raw.starts_at === '' ? null : raw.starts_at,
    expires_at: raw.expires_at === '' ? null : raw.expires_at,
  })

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data

  const row = {
    code: normalizeDiscountCode(v.code),
    name: v.name,
    description: v.description || null,
    kind: v.kind,
    // Basis points. 12.5% becomes 1250, and there is no float left anywhere
    // downstream to confuse with 0.125.
    percent_bp: v.kind === 'percent' ? Math.round((v.percent ?? 0) * 100) : null,
    amount_agorot: v.kind === 'fixed' ? toAgorot(v.amount_ils) : null,
    max_discount_agorot: v.kind === 'percent' ? toAgorot(v.max_discount_ils) : null,
    min_order_agorot: toAgorot(v.min_order_ils) ?? 0,
    starts_at: v.starts_at || null,
    expires_at: v.expires_at || null,
    max_uses: v.max_uses ?? null,
    max_uses_per_user: v.max_uses_per_user,
    allow_stacking: v.allow_stacking,
    is_active: v.is_active,
    created_by: session.userId,
  }

  const admin = createAdminClient()

  // used_count is deliberately absent from both branches. It belongs to
  // fn_claim_discount, which holds a row lock while it moves; an admin form
  // writing it would be the read-then-write race the ledger exists to prevent,
  // reintroduced from a different direction.
  const { error } = v.id
    ? await admin.from('discount_campaigns').update(row).eq('id', v.id)
    : await admin.from('discount_campaigns').insert(row)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'קוד ההנחה הזה כבר קיים' }
    return { ok: false, error: `שמירה נכשלה: ${error.message}` }
  }

  revalidatePath('/admin/discounts')
  return { ok: true }
}

/**
 * Soft delete. A campaign with redemptions can never be hard deleted: the
 * ledger references it with ON DELETE RESTRICT, on purpose, because deleting a
 * campaign that money was discounted under would erase the record of why an
 * order was cheaper than its lines.
 */
export async function archiveDiscountCampaign(id: string): Promise<DiscountActionState> {
  await requireSection('discounts', 'write')
  const admin = createAdminClient()

  const { error } = await admin
    .from('discount_campaigns')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)

  if (error) return { ok: false, error: `ארכוב נכשל: ${error.message}` }
  revalidatePath('/admin/discounts')
  return { ok: true }
}

/**
 * The kill switch, separate from archiving.
 *
 * A campaign being abused needs to stop within seconds, and that is a different
 * act from retiring one that ran its course. Deactivating leaves it in the list
 * with its history intact.
 */
export async function setDiscountCampaignActive(
  id: string,
  isActive: boolean,
): Promise<DiscountActionState> {
  await requireSection('discounts', 'write')
  const admin = createAdminClient()

  const { error } = await admin
    .from('discount_campaigns')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) return { ok: false, error: `עדכון נכשל: ${error.message}` }

  revalidatePath('/admin/discounts')
  return { ok: true }
}
