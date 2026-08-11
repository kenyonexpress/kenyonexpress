'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { type SupplierFormFields, parseSupplierForm } from '@/lib/admin/supplier-form'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * CRUD for `public.suppliers`.
 *
 * This is the table `products.supplier_id`, `order_items.supplier_id` and
 * `coupon_codes.supplier_id` reference, so an edit here reaches the product
 * page, the checkout snapshot and the voucher. Its sibling `public.vendors` is
 * the legacy payout table and lives at /admin/vendors; see
 * docs/ADMIN-ARCHITECTURE.md section 2 for why they are not merged.
 *
 * Writes go through the service-role client after the section gate, per section
 * 7 rule 2: `authenticated` has no permissive write policy on this table.
 */

export type SupplierActionState = { error: string } | { success: string } | null

/**
 * `audit_log.changes` is `Json`, which needs an index signature. A named
 * interface has none, so the field values are widened here rather than casting
 * the whole payload through `unknown`.
 */
function auditChanges(fields: SupplierFormFields): Record<string, string | null> {
  return { ...fields }
}

async function runUpsertSupplier(
  _: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('suppliers', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = parseSupplierForm({
    id: formData.get('id'),
    name: formData.get('name'),
    contact_name: formData.get('contact_name'),
    contact_email: formData.get('contact_email'),
    contact_phone: formData.get('contact_phone'),
    whatsapp: formData.get('whatsapp'),
    address: formData.get('address'),
    city: formData.get('city'),
    website: formData.get('website'),
    business_id: formData.get('business_id'),
    logo_url: formData.get('logo_url'),
    notes: formData.get('notes'),
    status: formData.get('status'),
  })
  if (!parsed.ok) return { error: parsed.error }

  const admin = createAdminClient()
  const id = parsed.id

  if (id) {
    const { error } = await admin.from('suppliers').update(parsed.data).eq('id', id)
    if (error) return { error: error.message }
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'updated',
      entityType: 'suppliers',
      entityId: id,
      changes: auditChanges(parsed.data),
    })
  } else {
    // No percentage is written here, and none can be: migration 112 dropped
    // suppliers.commission_percent and suppliers.default_split_percent, the two
    // retired fixed-commission knobs. The split lives per product (section 0.1).
    const { data, error } = await admin.from('suppliers').insert(parsed.data).select('id').single()
    if (error) return { error: error.message }
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'created',
      entityType: 'suppliers',
      entityId: data.id,
      changes: auditChanges(parsed.data),
    })
  }

  revalidatePath('/admin/suppliers')
  if (id) revalidatePath(`/admin/suppliers/${id}`)
  return { success: id ? 'הספק עודכן' : 'הספק נוצר' }
}

async function runSetSupplierStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('suppliers', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('suppliers').update({ status }).eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'suppliers',
    entityId: id,
    changes: { status },
  })

  revalidatePath('/admin/suppliers')
  revalidatePath(`/admin/suppliers/${id}`)
  return {}
}

/**
 * Soft delete, and only when nothing points at the row.
 *
 * A supplier with products cannot be removed: `order_items` keeps a snapshot of
 * the identity, but `products.supplier_id` is a live reference, and orphaning it
 * would unpublish those products with no trace of why. The admin is told the
 * count instead.
 */
async function runSoftDeleteSupplier(id: string): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('suppliers', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const admin = createAdminClient()
  const { count, error: countError } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id)
    .is('deleted_at', null)
  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) {
    return { error: `לא ניתן למחוק ספק עם ${count} מוצרים משויכים. יש להעביר אותם קודם.` }
  }

  const { error } = await admin
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
    .eq('id', id)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'suppliers',
    entityId: id,
  })

  revalidatePath('/admin/suppliers')
  return {}
}

/**
 * Grants a user access to a supplier.
 *
 * `supplier_members` is what the supplier portal reads to decide who may scan a
 * voucher. Without a row here a supplier can be complete, published and selling
 * while nobody can honour a voucher at the counter, so this is part of
 * onboarding rather than an optional extra.
 */
async function runAddSupplierMember(
  supplierId: string,
  userId: string,
  role: 'owner' | 'manager' | 'scanner',
): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('suppliers', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('supplier_members').upsert(
    {
      supplier_id: supplierId,
      user_id: userId,
      member_role: role,
      is_active: true,
      invited_by: session.userId,
    },
    { onConflict: 'supplier_id,user_id' },
  )
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'permission_change',
    entityType: 'supplier_members',
    entityId: supplierId,
    changes: { user_id: userId, member_role: role, is_active: true },
  })

  revalidatePath(`/admin/suppliers/${supplierId}`)
  return {}
}

/**
 * Revokes access without deleting the row, so the audit trail keeps who had it.
 */
async function runDeactivateSupplierMember(
  supplierId: string,
  userId: string,
): Promise<{ error?: string }> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('suppliers', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('supplier_members')
    .update({ is_active: false })
    .eq('supplier_id', supplierId)
    .eq('user_id', userId)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'permission_change',
    entityType: 'supplier_members',
    entityId: supplierId,
    changes: { user_id: userId, is_active: false },
  })

  revalidatePath(`/admin/suppliers/${supplierId}`)
  return {}
}

export async function upsertSupplier(
  _: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  return withActionContext('admin.supplier.upsert', () => runUpsertSupplier(_, formData))
}

export async function setSupplierStatus(
  id: string,
  status: 'active' | 'inactive',
): Promise<{ error?: string }> {
  return withActionContext('admin.supplier.set_status', () => runSetSupplierStatus(id, status))
}

export async function softDeleteSupplier(id: string): Promise<{ error?: string }> {
  return withActionContext('admin.supplier.soft_delete', () => runSoftDeleteSupplier(id))
}

export async function addSupplierMember(
  supplierId: string,
  userId: string,
  role: 'owner' | 'manager' | 'scanner',
): Promise<{ error?: string }> {
  return withActionContext('admin.supplier.add_member', () =>
    runAddSupplierMember(supplierId, userId, role),
  )
}

export async function deactivateSupplierMember(
  supplierId: string,
  userId: string,
): Promise<{ error?: string }> {
  return withActionContext('admin.supplier.deactivate_member', () =>
    runDeactivateSupplierMember(supplierId, userId),
  )
}
