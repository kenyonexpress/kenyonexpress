'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum(['pending', 'active', 'suspended'])

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  profile_id: z.string().uuid().optional(),
  business_name: z.string().min(2, 'שם עסק נדרש'),
  legal_name: z.string().nullable().optional(),
  business_id: z.string().min(2, 'ח.פ נדרש'),
  tax_id: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().email('אימייל לא תקין'),
  contact_phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bank_account_holder: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_branch: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  commission_rate: z.coerce.number().min(0).max(100).default(90),
  logo_url: z.string().nullable().optional(),
  status: statusSchema.default('pending'),
})

export type VendorActionState = { error: string } | { success: string } | null

export async function upsertVendor(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const raw = {
    id: formData.get('id') || undefined,
    profile_id: formData.get('profile_id') || undefined,
    business_name: formData.get('business_name'),
    legal_name: formData.get('legal_name') || null,
    business_id: formData.get('business_id'),
    tax_id: formData.get('tax_id') || null,
    contact_name: formData.get('contact_name') || null,
    contact_email: formData.get('contact_email'),
    contact_phone: formData.get('contact_phone') || null,
    address: formData.get('address') || null,
    bank_account_holder: formData.get('bank_account_holder') || null,
    bank_name: formData.get('bank_name') || null,
    bank_branch: formData.get('bank_branch') || null,
    bank_account: formData.get('bank_account') || null,
    commission_rate: formData.get('commission_rate') ?? '90',
    logo_url: formData.get('logo_url') || null,
    status: formData.get('status'),
  }

  const parsed = upsertSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const supabase = await createClient()
  const { id, ...fields } = parsed.data

  if (id) {
    const { error } = await supabase.from('vendors').update(fields).eq('id', id)
    if (error) return { error: error.message }
  } else {
    if (!fields.profile_id) return { error: 'profile_id נדרש ליצירת ספק' }
    const { error } = await supabase
      .from('vendors')
      .insert(fields as typeof fields & { profile_id: string })
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/vendors')
  if (id) revalidatePath(`/admin/vendors/${id}`)
  return { success: id ? 'ספק עודכן' : 'ספק נוצר' }
}

export async function updateVendorStatus(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const id = formData.get('id') as string
  const parsed = statusSchema.safeParse(formData.get('status'))
  if (!parsed.success) return { error: 'סטטוס לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('vendors').update({ status: parsed.data }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/vendors')
  revalidatePath(`/admin/vendors/${id}`)
  return { success: 'סטטוס עודכן' }
}

export async function updateVendorCommission(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const id = formData.get('id') as string
  const rate = z.coerce.number().min(0).max(100).safeParse(formData.get('commission_rate'))
  if (!rate.success) return { error: 'עמלה לא תקינה' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vendors')
    .update({ commission_rate: rate.data })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/vendors')
  revalidatePath(`/admin/vendors/${id}`)
  return { success: 'עמלה עודכנה' }
}

export async function softDeleteVendor(id: string): Promise<{ error?: string }> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vendors')
    .update({ deleted_at: new Date().toISOString(), status: 'suspended' })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/vendors')
  return {}
}
