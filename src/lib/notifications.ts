/**
 * Push notifications via ntfy.sh for admin alerts.
 *
 * Used for critical events that need immediate attention (new orders,
 * system alerts, threshold breaches). Rate-limited and fire-and-forget.
 */

const NTFY_TOPIC = 'kenyon-ofir-limit'
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`

export interface NotifyOptions {
  title?: string
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent'
  tags?: string[]
}

/**
 * Send a notification to the admin's ntfy topic.
 * Fire-and-forget: logs errors but never throws.
 */
export async function notify(message: string, options: NotifyOptions = {}): Promise<void> {
  const { title, priority = 'default', tags = [] } = options

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
    }

    if (title) headers.Title = title
    if (priority !== 'default') headers.Priority = priority
    if (tags.length > 0) headers.Tags = tags.join(',')

    const response = await fetch(NTFY_URL, {
      method: 'POST',
      headers,
      body: message,
    })

    if (!response.ok) {
      console.error('[notify] ntfy returned', response.status, await response.text())
    }
  } catch (err) {
    console.error('[notify] failed to send:', err)
  }
}

/**
 * Send a notification for a new paid order.
 */
export async function notifyNewOrder(params: {
  orderId: string
  productTitle: string
  amountAgorot: number
}): Promise<void> {
  const { orderId, productTitle, amountAgorot } = params
  const shortId = orderId.slice(0, 8)

  // Format as literal '₪{amount}' without Unicode control characters
  const whole = Math.floor(amountAgorot / 100)
  const fraction = amountAgorot % 100
  const amount = `${whole}.${String(fraction).padStart(2, '0')}`

  await notify(`New order #${shortId}: ${productTitle} ₪${amount}`, {
    title: 'New Order',
    priority: 'high',
    tags: ['moneybag', 'tada'],
  })
}
