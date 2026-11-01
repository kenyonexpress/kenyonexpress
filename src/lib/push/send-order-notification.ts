import { sendPushToUser } from './send'

export async function notifyOrderShipped(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך נשלחה',
    body: 'הזמנה שלך בדרך אליך',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

export async function notifyOrderDelivered(userId: string, orderId: string) {
  return sendPushToUser(userId, {
    title: 'הזמנה שלך הגיעה',
    body: 'הזמנה שלך הגיעה! אנו מקווים שאתה מרוצה',
    data: {
      url: `/account/orders/${orderId}`,
    },
  })
}

export async function notifyFlashDealMatch(
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
