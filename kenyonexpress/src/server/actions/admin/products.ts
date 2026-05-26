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
  description_he: z.string().nullable().optional(),
  type: z.enum(['physical', 'coupon']),
  base_price: z.coerce.number().min(0, 'מחיר חייב להיות אפס ומעלה'),
  sale_price: z.coerce.number().min(0).nullable().optional(),
  stock_quantity: z.coerce.number().int().min(0).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']),
})

export type ProductFormState = { error: string } | { success: string } | null

function parseForm(formData: FormData) {
  return schema.safeParse({
    id: formData.get('id') || undefined,
    vendor_id: formData.get('vendor_id'),
    category_id: formData.get('category_id') || null,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    description_he: formData.get('description_he') || null,
    type: formData.get('type'),
    base_price: formData.get('base_price'),
    sale_price: formData.get('sale_price') || null,
    stock_quantity: formData.get('stock_quantity') || null,
    status: formData.get('status'),
  })
}

export async function upsertProduct(
  _: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = parseForm(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const imagesRaw = formData.get('images') as string | null
  const images = imagesRaw ? (JSON.parse(imagesRaw) as unknown[]) : []

  const { id, ...fields } = parsed.data

  if (id) {
    const { error } = await supabase
      .from('products')
      .update({ ...fields, images })
      .eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('products')
      .insert({ ...fields, images, created_by: user!.id })
    if (error) return { error: error.message }
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
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/products')
  return {}
}
