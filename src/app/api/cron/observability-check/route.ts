/**
 * Cron endpoint to check SLA violations and send alerts
 * Called every 5 minutes to evaluate endpoint health
 * Triggers ntfy notifications for critical violations
 * Requires CRON_SECRET authentication via Bearer token
 */

import { log } from '@/lib/observability/log'
import { getEndpointMetrics } from '@/lib/observability/metrics'
import {
  type NtfyAlertPayload,
  buildHealthSummary,
  sendNtfyAlert,
} from '@/lib/observability/ntfy-alert'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function handleGET(request: NextRequest) {
  const startedAt = performance.now()

  // Verify cron authentication (constant-time; an unset secret closes the route)
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }

  try {
    // Fetch all metrics
    const metrics = await getEndpointMetrics()

    if (metrics.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          checked: 0,
          alerts_triggered: 0,
          message: 'No metrics to check',
        },
        { headers: { 'cache-control': 'no-store' } },
      )
    }

    const admin = createAdminClient()
    const alertsToSend: NtfyAlertPayload[] = []
    let alertsTriggered = 0

    // Check each endpoint for SLA violations
    for (const metric of metrics) {
      // P95 exceeds target
      if (metric.p95_ms > 300) {
        alertsTriggered++
        const unresolved = await admin
          .from('observability.sla_alerts')
          .select('*')
          .eq('endpoint_id', metric.id)
          .eq('alert_type', 'p95_exceeded')
          .is('resolved_at', null)
          .limit(1)

        if (!unresolved.data || unresolved.data.length === 0) {
          // New alert - create and send
          const alertPayload: NtfyAlertPayload = {
            endpoint: metric.endpoint_path,
            method: metric.method,
            alertType: 'p95_exceeded',
            severity: metric.p95_ms > 500 ? 'critical' : 'warning',
            metricValue: metric.p95_ms,
            thresholdValue: 300,
            timestamp: new Date().toISOString(),
          }

          alertsToSend.push(alertPayload)

          // Record in database
          await admin.from('observability.sla_alerts').insert({
            endpoint_id: metric.id,
            alert_type: 'p95_exceeded',
            severity: alertPayload.severity,
            metric_value: metric.p95_ms,
            threshold_value: 300,
            triggered_at: new Date().toISOString(),
          })
        }
      }

      // High error rate (>0.1%)
      if (metric.error_rate_percent > 0.1) {
        alertsTriggered++
        const unresolved = await admin
          .from('observability.sla_alerts')
          .select('*')
          .eq('endpoint_id', metric.id)
          .eq('alert_type', 'error_rate_high')
          .is('resolved_at', null)
          .limit(1)

        if (!unresolved.data || unresolved.data.length === 0) {
          // New alert - create and send
          const alertPayload: NtfyAlertPayload = {
            endpoint: metric.endpoint_path,
            method: metric.method,
            alertType: 'error_rate_high',
            severity: metric.error_rate_percent > 1 ? 'critical' : 'warning',
            metricValue: metric.error_rate_percent.toFixed(3),
            thresholdValue: 0.1,
            timestamp: new Date().toISOString(),
          }

          alertsToSend.push(alertPayload)

          // Record in database
          await admin.from('observability.sla_alerts').insert({
            endpoint_id: metric.id,
            alert_type: 'error_rate_high',
            severity: alertPayload.severity,
            metric_value: metric.error_rate_percent,
            threshold_value: 0.1,
            triggered_at: new Date().toISOString(),
          })
        }
      }

      // Endpoint down (status check)
      if (metric.status === 'down') {
        alertsTriggered++
        const unresolved = await admin
          .from('observability.sla_alerts')
          .select('*')
          .eq('endpoint_id', metric.id)
          .eq('alert_type', 'downtime')
          .is('resolved_at', null)
          .limit(1)

        if (!unresolved.data || unresolved.data.length === 0) {
          // New alert - create and send
          const alertPayload: NtfyAlertPayload = {
            endpoint: metric.endpoint_path,
            method: metric.method,
            alertType: 'downtime',
            severity: 'critical',
            metricValue: metric.status,
            thresholdValue: 'ok',
            timestamp: new Date().toISOString(),
          }

          alertsToSend.push(alertPayload)

          // Record in database
          await admin.from('observability.sla_alerts').insert({
            endpoint_id: metric.id,
            alert_type: 'downtime',
            severity: 'critical',
            metric_value: 0,
            threshold_value: 1,
            triggered_at: new Date().toISOString(),
          })
        }
      }
    }

    // Add summary alert if any issues
    const healthyCount = metrics.filter((m) => m.status === 'ok').length
    const degradedCount = metrics.filter((m) => m.status === 'degraded').length
    const downCount = metrics.filter((m) => m.status === 'down').length

    if (degradedCount > 0 || downCount > 0) {
      alertsToSend.push(buildHealthSummary(healthyCount, degradedCount, downCount))
    }

    // Send all alerts to ntfy.sh
    for (const alert of alertsToSend) {
      await sendNtfyAlert(alert, 'ntfy.sh/kenyon-ofir-limit')

      // Mark alert as notified in DB
      const metricRecord = await admin
        .from('observability.endpoint_metrics')
        .select('id')
        .eq('endpoint_path', alert.endpoint)
        .eq('method', alert.method)
        .single()

      if (metricRecord.data?.id) {
        const alertRecord = await admin
          .from('observability.sla_alerts')
          .select('id')
          .eq('endpoint_id', metricRecord.data.id)
          .eq('alert_type', alert.alertType)
          .is('resolved_at', null)
          .order('triggered_at', { ascending: false })
          .limit(1)

        if (alertRecord.data && alertRecord.data.length > 0) {
          if (alertRecord.data?.[0]?.id) {
            await admin
              .from('observability.sla_alerts')
              .update({
                notified_at: new Date().toISOString(),
                notification_sent: true,
              })
              .eq('id', alertRecord.data[0].id)
          }
        }
      }
    }

    const duration = Math.round(performance.now() - startedAt)

    return NextResponse.json(
      {
        ok: true,
        checked: metrics.length,
        alerts_triggered: alertsTriggered,
        alerts_sent: alertsToSend.length,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    log.error('observability_check.error', { err })
    const message = err instanceof Error ? err.message : 'Unknown error'

    return NextResponse.json(
      {
        ok: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }
}

export const GET = withRequestLog('/api/cron/observability-check', handleGET)
