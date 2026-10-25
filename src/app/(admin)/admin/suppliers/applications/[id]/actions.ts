'use server'

import { approveSupplierApplication, rejectSupplierApplication } from '@/lib/supplier-onboarding'

export async function approveApplication(applicationId: string) {
  return approveSupplierApplication(applicationId)
}

export async function rejectApplication(applicationId: string, reason: string) {
  return rejectSupplierApplication(applicationId, reason)
}
