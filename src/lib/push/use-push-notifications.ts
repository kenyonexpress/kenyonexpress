import { useEffect, useState } from 'react'

export function usePushNotifications(userToken?: string) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)

    if (supported && userToken) {
      checkSubscription()
      registerServiceWorker()
    }
  }, [userToken])

  async function registerServiceWorker() {
    try {
      if (!('serviceWorker' in navigator)) return
      await navigator.serviceWorker.register('/sw.js')
    } catch (error) {
      console.error('Failed to register service worker:', error)
    }
  }

  async function checkSubscription() {
    try {
      const registration = await navigator.serviceWorker?.ready
      if (!registration) return

      const subscription = await registration.pushManager.getSubscription()
      setIsSubscribed(!!subscription)
    } catch (error) {
      console.error('Failed to check subscription:', error)
    }
  }

  async function subscribe() {
    if (!userToken) return

    setIsLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setIsLoading(false)
        return
      }

      const registration = await navigator.serviceWorker?.ready
      if (!registration) throw new Error('Service worker not ready')

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(subscription),
      })

      if (response.ok) {
        setIsSubscribed(true)
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function unsubscribe() {
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker?.ready
      if (!registration) return

      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        setIsSubscribed(false)
      }
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  }
}
