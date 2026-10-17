/**
 * Helper functions for marketing email broadcast operations.
 */

export interface BroadcastMetrics {
  totalRecipients: number
  sentCount: number
  openedCount: number
  openRate: number
  clickedCount: number
  clickRate: number
  bouncedCount: number
  bounceRate: number
  complainedCount: number
  complaintRate: number
  unsubscribedCount: number
  unsubscribeRate: number
  hardBounces?: number
  softBounces?: number
}

/**
 * Calculate email marketing metrics from recipient data.
 */
export function calculateBroadcastMetrics(
  recipients: Array<{
    status: string
    opened_at: string | null
    clicked_at: string | null
  }>,
): BroadcastMetrics {
  const total = recipients.length || 1

  const sent = recipients.filter((r) => r.status === 'sent').length
  const opened = recipients.filter((r) => r.opened_at !== null).length
  const clicked = recipients.filter((r) => r.clicked_at !== null).length
  const bounced = recipients.filter((r) => r.status === 'bounced').length
  const complained = recipients.filter((r) => r.status === 'complained').length
  const unsubscribed = recipients.filter((r) => r.status === 'unsubscribed').length

  return {
    totalRecipients: total,
    sentCount: sent,
    openedCount: opened,
    openRate: Math.round((opened / total) * 10000) / 100,
    clickedCount: clicked,
    clickRate: Math.round((clicked / total) * 10000) / 100,
    bouncedCount: bounced,
    bounceRate: Math.round((bounced / total) * 10000) / 100,
    complainedCount: complained,
    complaintRate: Math.round((complained / total) * 10000) / 100,
    unsubscribedCount: unsubscribed,
    unsubscribeRate: Math.round((unsubscribed / total) * 10000) / 100,
  }
}

/**
 * Validate email address format (basic check).
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Check if bounce rate is acceptable (< 5%).
 */
export function isBounceRateAcceptable(bounceRate: number): boolean {
  return bounceRate < 5
}

/**
 * Check if complaint rate is acceptable (< 0.5%).
 */
export function isComplaintRateAcceptable(complaintRate: number): boolean {
  return complaintRate < 0.5
}

/**
 * Check if delivery is healthy overall.
 */
export function isDeliveryHealthy(metrics: BroadcastMetrics): boolean {
  const deliveryRate =
    ((metrics.totalRecipients - metrics.bouncedCount) / metrics.totalRecipients) * 100
  const hasAcceptableBounce = metrics.bounceRate < 5
  const hasAcceptableComplaint = metrics.complaintRate < 0.5

  return deliveryRate > 95 && hasAcceptableBounce && hasAcceptableComplaint
}

/**
 * Determine the health status color for UI display.
 */
export function getDeliveryHealthColor(metrics: BroadcastMetrics): 'green' | 'yellow' | 'red' {
  if (metrics.totalRecipients === 0) return 'gray' as never
  if (isDeliveryHealthy(metrics)) return 'green'
  if (metrics.bounceRate > 10 || metrics.complaintRate > 1) return 'red'
  return 'yellow'
}

/**
 * Format metric as percentage with 2 decimal places.
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value * 100) / 100}%`
}

/**
 * Get segment-specific properties.
 */
export function getSegmentProperties(segment: string): {
  displayName: string
  description: string
  icon: string
  color: string
} {
  const properties: Record<
    string,
    {
      displayName: string
      description: string
      icon: string
      color: string
    }
  > = {
    Champions: {
      displayName: 'Champions',
      description: 'VIP customers - high spend, frequent purchases, recent activity',
      icon: '⭐',
      color: 'gold',
    },
    Loyal: {
      displayName: 'Loyal',
      description: 'Repeat customers with consistent engagement',
      icon: '💎',
      color: 'blue',
    },
    Potential: {
      displayName: 'Potential',
      description: 'Recent shoppers with growth potential',
      icon: '🚀',
      color: 'green',
    },
    'At-Risk': {
      displayName: 'At-Risk',
      description: 'Customers showing signs of churn',
      icon: '⚠️',
      color: 'orange',
    },
    Dormant: {
      displayName: 'Dormant',
      description: 'Inactive customers (180+ days)',
      icon: '😴',
      color: 'gray',
    },
  }

  return (
    properties[segment] || {
      displayName: segment,
      description: 'Customer segment',
      icon: '📧',
      color: 'default',
    }
  )
}

/**
 * Estimate email delivery time based on provider.
 */
export function estimateDeliveryTime(): string {
  // Resend typically delivers within seconds to minutes
  return '< 5 minutes'
}

/**
 * Get recommended retry count for failed sends.
 */
export function getRecommendedRetryCount(): number {
  return 5
}

/**
 * Get recommended backoff multiplier for exponential backoff.
 */
export function getBackoffMultiplier(): number {
  return 2
}

/**
 * Get initial retry delay in minutes.
 */
export function getInitialRetryDelay(): number {
  return 5
}
