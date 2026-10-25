/**
 * F66: Fraud detection for order flow
 * - Max 10 orders per 24h per user (alert admin if exceeded)
 * - Device fingerprint tracking via FingerprintJS
 * - Bulk purchase detection from same device
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Check order rate for user in last 24h
 * Returns count of orders
 */
export async function getUserOrderCount24h(userId: string): Promise<number> {
  const admin = createAdminClient()

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', oneDayAgo)

  if (error) {
    log.error('fraud.order_count_check_failed', { error: error.message })
    return 0
  }

  return data?.length ?? 0
}

/**
 * Check if user exceeds order rate limit (10 per 24h)
 * Returns true if user should be flagged
 */
export async function isOrderRateExceeded(userId: string): Promise<boolean> {
  const count = await getUserOrderCount24h(userId)
  return count >= 10
}

/**
 * Create fraud alert for admin review
 */
export async function createFraudAlert(params: {
  userId: string | null
  orderId?: string | null
  alertType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: Record<string, unknown>
  ipAddress?: string | null
  deviceFingerprint?: string | null
}): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin.from('fraud_alerts').insert({
    user_id: params.userId,
    order_id: params.orderId,
    alert_type: params.alertType,
    severity: params.severity,
    details: params.details,
    ip_address: params.ipAddress,
    device_fingerprint: params.deviceFingerprint,
    status: 'pending',
  })

  if (error) {
    log.error('fraud.create_alert_failed', { error: error.message })
  } else {
    log.warn('fraud.alert_created', {
      type: params.alertType,
      severity: params.severity,
      userId: params.userId,
    })
  }
}

/**
 * Check device fingerprint for bulk purchase pattern
 * Returns number of orders from this device in last 24h
 */
export async function getDeviceOrderCount24h(deviceFingerprint: string): Promise<number> {
  const admin = createAdminClient()

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('orders')
    .select('id')
    .eq('device_fingerprint', deviceFingerprint)
    .gte('created_at', oneDayAgo)

  if (error) {
    log.error('fraud.device_order_count_failed', { error: error.message })
    return 0
  }

  return data?.length ?? 0
}

/**
 * Flag bulk purchase from same device (threshold: 5 orders in 24h)
 */
export async function checkDeviceBulkPurchase(
  deviceFingerprint: string,
  userId: string | null,
  orderId: string,
): Promise<void> {
  const count = await getDeviceOrderCount24h(deviceFingerprint)

  if (count >= 5) {
    await createFraudAlert({
      userId,
      orderId,
      alertType: 'device_bulk_purchase',
      severity: count >= 10 ? 'high' : 'medium',
      details: {
        deviceFingerprint,
        orderCount24h: count,
        threshold: 5,
      },
      deviceFingerprint,
    })
  }
}
