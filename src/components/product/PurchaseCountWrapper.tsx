'use server'

import { getProductPurchaseCount } from '@/server/queries/product-purchase-count'
import PurchaseCount from './PurchaseCount'

interface PurchaseCountWrapperProps {
  productId: string
  variant?: 'compact' | 'full'
}

/**
 * Server component wrapper for PurchaseCount that fetches the initial count.
 * Wrapped in Suspense at the call site to avoid blocking page prerendering.
 */
export default async function PurchaseCountWrapper({
  productId,
  variant = 'full',
}: PurchaseCountWrapperProps) {
  const purchaseCount = await getProductPurchaseCount(productId)

  return <PurchaseCount productId={productId} initialCount={purchaseCount} variant={variant} />
}
