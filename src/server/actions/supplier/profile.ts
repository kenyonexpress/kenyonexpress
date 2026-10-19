'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSupplierProfileForm } from '@/lib/supplier/profile-form'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { revalidatePath, updateTag } from 'next/cache'

/**
 * A supplier owner editing their own business details.
 *
 * WHY THIS EXISTS. Until now the only way a supplier's phone number, address or
 * logo could change was an admin typing it in `/admin/suppliers`. Those four
 * fields are also the publish gate (`REQUIRED_TO_PUBLISH`), so a supplier whose
 * products would not publish had no way to fix the reason themselves.
 *
 * WHY IT WRITES WITH THE SERVICE ROLE. `suppliers` has exactly one UPDATE
 * policy in production and it is `is_admin() OR has_role('content_uploader')`.
 * A supplier owner satisfies neither, so a user-scoped write returns zero rows
 * and no error -- the silent kind of failure this codebase keeps finding. The
 * gate is therefore in front (`requireSupplierRole('owner')`), the write is
 * scoped `.eq('id', session.supplierId)` so it cannot reach another supplier's
 * row, and the columns are whitelisted by `parseSupplierProfileForm`.
 *
 * OWNER, not any member. A staff member at a till is given a scanner, not the
 * ability to change where the business's money-adjacent contact details point.
 */

export type SupplierProfileState = { error: string } | { success: string } | null

async function runUpdateSupplierProfile(
  _: SupplierProfileState,
  formData: FormData,
): Promise<SupplierProfileState> {
  // requireSupplierRole redirects rather than throwing for a signed-out or
  // under-privileged caller, which is what a server action wants here: the
  // caller ends up on the portal with ?denied=role instead of reading a
  // Hebrew error next to a form they may not use.
  const session = await requireSupplierRole('owner', '/supplier/profile')

  const parsed = parseSupplierProfileForm({
    contact_name: formData.get('contact_name'),
    contact_email: formData.get('contact_email'),
    contact_phone: formData.get('contact_phone'),
    whatsapp: formData.get('whatsapp'),
    address: formData.get('address'),
    city: formData.get('city'),
    website: formData.get('website'),
    logo_url: formData.get('logo_url'),
  })
  if (!parsed.ok) return { error: parsed.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from('suppliers')
    .update(parsed.data)
    // Both filters matter. `id` is the row, and `deleted_at is null` refuses to
    // resurrect the details of a business that was removed.
    .eq('id', session.supplierId)
    .is('deleted_at', null)
  if (error) {
    log.error('supplier.profile_update_failed', {
      supplier_id: session.supplierId,
      reason: error.message,
    })
    return { error: 'השמירה נכשלה, נסו שוב' }
  }

  // The business's own name, address and phone render inside the product page's
  // supplier block, and that read is cached under CATALOGUE_TAG. See
  // lib/catalogue-cache.ts: without this, a supplier who corrects their address
  // sees it in this form immediately and on their own product pages up to an
  // hour later, which reads exactly like the save having failed.
  updateTag(CATALOGUE_TAG)

  await writeAuditLog({
    actorId: session.userId,
    // The audit enum's word for a supplier-side actor. profiles.role is a
    // routing hint here and often 'customer', so it is not the honest answer to
    // "in what capacity did they act".
    actorRole: 'vendor',
    action: 'updated',
    entityType: 'suppliers',
    entityId: session.supplierId,
    changes: { ...parsed.data },
    metadata: { via: 'supplier_portal' },
  })

  // The details render on the product page and in the supplier header, and the
  // portal page itself reads them back.
  revalidatePath('/supplier/profile')
  revalidatePath('/supplier')

  return { success: 'הפרטים נשמרו' }
}

export async function updateSupplierProfile(
  prev: SupplierProfileState,
  formData: FormData,
): Promise<SupplierProfileState> {
  return withActionContext('supplier.profile_update', () =>
    runUpdateSupplierProfile(prev, formData),
  )
}
