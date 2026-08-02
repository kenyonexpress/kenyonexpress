'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { parseVendorForm } from '@/lib/admin/vendor-form'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum(['pending', 'active', 'suspended'])

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

  const parsed = parseVendorForm(raw)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { id, ...fields } = parsed.data

  if (id) {
    const { error } = await supabase.from('vendors').update(fields).eq('id', id)
    if (error) return { error: error.message }
  } else {
    // parseVendorForm guarantees profile_id is present on creation.
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
