'use server'

import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { approveSupplierApplication, rejectSupplierApplication } from '@/lib/supplier-onboarding'

export async function approveApplication(applicationId: string) {
  return withActionContext('admin.suppliers.approve_application', async () => {
    await requireSection('suppliers', 'write')
    return approveSupplierApplication(applicationId)
  })
}

export async function rejectApplication(applicationId: string, reason: string) {
  return withActionContext('admin.suppliers.reject_application', async () => {
    await requireSection('suppliers', 'write')
    return rejectSupplierApplication(applicationId, reason)
  })
}
