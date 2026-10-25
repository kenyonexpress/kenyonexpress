'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { type SupplierApplicationInput, submitSupplierApplication } from '@/lib/supplier-onboarding'

export async function submitApplication(input: SupplierApplicationInput) {
  return withActionContext('supplier.apply.submit', () => submitSupplierApplication(input))
}
