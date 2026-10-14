'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { IMAGE_HOST_ERROR, isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
  id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  title_he: z.string().min(2, 'כותרת נדרשת'),
  business_name: z.string().min(2, 'שם עסק נדרש'),
  original_price: z.coerce.number().min(1, 'מחיר מקורי חייב להיות גדול מ-0'),
  // The absolute amount charged on site. No default exists: the 10%/90% model
  // was abolished on 2026-07-24, and a deal without this cannot be priced.
  // Nullable so a draft can be saved before the price is decided.
  platform_price: z.coerce.number().positive('מחיר באתר חייב להיות גדול מ-0').nullable().optional(),
  terms_he: z.string().nullable().optional(),
  valid_from: z.string().min(1, 'תאריך התחלה נדרש'),
  valid_until: z.string().nullable().optional(),
  max_uses: z.coerce.number().int().min(1).nullable().optional(),
  max_uses_per_user: z.coerce.number().int().min(1).default(1),
  location_he: z.string().nullable().optional(),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
  /**
   * Validated, because this string is rendered by next/image on two customer
   * pages and an un-allowlisted host makes next THROW - a 500, not a broken
   * image. Free text here is how that row gets written. See
   * src/lib/images/remote-hosts.ts.
   */
  image_url: z.string().refine(isAllowedImageUrl, IMAGE_HOST_ERROR).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
  /**
   * UX10: the code the ticket's copy button hands the shopper, pending
   * migration 270 (`coupon_deals.code`, CHECKed to the same pattern). Upper-
   * cased here so "spa90" and "SPA90" are one code, and so the unique index
   * on the column holds.
   */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,16}$/, 'קוד קופון: 4 עד 16 אותיות לטיניות או ספרות')
    .nullable()
    .optional(),
})

/** Postgres: undefined_column, the hosted database before 270 is applied. */
const UNDEFINED_COLUMN = '42703'
const CODE_NEEDS_270 = 'קוד קופון דורש את מיגרציה 270 (ממתינה). שמרו בלי קוד או החילו אותה קודם'

export type CouponDealFormState = { error: string } | { success: string } | null

async function runUpsertCouponDeal(
  _: CouponDealFormState,
  formData: FormData,
): Promise<CouponDealFormState> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    vendor_id: formData.get('vendor_id') || null,
    title_he: formData.get('title_he'),
    business_name: formData.get('business_name'),
    original_price: formData.get('original_price'),
    platform_price: formData.get('platform_price') || null,
    terms_he: formData.get('terms_he') || null,
    valid_from: formData.get('valid_from'),
    valid_until: formData.get('valid_until') || null,
    max_uses: formData.get('max_uses') || null,
    max_uses_per_user: formData.get('max_uses_per_user') ?? '1',
    location_he: formData.get('location_he') || null,
    lat: formData.get('lat') || null,
    lng: formData.get('lng') || null,
    image_url: formData.get('image_url') || null,
    status: formData.get('status'),
    code: formData.get('code') || null,
  })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // The customer would otherwise be owed money at the business: the balance
  // collected there is original_price - platform_price, and above the sticker
  // that goes negative. Mirrors the products_coupon_price_within_price check.
  if (
    parsed.data.platform_price != null &&
    parsed.data.platform_price > parsed.data.original_price
  ) {
    return { error: 'מחיר באתר לא יכול לעלות על המחיר המקורי' }
  }

  // An active deal must be priceable. A draft may still be missing its price.
  if (parsed.data.status === 'active' && parsed.data.platform_price == null) {
    return { error: 'לא ניתן להפעיל מבצע ללא מחיר באתר' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { id, code, ...rest } = parsed.data

  // WRITTEN TWICE AT MOST. The first write names `code` (null clears it); on
  // the hosted database, where 270 is pending, that is 42703 and the second
  // write goes without the column, so a save that never mentioned a code is
  // exactly the save it was before this field. A save that DID type a code
  // stops with CODE_NEEDS_270 rather than silently dropping it. The generated
  // row type predates 270, hence the loose cast on the first attempt.
  type Fields = typeof rest & { code?: string | null }
  type Written = { error: { code?: string; message: string } | null; id: string | null }
  const write = async (fields: Fields): Promise<Written> => {
    if (id) {
      const { error } = await supabase
        .from('coupon_deals')
        .update(fields as never)
        .eq('id', id)
      return { error, id }
    }
    const { data, error } = await supabase
      .from('coupon_deals')
      .insert({ ...fields, created_by: user!.id } as never)
      .select('id')
      .single()
    return { error, id: data?.id ?? null }
  }

  let fields: Fields = { ...rest, code: code ?? null }
  let result = await write(fields)
  if (result.error?.code === UNDEFINED_COLUMN) {
    if (code) return { error: CODE_NEEDS_270 }
    fields = rest
    result = await write(fields)
  }
  if (result.error) return { error: result.error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: id ? 'updated' : 'created',
    entityType: 'coupon_deals',
    entityId: result.id ?? undefined,
    changes: { ...fields },
  })

  // The storefront's read of this row is `use cache` (lib/coupon-deals.ts), so
  // without this the save is invisible on /coupons/[id] for an hour while the
  // admin panel - which is uncached - shows it immediately. That failure mode
  // is spelled out in full in catalogue-cache.ts.
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/coupons')
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: id ? 'updated' : 'created',
    entityType: 'coupon_deals',
    entityId: id,
    changes: {
      old: null,
      new: { id: id ?? null, title_he: fields.title_he, status: fields.status },
    },
  })
  redirect('/admin/coupons')
}

async function runSoftDeleteCouponDeal(id: string): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('coupon_deals')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'coupon_deals',
    entityId: id,
    changes: { status: 'archived' },
  })

  // Same contract as the save above, and it matters more here: an archived deal
  // that stays readable on the storefront is a coupon still being advertised.
  updateTag(CATALOGUE_TAG)
  revalidatePath('/admin/coupons')
  return {}
}

export async function upsertCouponDeal(
  _: CouponDealFormState,
  formData: FormData,
): Promise<CouponDealFormState> {
  return withActionContext('admin.coupon_deal.upsert', () => runUpsertCouponDeal(_, formData))
}

export async function softDeleteCouponDeal(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.coupon_deal.soft_delete', () => runSoftDeleteCouponDeal(id))
}
