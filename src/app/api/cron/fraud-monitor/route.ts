import {
  calculateCombinedRiskScore,
  detectFraudSignals,
  determineRiskLevel,
  shouldAutoFlag,
} from '@/lib/fraud/detector'
import { log } from '@/lib/observability/log'
import { sendNtfyAlert } from '@/lib/observability/ntfy-alert'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
  }
  return supabase
}

/**
 * POST /api/cron/fraud-monitor
 *
 * Monitors recent orders for fraud signals and auto-flags suspicious activity.
 * Runs every 10 minutes via Vercel cron.
 *
 * Environment Variables Required:
 * - CRON_SECRET: Bearer token for authorization
 */
async function handlePOST(request: Request): Promise<Response> {
  try {
    // Verify CRON_SECRET authorization
    if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get unprocessed orders from the last 30 minutes
    // (processed = already has fraud_flags or fraud_signals)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const client = getSupabaseClient()
    const { data: orders, error: ordersError } = await (client
      .from('orders')
      .select('id, profile_id, amount_ils, created_at')
      .gt('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false }) as any)

    if (ordersError) {
      await sendNtfyAlert({
        endpoint: '/api/cron/fraud-monitor',
        method: 'POST',
        alertType: 'downtime',
        severity: 'critical',
        metricValue: 'db_error',
        thresholdValue: 'none',
        timestamp: new Date().toISOString(),
      })
      return Response.json(
        { error: 'Failed to fetch orders', details: ordersError },
        { status: 500 },
      )
    }

    let flaggedCount = 0
    let signalCount = 0

    for (const order of orders || []) {
      try {
        // Check if order already has flags
        const { data: existingFlag, error: existingFlagError } = await (client
          .from('fraud_flags' as any)
          .select('id')
          .eq('order_id', order.id)
          .maybeSingle() as any)

        if (existingFlagError) {
          // Cannot tell whether it is flagged; a second flag is worse than
          // waiting for the next run.
          log.error('fraud_monitor.existing_flag_lookup_failed', {
            order_id: order.id,
            error: existingFlagError,
          })
          continue
        }

        if (existingFlag) {
          continue // Already flagged
        }

        // Detect fraud signals for this order
        const signals = await detectFraudSignals({
          id: order.id,
          profileId: order.profile_id,
          amount: order.amount_ils,
          createdAt: new Date(order.created_at),
        })

        if (signals.length === 0) {
          continue // No signals, order is clean
        }

        signalCount += signals.length

        // Record all signals in fraud_signals table
        for (const signal of signals) {
          const signalPayload: any = {
            order_id: signal.orderId,
            profile_id: signal.profileId,
            signal_type: signal.signalType,
            severity: signal.severity,
            user_ip: signal.userIp,
            user_location_country: signal.userLocationCountry,
            user_location_city: signal.userLocationCity,
            delivery_country: signal.deliveryCountry,
            delivery_city: signal.deliveryCity,
            signal_score: signal.score,
            metadata: signal.metadata || {},
            auto_flagged: shouldAutoFlag(signals),
          }
          const { error: signalError } = await (client as any)
            .from('fraud_signals')
            .insert(signalPayload)

          if (signalError) {
            log.error('fraud_monitor.failed_to_record_signal_for_order', {
              id: order.id,
              error: signalError,
            })
          }
        }

        // Determine if order should be flagged
        const autoFlag = shouldAutoFlag(signals)
        if (autoFlag) {
          const riskLevel = determineRiskLevel(signals)
          const combinedScore = calculateCombinedRiskScore(signals)
          const primarySignals = signals.map((s) => s.signalType)

          const flagPayload: any = {
            order_id: order.id,
            profile_id: order.profile_id,
            risk_level: riskLevel,
            signal_count: signals.length,
            total_signal_score: combinedScore,
            primary_signals: primarySignals,
            status: 'pending',
            auto_flagged: true,
          }
          const { error: flagError } = await (client as any).from('fraud_flags').insert(flagPayload)

          if (flagError) {
            log.error('fraud_monitor.failed_to_flag_order', { id: order.id, error: flagError })
          } else {
            flaggedCount++

            // Send alert for high-risk flags
            if (riskLevel === 'critical' || riskLevel === 'high') {
              await sendNtfyAlert({
                endpoint: '/fraud/order',
                method: 'POST',
                alertType: 'error_rate_high',
                severity: riskLevel === 'critical' ? 'critical' : 'warning',
                metricValue: combinedScore,
                thresholdValue: 0.6,
                timestamp: new Date().toISOString(),
              })
            }
          }
        }
      } catch (orderError) {
        log.error('fraud_monitor.error_processing_order', { id: order.id, error: orderError })
      }
    }

    return Response.json({
      success: true,
      ordersProcessed: (orders || []).length,
      signalsDetected: signalCount,
      ordersFlagged: flaggedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    log.error('fraud_monitor.fraud_monitor_cron_error', { error })
    await sendNtfyAlert({
      endpoint: '/api/cron/fraud-monitor',
      method: 'POST',
      alertType: 'downtime',
      severity: 'critical',
      metricValue: 'unhandled_error',
      thresholdValue: 'none',
      timestamp: new Date().toISOString(),
    })
    return Response.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 },
    )
  }
}

export const GET = withRequestLog('/api/cron/fraud-monitor', handlePOST)
