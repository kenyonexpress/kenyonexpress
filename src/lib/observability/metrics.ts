import { createAdminClient } from '@/lib/supabase/admin'
import { log } from './log'

export interface EndpointMetric {
  id: string
  endpoint_path: string
  method: string
  p50_ms: number | null
  p95_ms: number
  p99_ms: number | null
  total_requests: bigint
  error_count: bigint
  error_rate_percent: number
  sla_target_percent: number
  sla_breached: boolean
  status: 'ok' | 'degraded' | 'down'
  last_error_at: string | null
  last_error_message: string | null
  updated_at: string
}

export interface SLAAlert {
  id: string
  endpoint_id: string
  alert_type: 'p95_exceeded' | 'error_rate_high' | 'downtime'
  severity: 'info' | 'warning' | 'critical'
  metric_value: number
  threshold_value: number
  triggered_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  notified_at: string | null
  notification_sent: boolean
  notification_target: string | null
  updated_at: string
}

/**
 * Record an endpoint hit and check for SLA violations
 */
export async function recordEndpointMetric(
  endpointPath: string,
  method: string,
  responseTimeMs: number,
  statusCode: number,
) {
  try {
    const admin = createAdminClient()

    // Record the metric
    const { data, error } = await admin.rpc('observability.record_endpoint_hit', {
      p_endpoint_path: endpointPath,
      p_method: method,
      p_response_time_ms: responseTimeMs,
      p_status_code: statusCode,
    })

    if (error) {
      log.error('observability.failed_to_record_metric', { error })
      return null
    }

    // Check for SLA breach
    if (data) {
      await checkAndTriggerSLAAlert(data as string)
    }

    return data
  } catch (err) {
    log.error('observability.error_recording_metric', { err })
    return null
  }
}

/**
 * Check if endpoint metrics breach SLA targets
 */
export async function checkAndTriggerSLAAlert(metricId: string) {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('observability.check_sla_breach', {
      p_metric_id: metricId,
    })

    if (error) {
      log.error('observability.failed_to_check_sla_breach', { error })
      return false
    }

    return data as boolean
  } catch (err) {
    log.error('observability.error_checking_sla', { err })
    return false
  }
}

/**
 * Get endpoint metrics for dashboard
 */
export async function getEndpointMetrics(): Promise<EndpointMetric[]> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('observability.endpoint_metrics')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      log.error('observability.failed_to_fetch_metrics', { error })
      return []
    }

    return (data || []) as EndpointMetric[]
  } catch (err) {
    log.error('observability.error_fetching_metrics', { err })
    return []
  }
}

/**
 * Get unresolved SLA alerts
 */
export async function getUnresolvedAlerts(): Promise<SLAAlert[]> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('observability.sla_alerts')
      .select('*')
      .is('resolved_at', null)
      .order('triggered_at', { ascending: false })

    if (error) {
      log.error('observability.failed_to_fetch_alerts', { error })
      return []
    }

    return (data || []) as SLAAlert[]
  } catch (err) {
    log.error('observability.error_fetching_alerts', { err })
    return []
  }
}

/**
 * Get endpoint metrics for a specific endpoint
 */
export async function getEndpointMetric(
  endpointPath: string,
  method: string,
): Promise<EndpointMetric | null> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('observability.endpoint_metrics')
      .select('*')
      .eq('endpoint_path', endpointPath)
      .eq('method', method)
      .single()

    if (error && error.code !== 'PGRST116') {
      log.error('observability.failed_to_fetch_metric', { error })
      return null
    }

    return (data || null) as EndpointMetric | null
  } catch (err) {
    log.error('observability.error_fetching_metric', { err })
    return null
  }
}

/**
 * Update endpoint status
 */
export async function updateEndpointStatus(
  endpointPath: string,
  method: string,
  status: 'ok' | 'degraded' | 'down',
) {
  try {
    const admin = createAdminClient()

    const { error } = await admin
      .from('observability.endpoint_metrics')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('endpoint_path', endpointPath)
      .eq('method', method)

    if (error) {
      log.error('observability.failed_to_update_status', { error })
      return false
    }

    return true
  } catch (err) {
    log.error('observability.error_updating_status', { err })
    return false
  }
}

/**
 * Mark alert as acknowledged
 */
export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()

    const { error } = await admin
      .from('observability.sla_alerts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', alertId)

    if (error) {
      log.error('observability.failed_to_acknowledge_alert', { error })
      return false
    }

    return true
  } catch (err) {
    log.error('observability.error_acknowledging_alert', { err })
    return false
  }
}

/**
 * Mark alert as resolved
 */
export async function resolveAlert(alertId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()

    const { error } = await admin
      .from('observability.sla_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', alertId)

    if (error) {
      log.error('observability.failed_to_resolve_alert', { error })
      return false
    }

    return true
  } catch (err) {
    log.error('observability.error_resolving_alert', { err })
    return false
  }
}
