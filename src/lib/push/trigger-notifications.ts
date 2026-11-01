import { sendPushToUser } from './send'

export async function triggerOrderShippedNotification(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך נשלחה',
    body: 'הזמנה שלך בדרך אליך',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

export async function triggerOrderDeliveredNotification(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך הגיעה',
    body: 'הזמנה שלך הגיעה! אנו מקווים שאתה מרוצה',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

export async function triggerFlashDealMatchNotification(
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

export async function triggerVoucherExpiryNotifications(
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
