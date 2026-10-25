'use server'

import { type SupplierApplicationInput, submitSupplierApplication } from '@/lib/supplier-onboarding'

export async function submitApplication(input: SupplierApplicationInput) {
  return submitSupplierApplication(input)
}
