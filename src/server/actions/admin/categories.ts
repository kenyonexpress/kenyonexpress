'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { IMAGE_HOST_ERROR, isAllowedImageUrl } from '@/lib/images/remote-hosts'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2, 'מזהה חייב להכיל לפחות 2 תווים')
    .regex(/^[a-z0-9-]+$/, 'מזהה יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד'),
  name_he: z.string().min(1, 'שם בעברית נדרש'),
  name_en: z.string().min(1, 'שם באנגלית נדרש'),
  description_he: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  // Same gate as coupon_deals.image_url: this URL is rendered on the category
  // tree and an un-allowlisted host is a throw, not a broken image.
  icon_url: z.string().refine(isAllowedImageUrl, IMAGE_HOST_ERROR).nullable().optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.coerce.boolean().default(true),
})

export type CategoryFormState = { error: string } | { success: string } | null

export async function upsertCategory(
  _: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    slug: formData.get('slug'),
    name_he: formData.get('name_he'),
    name_en: formData.get('name_en'),
    description_he: formData.get('description_he') || null,
    parent_id: formData.get('parent_id') || null,
    icon_url: formData.get('icon_url') || null,
    sort_order: formData.get('sort_order') ?? '0',
    is_active: formData.get('is_active') === 'true',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { id, ...fields } = parsed.data

  if (id) {
    const { error } = await supabase.from('categories').update(fields).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('categories').insert({ ...fields, created_by: user!.id })
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/categories')
  return { success: id ? 'קטגוריה עודכנה' : 'קטגוריה נוצרה' }
}

export async function softDeleteCategory(id: string): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/categories')
  return {}
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/categories')
  return {}
}

export async function updateCategorySortOrder(
  id: string,
  sort_order: number,
): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').update({ sort_order }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/categories')
  return {}
}
