'use client'

import {
  subscribeToStockNotification,
  unsubscribeFromStockNotification,
} from '@/server/actions/stock-notifications'
import { Bell, BellOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface NotifyMeButtonProps {
  productId: string
  productName: string
  isSubscribed?: boolean
  notificationId?: string
  onSubscribeChange?: (subscribed: boolean) => void
}

export default function NotifyMeButton({
  productId,
  productName: _productName,
  isSubscribed: initialSubscribed = false,
  notificationId,
  onSubscribeChange,
}: NotifyMeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleToggle = async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (isSubscribed && notificationId) {
        const result = await unsubscribeFromStockNotification(notificationId)
        if (result.success) {
          setIsSubscribed(false)
          onSubscribeChange?.(false)
        } else {
          setError(result.error || 'Failed to unsubscribe')
        }
      } else {
        const result = await subscribeToStockNotification(productId)
        if (result.success) {
          setIsSubscribed(true)
          onSubscribeChange?.(true)
        } else {
          if (result.error === 'Not authenticated') {
            router.push('/auth/login')
          } else {
            setError(result.error || 'Failed to subscribe')
          }
        }
      }
    } catch {
      setError('An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          isSubscribed
            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isSubscribed ? (
          <>
            <BellOff className="w-4 h-4" />
            {isLoading ? 'ביטול...' : 'בוטל הודעות'}
          </>
        ) : (
          <>
            <Bell className="w-4 h-4" />
            {isLoading ? 'רישום...' : 'הודע לי כשיהיה במלאי'}
          </>
        )}
      </button>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  )
}
