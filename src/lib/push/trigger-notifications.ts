'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { sendPushToUser } from './send'

async function runTriggerOrderShippedNotification(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך נשלחה',
    body: 'הזמנה שלך בדרך אליך',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

async function runTriggerOrderDeliveredNotification(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך הגיעה',
    body: 'הזמנה שלך הגיעה! אנו מקווים שאתה מרוצה',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

async function runTriggerFlashDealMatchNotification(
  userId: string,
  productName: string,
  productSlug: string,
) {
  return sendPushToUser(userId, {
    title: 'דיל הבזק שחיפשת',
    body: `${productName} בהנחה עכשיו!`,
    data: {
      url: `/products/${productSlug}`,
    },
  })
}

async function runTriggerVoucherExpiryNotifications(
  userVoucherMap: Record<string, { code: string; count: number }>,
) {
  const notifications = Object.entries(userVoucherMap).map(([userId, { code, count }]) =>
    sendPushToUser(userId, {
      title: 'קופון שלך עומד להתפוג',
      body:
        count === 1
          ? `קופון ${code} יתפוג בעוד 24 שעות. קח זוג עכשיו!`
          : `${count} קופונים שלך יתפוגו בעוד 24 שעות. קח דיל עכשיו!`,
      data: {
        url: '/account/vouchers',
      },
    }),
  )

  const results = await Promise.all(notifications)
  return results.reduce(
    (acc, curr) => ({ sent: acc.sent + curr.sent, failed: acc.failed + curr.failed }),
    { sent: 0, failed: 0 },
  )
}

export async function triggerOrderShippedNotification(userId: string, orderId: string) {
  return withActionContext('push.trigger.triggerOrderShippedNotification', () =>
    runTriggerOrderShippedNotification(userId, orderId),
  )
}

export async function triggerOrderDeliveredNotification(userId: string, orderId: string) {
  return withActionContext('push.trigger.triggerOrderDeliveredNotification', () =>
    runTriggerOrderDeliveredNotification(userId, orderId),
  )
}

export async function triggerFlashDealMatchNotification(
  userId: string,
  productName: string,
  productSlug: string,
) {
  return withActionContext('push.trigger.triggerFlashDealMatchNotification', () =>
    runTriggerFlashDealMatchNotification(userId, productName, productSlug),
  )
}

export async function triggerVoucherExpiryNotifications(
  userVoucherMap: Record<string, { code: string; count: number }>,
) {
  return withActionContext('push.trigger.triggerVoucherExpiryNotifications', () =>
    runTriggerVoucherExpiryNotifications(userVoucherMap),
  )
}
