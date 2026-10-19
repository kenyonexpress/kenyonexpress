/**
 * ntfy.sh alert integration for SLA violations
 * Sends notifications to ntfy.sh/kenyon-ofir-limit
 */

export interface NtfyAlertPayload {
  endpoint: string
  method: string
  alertType: 'p95_exceeded' | 'error_rate_high' | 'downtime'
  severity: 'info' | 'warning' | 'critical'
  metricValue: number | string
  thresholdValue: number | string
  timestamp: string
}

/**
 * Format severity as emoji and color tag
 */
function formatSeverityTag(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴'
    case 'warning':
      return '🟠'
    case 'info':
      return '🔵'
    default:
      return '⚪'
  }
}

/**
 * Format alert type as readable string
 */
function formatAlertType(type: string): string {
  switch (type) {
    case 'p95_exceeded':
      return 'P95 Latency Exceeded'
    case 'error_rate_high':
      return 'High Error Rate'
    case 'downtime':
      return 'Service Downtime'
    default:
      return type
  }
}

/**
 * Send SLA alert to ntfy.sh
 */
export async function sendNtfyAlert(
  payload: NtfyAlertPayload,
  target = 'ntfy.sh/kenyon-ofir-limit',
): Promise<boolean> {
  try {
    // Build ntfy.sh URL
    const ntfyUrl = `https://${target}`

    // Format title and message
    const severityTag = formatSeverityTag(payload.severity)
    const alertType = formatAlertType(payload.alertType)

    const title = `${severityTag} ${alertType} - ${payload.endpoint}`

    const message = `
${payload.method} ${payload.endpoint}
⚠️ Alert: ${alertType}
📊 Current: ${payload.metricValue}
🎯 Threshold: ${payload.thresholdValue}
⏰ ${new Date(payload.timestamp).toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' })}
    `.trim()

    // Send to ntfy.sh
    const response = await fetch(ntfyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: title,
        Tags: `${payload.severity},observability`,
        Priority: payload.severity === 'critical' ? 'high' : 'default',
      },
      body: message,
    })

    if (!response.ok) {
      console.error(`[ntfy] Failed to send alert: ${response.status} ${response.statusText}`)
      return false
    }

    console.log(`[ntfy] Alert sent: ${title}`)
    return true
  } catch (err) {
    console.error('[ntfy] Error sending alert:', err)
    return false
  }
}

/**
 * Send alert batch to ntfy.sh
 */
export async function sendNtfyAlertBatch(
  alerts: NtfyAlertPayload[],
  target = 'ntfy.sh/kenyon-ofir-limit',
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(alerts.map((alert) => sendNtfyAlert(alert, target)))

  const sent = results.filter((r) => r).length
  const failed = results.filter((r) => !r).length

  return { sent, failed }
}

/**
 * Build health status summary for ntfy
 */
export function buildHealthSummary(
  healthyEndpoints: number,
  degradedEndpoints: number,
  downEndpoints: number,
): NtfyAlertPayload {
  return {
    endpoint: 'System Health',
    method: 'GET',
    alertType: 'error_rate_high',
    severity: downEndpoints > 0 ? 'critical' : degradedEndpoints > 0 ? 'warning' : 'info',
    metricValue: `${healthyEndpoints} healthy, ${degradedEndpoints} degraded, ${downEndpoints} down`,
    thresholdValue: 'All healthy',
    timestamp: new Date().toISOString(),
  }
}
