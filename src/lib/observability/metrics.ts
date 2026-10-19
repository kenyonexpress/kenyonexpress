import { createAdminClient } from '@/lib/supabase/admin'

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
      console.error('[observability] Failed to record metric:', error)
      return null
    }

    // Check for SLA breach
    if (data) {
      await checkAndTriggerSLAAlert(data as string)
    }

    return data
  } catch (err) {
    console.error('[observability] Error recording metric:', err)
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
      console.error('[observability] Failed to check SLA breach:', error)
      return false
    }

    return data as boolean
  } catch (err) {
    console.error('[observability] Error checking SLA:', err)
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
      console.error('[observability] Failed to fetch metrics:', error)
      return []
    }

    return (data || []) as EndpointMetric[]
  } catch (err) {
    console.error('[observability] Error fetching metrics:', err)
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
      console.error('[observability] Failed to fetch alerts:', error)
      return []
    }

    return (data || []) as SLAAlert[]
  } catch (err) {
    console.error('[observability] Error fetching alerts:', err)
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
      console.error('[observability] Failed to fetch metric:', error)
      return null
    }

    return (data || null) as EndpointMetric | null
  } catch (err) {
    console.error('[observability] Error fetching metric:', err)
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
      console.error('[observability] Failed to update status:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[observability] Error updating status:', err)
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
      console.error('[observability] Failed to acknowledge alert:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[observability] Error acknowledging alert:', err)
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
      console.error('[observability] Failed to resolve alert:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[observability] Error resolving alert:', err)
    return false
  }
}
