'use client'

import { usePushNotifications } from '@/lib/push/use-push-notifications'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useState } from 'react'

interface PushNotificationsToggleProps {
  hasOrders: boolean
}

export default function PushNotificationsToggle({ hasOrders }: PushNotificationsToggleProps) {
  const [userToken, setUserToken] = useState<string | undefined>()
  const [isMounted, setIsMounted] = useState(false)
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePushNotifications(userToken)

  useEffect(() => {
    setIsMounted(true)

    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      setUserToken(data.session?.access_token)
    })
  }, [])

  const handleToggle = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }, [isSubscribed, subscribe, unsubscribe])

  if (!isMounted || !isSupported || !hasOrders || !userToken) {
    return null
  }

  return (
    <div className="push-notifications-toggle">
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={isSubscribed}
          onChange={handleToggle}
          disabled={isLoading}
          className="toggle-input"
        />
        <span className="toggle-text">קבל התראות על דילים חדשים</span>
      </label>
      {!isSubscribed && (
        <p className="toggle-hint">
          קבל התראות בטלפון שלך כשמסתיים דיל שהוא בטוב-לב שלך או כשנשלח הזמנה שלך
        </p>
      )}
    </div>
  )
}
