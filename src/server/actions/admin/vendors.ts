'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { parseVendorForm } from '@/lib/admin/vendor-form'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum(['pending', 'active', 'suspended'])

export type VendorActionState = { error: string } | { success: string } | null

async function runUpsertVendor(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
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
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: id ? 'updated' : 'created',
    entityType: 'vendors',
    entityId: id,
    changes: { old: null, new: { id: id ?? null, business_name: fields.business_name } },
  })
  return { success: id ? 'ספק עודכן' : 'ספק נוצר' }
}

async function runUpdateVendorStatus(
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

async function runUpdateVendorCommission(
  _: VendorActionState,
  _formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  // `vendors.commission_rate` was ARCHIVED by migration 112 into
  // `legacy_percent_archive_112`; the live table has no such column, so the
  // UPDATE this used to run failed 42703 in production on every call. The
  // stale generated types hid that for five weeks. Commission now lives
  // per-product (`products.platform_percent`, snapshotted to order_items at
  // checkout), so a per-vendor rate is not a thing this model has.
  return { error: 'עמלה אינה נקבעת ברמת הספק. העמלה מוגדרת פר מוצר בשדה platform_percent.' }
}

async function runSoftDeleteVendor(id: string): Promise<{ error?: string }> {
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

export async function upsertVendor(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return withActionContext('admin.vendor.upsert', () => runUpsertVendor(_, formData))
}

export async function updateVendorStatus(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return withActionContext('admin.vendor.update_status', () => runUpdateVendorStatus(_, formData))
}

export async function updateVendorCommission(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  return withActionContext('admin.vendor.update_commission', () =>
    runUpdateVendorCommission(_, formData),
  )
}

export async function softDeleteVendor(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.vendor.soft_delete', () => runSoftDeleteVendor(id))
}
