/**
 * Helper functions for SMS broadcast operations
 */

export function isValidPhoneNumber(phone: string): boolean {
  // Israeli phone validation: 05X-XXXXXXX or +972XXXXXXXXX formats
  const normalized = phone.replace(/[\s\-()]/g, '')
  // Pattern 1: 05X followed by 7-8 digits (0524123456 or 052-1234567)
  // Pattern 2: +972 or 00972 prefix followed by 5-9 and 7-8 digits
  const pattern1 = /^0[5-9]\d{7,8}$/
  const pattern2 = /^(\+972|00972)[5-9]\d{7,8}$/
  return pattern1.test(normalized) || pattern2.test(normalized)
}

export function normalizePhoneNumber(phone: string): string {
  // Remove spaces, dashes, parentheses
  let normalized = phone.replace(/[\s\-()]/g, '')

  // Convert 0 prefix to +972
  if (normalized.startsWith('0')) {
    normalized = `+972${normalized.substring(1)}`
  }

  // Add +972 prefix if not present
  if (!normalized.startsWith('+972') && !normalized.startsWith('972')) {
    if (!normalized.startsWith('+')) {
      normalized = `+972${normalized}`
    }
  }

  return normalized
}

export function calculateSmsBroadcastMetrics(
  totalSent: number,
  delivered: number,
  failed: number,
  bounced: number,
  optedOut: number,
): {
  deliveryRate: number
  failureRate: number
  bounceRate: number
  optoutRate: number
} {
  if (totalSent === 0) {
    return { deliveryRate: 0, failureRate: 0, bounceRate: 0, optoutRate: 0 }
  }

  return {
    deliveryRate: Number(((delivered / totalSent) * 100).toFixed(2)),
    failureRate: Number(((failed / totalSent) * 100).toFixed(2)),
    bounceRate: Number(((bounced / totalSent) * 100).toFixed(2)),
    optoutRate: Number(((optedOut / totalSent) * 100).toFixed(2)),
  }
}

export function getMessageLength(message: string): number {
  // SMS character count: 160 for ASCII, 70 for Unicode
  return message.length
}

export function estimateSmsCost(recipientCount: number, pricePerSms = 0.01): number {
  // Returns cost in dollars
  return Number((recipientCount * pricePerSms).toFixed(3))
}

export function isDeliveryHealthy(bounceRate: number, optoutRate: number): boolean {
  // Industry standards: bounce rate < 5%, optout rate < 2%
  return bounceRate < 5 && optoutRate < 2
}

export function getDeliveryHealthColor(
  bounceRate: number,
  optoutRate: number,
): 'green' | 'yellow' | 'red' {
  if (bounceRate > 10 || optoutRate > 5) return 'red'
  if (bounceRate > 5 || optoutRate > 2) return 'yellow'
  return 'green'
}

export function getSegmentProperties(segment: string): {
  label: string
  icon: string
  color: string
  description: string
} {
  const properties: Record<
    string,
    {
      label: string
      icon: string
      color: string
      description: string
    }
  > = {
    Champions: {
      label: 'Champions',
      icon: 'star',
      color: 'gold',
      description: 'Frequent buyers, high spend',
    },
    Loyal: {
      label: 'Loyal',
      icon: 'heart',
      color: 'red',
      description: 'Regular customers with consistent purchase history',
    },
    Potential: {
      label: 'Potential',
      icon: 'rocket',
      color: 'blue',
      description: 'Recently engaged but low purchase frequency',
    },
    'At-Risk': {
      label: 'At-Risk',
      icon: 'alert',
      color: 'orange',
      description: 'Previously active customers showing declining engagement',
    },
    Dormant: {
      label: 'Dormant',
      icon: 'clock',
      color: 'gray',
      description: 'Inactive customers with no recent purchases',
    },
  }

  const result = properties[segment]
  if (result) {
    return result
  }

  return {
    label: 'Potential',
    icon: 'rocket',
    color: 'blue',
    description: 'Recently engaged but low purchase frequency',
  }
}

export function formatPhoneForDisplay(phone: string): string {
  // Format for display: +972-5X-XXXX-XXXX or 05X-XXXX-XXXX
  const normalized = normalizePhoneNumber(phone)

  if (normalized.startsWith('+972')) {
    const withoutPrefix = normalized.substring(4)
    return `+972-${withoutPrefix.substring(0, 2)}-${withoutPrefix.substring(2, 6)}-${withoutPrefix.substring(6)}`
  }

  return phone
}
