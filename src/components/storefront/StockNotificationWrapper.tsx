import { getStockNotifications } from '@/server/actions/stock-notifications'
import NotifyMeButton from './NotifyMeButton'

interface StockNotificationWrapperProps {
  productId: string
  productName: string
  isOutOfStock: boolean
}

export default async function StockNotificationWrapper({
  productId,
  productName,
  isOutOfStock,
}: StockNotificationWrapperProps) {
  if (!isOutOfStock) {
    return null
  }

  const { subscribed, notificationId } = await getStockNotifications(productId)

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <NotifyMeButton
        productId={productId}
        productName={productName}
        isSubscribed={subscribed}
        notificationId={notificationId}
      />
    </div>
  )
}
