'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
  id: z.string().uuid().optional(),
  vendor_id: z.string().uuid('ספק נדרש'),
  category_id: z.string().uuid().nullable().optional(),
  slug: z
    .string()
    .min(2, 'קישור חייב להכיל לפחות 2 תווים')
    .regex(/^[a-z0-9-]+$/, 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
  name_he: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  name_en: z.string().nullable().optional(),
  description_he: z.string().nullable().optional(),
  type: z.enum(['physical', 'coupon']),
  base_price: z.coerce.number().min(0, 'מחיר חייב להיות אפס ומעלה'),
  compare_at_price: z.coerce.number().min(0).nullable().optional(),
  sale_price: z.coerce.number().min(0).nullable().optional(),
  sku: z.string().nullable().optional(),
  stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
  is_featured: z.coerce.boolean().default(false),
  status: z.enum(['draft', 'active', 'paused', 'archived']),
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
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    vendor_id: formData.get('vendor_id'),
    category_id: formData.get('category_id') || null,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    name_en: formData.get('name_en') || null,
    description_he: formData.get('description_he') || null,
    type: formData.get('type'),
    base_price: formData.get('base_price'),
    compare_at_price: formData.get('compare_at_price') || null,
    sale_price: formData.get('sale_price') || null,
    sku: formData.get('sku') || null,
    stock_quantity: formData.get('stock_quantity') || null,
    is_featured: formData.get('is_featured') === 'true',
    status: formData.get('status'),
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
    await requireAdminSession()
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
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').update({ status }).in('id', ids)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}

export async function deleteVariant(id: string): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
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
