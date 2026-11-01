import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'

/**
 * Configured on first send, not at import. web-push throws on a malformed VAPID
 * key, and doing that at module load made every importer (a cron route, a test,
 * a build that collects page data) fail for want of a key that only a send needs.
 */
let vapidConfigured = false
function configureVapid(): void {
  if (vapidConfigured) return
  webpush.setVapidDetails(
    'mailto:support@kenyonexpress.co.il',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  vapidConfigured = true
}

interface PushNotification {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: Record<string, string>
}

export async function sendPushToUser(
  userId: string,
  notification: PushNotification,
): Promise<{ sent: number; failed: number }> {
  const supabase = createAdminClient()

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    log.error('push.fetch_subscriptions_failed', { reason: error.message })
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  if ((subscriptions ?? []).length > 0) configureVapid()

  for (const sub of subscriptions || []) {
    try {
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192x192.png',
        badge: notification.badge || '/badge-72x72.png',
        data: notification.data || {},
      })

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth,
          },
        },
        payload,
      )

      sent++
    } catch (err) {
      log.error('push.send_failed', { reason: err instanceof Error ? err.message : 'unknown' })
      failed++

      if (err instanceof Error && err.message.includes('410')) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }

  return { sent, failed }
}

export async function sendPushToUsers(
  userIds: string[],
  notification: PushNotification,
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0
  let totalFailed = 0

  for (const userId of userIds) {
    const result = await sendPushToUser(userId, notification)
    totalSent += result.sent
    totalFailed += result.failed
  }

  return { sent: totalSent, failed: totalFailed }
}
