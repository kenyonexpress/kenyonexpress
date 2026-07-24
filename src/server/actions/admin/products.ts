'use server'

import { variantIdsToRemove } from '@/lib/admin/product-variants'
import { requireStaffSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z
  .object({
    id: z.string().uuid().optional(),
    category_id: z.string().uuid().nullable().optional(),
    slug: z
      .string()
      .min(2, 'קישור חייב להכיל לפחות 2 תווים')
      .regex(/^[a-z0-9-]+$/, 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
    name_he: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
    name_en: z.string().nullable().optional(),
    description_he: z.string().nullable().optional(),
    type: z.enum(['physical', 'coupon']),
    kenyon_price: z.coerce.number().min(0, 'מחיר בקניון נדרש'),
    full_price: z.coerce.number().min(0).nullable().optional(),
    is_coupon_enabled: z.coerce.boolean().default(false),
    sku: z.string().nullable().optional(),
    stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
    is_featured: z.coerce.boolean().default(false),
    status: z.enum(['draft', 'active', 'paused', 'archived']),
    // content/marketing (048)
    short_description_he: z.string().max(300, 'תיאור קצר עד 300 תווים').nullable().optional(),
    brand: z.string().nullable().optional(),
    highlights: z.array(z.string().min(1)).default([]),
    video_url: z.string().url('כתובת וידאו לא תקינה').nullable().optional(),
    barcode: z.string().nullable().optional(),
    // inventory (048)
    low_stock_threshold: z.coerce.number().int().min(0).default(5),
    max_per_order: z.coerce.number().int().min(1).nullable().optional(),
    // logistics (048)
    requires_shipping: z.coerce.boolean().default(true),
    weight_grams: z.coerce.number().int().min(0).nullable().optional(),
    length_cm: z.coerce.number().min(0).nullable().optional(),
    width_cm: z.coerce.number().min(0).nullable().optional(),
    height_cm: z.coerce.number().min(0).nullable().optional(),
    warranty_months: z.coerce.number().int().min(0).nullable().optional(),
    condition: z.enum(['new', 'refurbished', 'used']).nullable().optional(),
    // coupon specifics (048)
    coupon_terms_he: z.string().nullable().optional(),
    redemption_instructions_he: z.string().nullable().optional(),
    min_purchase_ils: z.coerce.number().min(0).nullable().optional(),
    // SEO (048)
    seo_title: z.string().max(70, 'כותרת SEO עד 70 תווים').nullable().optional(),
    seo_description: z.string().max(170, 'תיאור SEO עד 170 תווים').nullable().optional(),
    seo_keywords: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.full_price != null && data.full_price < data.kenyon_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'מחיר מלא חייב להיות גדול או שווה למחיר בקניון',
        path: ['full_price'],
      })
    }
  })

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name_he: z.string().min(1),
  sku: z.string().min(1),
  price: z.coerce.number().min(0).nullable().optional(),
  price_modifier: z.coerce.number().default(0),
  stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
  is_active: z.coerce.boolean().default(true),
})

export type ProductFormState = { error: string } | { success: string } | null

export async function upsertProduct(
  _: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    category_id: formData.get('category_id') || null,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    name_en: formData.get('name_en') || null,
    description_he: formData.get('description_he') || null,
    type: formData.get('type'),
    kenyon_price: formData.get('kenyon_price'),
    full_price: formData.get('full_price') || null,
    is_coupon_enabled: formData.get('is_coupon_enabled') === 'true',
    sku: formData.get('sku') || null,
    stock_quantity: formData.get('stock_quantity') || null,
    is_featured: formData.get('is_featured') === 'true',
    status: formData.get('status'),
    short_description_he: formData.get('short_description_he') || null,
    brand: formData.get('brand') || null,
    // one highlight per line from the textarea
    highlights: String(formData.get('highlights') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    video_url: formData.get('video_url') || null,
    barcode: formData.get('barcode') || null,
    low_stock_threshold: formData.get('low_stock_threshold') || 5,
    max_per_order: formData.get('max_per_order') || null,
    requires_shipping: formData.get('requires_shipping') === 'true',
    weight_grams: formData.get('weight_grams') || null,
    length_cm: formData.get('length_cm') || null,
    width_cm: formData.get('width_cm') || null,
    height_cm: formData.get('height_cm') || null,
    warranty_months: formData.get('warranty_months') || null,
    condition: formData.get('condition') || null,
    coupon_terms_he: formData.get('coupon_terms_he') || null,
    redemption_instructions_he: formData.get('redemption_instructions_he') || null,
    min_purchase_ils: formData.get('min_purchase_ils') || null,
    seo_title: formData.get('seo_title') || null,
    seo_description: formData.get('seo_description') || null,
    seo_keywords: formData.get('seo_keywords') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const imagesRaw = formData.get('images') as string | null
  const images = imagesRaw ? (JSON.parse(imagesRaw) as unknown[]) : []

  const variantsRaw = formData.get('variants') as string | null
  const variantsParsed = variantsRaw
    ? (JSON.parse(variantsRaw) as unknown[]).map((v) => variantSchema.safeParse(v))
    : []

  const invalidVariant = variantsParsed.find((v) => !v.success)
  if (invalidVariant && !invalidVariant.success) {
    return { error: `גרסה לא תקינה: ${invalidVariant.error.issues[0]?.message}` }
  }

  const variants = variantsParsed.filter((v) => v.success).map((v) => v.data)

  const { id, ...fields } = parsed.data

  let productId = id

  if (id) {
    const { error } = await supabase
      .from('products')
      .update({ ...fields, images })
      .eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...fields, images, created_by: user!.id })
      .select('id')
      .single()
    if (error) return { error: error.message }
    productId = data.id
  }

  // Soft-delete variants removed in the editor (edit flow only). New products
  // have no existing variants to reconcile.
  if (id) {
    const { data: existing } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', id)
      .is('deleted_at', null)
    const toRemove = variantIdsToRemove(
      (existing ?? []).map((e) => e.id),
      variants.map((v) => v.id),
    )
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('product_variants')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .in('id', toRemove)
      if (error) return { error: error.message }
    }
  }

  if (variants.length > 0 && productId) {
    for (const v of variants) {
      const { id: vid, ...vfields } = v
      if (vid) {
        await supabase.from('product_variants').update(vfields).eq('id', vid)
      } else {
        await supabase.from('product_variants').insert({ ...vfields, product_id: productId })
      }
    }
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}

export async function bulkUpdateProductStatus(
  ids: string[],
  status: 'draft' | 'active' | 'paused' | 'archived',
): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').update({ status }).in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}

export async function bulkAssignCategory(
  ids: string[],
  categoryId: string | null,
): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }
  if (categoryId != null && !z.string().uuid().safeParse(categoryId).success) {
    return { error: 'קטגוריה לא תקינה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ category_id: categoryId })
    .in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}

const bulkPriceSchema = z.discriminatedUnion('mode', [
  // percent: -90..500, applied to kenyon_price AND full_price so the
  // displayed discount ratio survives the adjustment
  z.object({ mode: z.literal('percent'), value: z.coerce.number().min(-90).max(500) }),
  // set: absolute kenyon_price in ILS
  z.object({ mode: z.literal('set'), value: z.coerce.number().min(0.01) }),
])

export type BulkPriceInput = z.infer<typeof bulkPriceSchema>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Bulk price update. Percent mode scales kenyon_price and full_price together;
 * set mode writes kenyon_price and skips products whose full_price would fall
 * below it (those are reported back, not silently broken).
 */
export async function bulkAdjustPrices(
  ids: string[],
  input: BulkPriceInput,
): Promise<{ error?: string; updated?: number; skipped?: string[] }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }

  const parsed = bulkPriceSchema.safeParse(input)
  if (!parsed.success) return { error: 'ערך מחיר לא תקין' }

  const supabase = await createClient()
  const { data: products, error: loadError } = await supabase
    .from('products')
    .select('id, name_he, kenyon_price, full_price')
    .in('id', ids)
  if (loadError) return { error: loadError.message }

  let updated = 0
  const skipped: string[] = []

  for (const p of products ?? []) {
    const current = Number(p.kenyon_price ?? 0)
    if (parsed.data.mode === 'percent') {
      const factor = 1 + parsed.data.value / 100
      const patch: { kenyon_price: number; full_price?: number } = {
        kenyon_price: round2(current * factor),
      }
      if (p.full_price != null) patch.full_price = round2(Number(p.full_price) * factor)
      const { error } = await supabase.from('products').update(patch).eq('id', p.id)
      if (error) return { error: error.message, updated }
      updated += 1
    } else {
      const next = round2(parsed.data.value)
      if (p.full_price != null && Number(p.full_price) < next) {
        skipped.push(p.name_he)
        continue
      }
      const { error } = await supabase
        .from('products')
        .update({ kenyon_price: next })
        .eq('id', p.id)
      if (error) return { error: error.message, updated }
      updated += 1
    }
  }

  revalidatePath('/admin/products')
  return { updated, skipped }
}

export async function bulkSoftDeleteProducts(ids: string[]): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }
  if (ids.length === 0) return { error: 'לא נבחרו מוצרים' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}

export async function deleteVariant(id: string): Promise<{ error?: string }> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('product_variants')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
  if (error) return { error: error.message }

  return {}
}
