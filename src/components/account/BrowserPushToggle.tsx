'use client'

import { useEffect, useState } from 'react'

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * Per-browser push switch (rc5 F14). On subscribes this browser through the
 * service worker and stores it; off unsubscribes and deletes the stored row.
 */
export default function BrowserPushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const [supported, setSupported] = useState(false)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vapid || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    setSupported(true)
    navigator.serviceWorker
      .getRegistration()
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setOn(Boolean(s) && Notification.permission === 'granted'))
      .catch(() => setOn(false))
  }, [vapid])

  if (!supported || !vapid) return null

  async function enable() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('denied')
    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register('/sw.js'))
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapid as string) as BufferSource,
    })
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!response.ok) {
      await subscription.unsubscribe()
      throw new Error('store_failed')
    }
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
  }

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (on) await disable()
      else await enable()
      setOn(!on)
    } catch (e) {
      setError(
        (e as Error).message === 'denied'
          ? 'ההתראות חסומות בדפדפן. אפשר לאפשר אותן בהגדרות האתר.'
          : 'לא הצלחנו לעדכן את ההתראות. אפשר לנסות שוב.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title" id="browser-push-label">
          התראות בדפדפן זה
        </p>
        <p className="account-row__meta">תזכורות לפני שתוקף קופון פג ועדכונים, גם כשהאתר סגור.</p>
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
          aria-labelledby="browser-push-label"
          onClick={toggle}
          disabled={busy}
          className={`account-btn ${on ? '' : 'opacity-70'}`}
        >
          {on ? 'פעיל' : 'כבוי'}
        </button>
      </div>
    </div>
  )
}
