'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { sendPushToUser } from './send'

async function runNotifyOrderShipped(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך נשלחה',
    body: 'הזמנה שלך בדרך אליך',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

async function runNotifyOrderDelivered(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך הגיעה',
    body: 'הזמנה שלך הגיעה! אנו מקווים שאתה מרוצה',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

async function runNotifyFlashDealMatch(userId: string, productName: string, productSlug: string) {
  return sendPushToUser(userId, {
    title: 'דיל הבזק שחיפשת',
    body: `${productName} בהנחה עכשיו!`,
    data: {
      url: `/products/${productSlug}`,
    },
  })
}

export async function notifyOrderShipped(userId: string, orderId: string) {
  return withActionContext('push.notify.notifyOrderShipped', () =>
    runNotifyOrderShipped(userId, orderId),
  )
}

export async function notifyOrderDelivered(userId: string, orderId: string) {
  return withActionContext('push.notify.notifyOrderDelivered', () =>
    runNotifyOrderDelivered(userId, orderId),
  )
}

export async function notifyFlashDealMatch(
  userId: string,
  productName: string,
  productSlug: string,
) {
  return withActionContext('push.notify.notifyFlashDealMatch', () =>
    runNotifyFlashDealMatch(userId, productName, productSlug),
  )
}
