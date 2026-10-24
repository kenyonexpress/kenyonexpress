'use server'

import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateSupplierVerificationAction(formData: FormData) {
  const supplierId = formData.get('supplier_id') as string
  const status = formData.get('status') as 'unverified' | 'pending' | 'verified'

  if (!supplierId || !status) {
    throw new Error('Missing required fields')
  }

  if (!['unverified', 'pending', 'verified'].includes(status)) {
    throw new Error('Invalid verification status')
  }

  // Require write permission
  await requireSection('suppliers', 'write')

  // Get current user
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  const admin = createAdminClient()

  // Update supplier verification status
  const updateData: {
    verification_status: typeof status
    verified_at: string | null
    verified_by: string | null
  } = {
    verification_status: status,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
    verified_by: status === 'verified' ? user.id : null,
  }

  const { error } = await admin
    .from('suppliers')
    .update(updateData)
    .eq('id', supplierId)
    .is('deleted_at', null)

  if (error) {
    console.error('Failed to update supplier verification:', error)
    throw new Error('Failed to update verification status')
  }

  revalidatePath('/admin/suppliers/verify')
  revalidatePath('/admin/suppliers')
  redirect('/admin/suppliers/verify')
}
