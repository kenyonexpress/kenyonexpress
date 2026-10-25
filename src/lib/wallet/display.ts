/**
 * Wallet display utilities (client-safe, no server imports)
 */

import { agorot, formatAgorot } from '@/lib/money'
import type { PayoutRequest } from './types'

/**
 * Format payout status for display (Hebrew)
 */
export function formatPayoutStatus(status: PayoutRequest['status']): string {
  const labels: Record<PayoutRequest['status'], string> = {
    pending: 'ממתין לאישור',
    approved: 'אושר',
    rejected: 'נדחה',
    completed: 'הושלם',
  }
  return labels[status] || status
}

/**
 * Get status badge variant
 */
export function getPayoutStatusVariant(
  status: PayoutRequest['status'],
): 'default' | 'success' | 'warning' | 'error' {
  const variants: Record<PayoutRequest['status'], 'default' | 'success' | 'warning' | 'error'> = {
    pending: 'warning',
    approved: 'default',
    rejected: 'error',
    completed: 'success',
  }
  return variants[status] || 'default'
}

/**
 * Format payout method for display (Hebrew)
 */
export function formatPayoutMethod(method: 'bank_transfer' | 'cardcom_refund'): string {
  return method === 'bank_transfer' ? 'העברה בנקאית' : 'החזר לכרטיס'
}

/**
 * Format amount for display
 */
export function formatWalletAmount(amountAgorot: number): string {
  return formatAgorot(agorot(amountAgorot))
}
