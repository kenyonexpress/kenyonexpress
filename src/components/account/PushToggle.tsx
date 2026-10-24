'use client'

import { useEffect, useState, useTransition } from 'react'

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type Support = 'checking' | 'supported' | 'unsupported' | 'blocked'

/**
 * The browser push switch on /account/notifications. The switch reflects the
 * browser's own subscription, not a stored preference: a subscription is per
 * device, so "on" means this browser will receive reminders.
 */
export default function PushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const [support, setSupport] = useState<Support>('checking')
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    async function detect() {
      if (!vapid || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setSupport('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setSupport('blocked')
        return
      }
      const registration = await navigator.serviceWorker.getRegistration()
      const existing = await registration?.pushManager.getSubscription()
      setOn(Boolean(existing) && Notification.permission === 'granted')
      setSupport('supported')
    }
    detect().catch(() => setSupport('unsupported'))
  }, [vapid])

  async function enable() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      if (permission === 'denied') setSupport('blocked')
      return
    }
    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register('/sw.js'))
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapid as string) as BufferSource,
      }))
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!response.ok) throw new Error('store_failed')
    setOn(true)
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      await subscription.unsubscribe()
    }
    setOn(false)
  }

  function toggle() {
    setError(null)
    startTransition(async () => {
      try {
        if (on) await disable()
        else await enable()
      } catch {
        setError('לא הצלחנו לעדכן את ההתראות. אפשר לנסות שוב.')
      }
    })
  }

  const meta =
    support === 'unsupported'
      ? 'הדפדפן הזה לא תומך בהתראות.'
      : support === 'blocked'
        ? 'ההתראות חסומות בדפדפן. אפשר לאפשר אותן בהגדרות האתר.'
        : 'תזכורת שבוע ויום לפני שתוקף קופון פג, ועדכון כשסטטוס ההזמנה משתנה.'

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title" id="web-push-label">
          התראות דחיפה בדפדפן
        </p>
        <p className="account-row__meta">{meta}</p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="account-row__actions">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="web-push-label"
          onClick={toggle}
          disabled={pending || support !== 'supported'}
          className={`account-btn ${on ? '' : 'opacity-70'}`}
        >
          {on ? 'פעיל' : 'כבוי'}
        </button>
      </div>
    </div>
  )
}
