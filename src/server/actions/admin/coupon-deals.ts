'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
  image_url: z.string().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).default('draft'),
})

export type CouponDealFormState = { error: string } | { success: string } | null

export async function upsertCouponDeal(
  _: CouponDealFormState,
  formData: FormData,
): Promise<CouponDealFormState> {
  try {
    await requireAdminSession()
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

  const { id, ...fields } = parsed.data

  if (id) {
    const { error } = await supabase.from('coupon_deals').update(fields).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('coupon_deals')
      .insert({ ...fields, created_by: user!.id })
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/coupons')
  redirect('/admin/coupons')
}

export async function softDeleteCouponDeal(id: string): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('coupon_deals')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/coupons')
  return {}
}
