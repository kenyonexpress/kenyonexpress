'use client'

import { urlBase64ToUint8Array, vapidPublicKey } from '@/lib/push/vapid'
import { removePushSubscription, savePushSubscription } from '@/server/actions/push'
import { useEffect, useState } from 'react'

/**
 * The notification permission flow, and the only place it may start from.
 *
 * The browser prompt is asked for HERE, off an explicit button press on the
 * notifications page, never on page load: an unprompted permission dialog is
 * the fastest route to a permanent "Block", and a blocked origin cannot ask
 * again -- the user has to dig through site settings to undo it. That is also
 * why `denied` gets its own resting state with instructions instead of a
 * retry button that cannot work.
 *
 * Ordering inside enable(): the server save runs before anything is shown as
 * on, and a save that fails unsubscribes the fresh subscription. A
 * subscription that exists in the browser but not in the table is worse than
 * none: it looks enabled and can never receive anything, because the auth
 * secret is only readable at mint time.
 */

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'busy' | 'on'

const COPY: Record<Exclude<Status, 'busy'>, string> = {
  checking: 'בודק את מצב ההתראות בדפדפן הזה...',
  unsupported:
    'הדפדפן הזה לא תומך בהתראות, או שהאפליקציה עוד לא נטענה במלואה. נסו מהמסך הראשי אחרי התקנת האפליקציה.',
  denied:
    'ההתראות חסומות בהגדרות הדפדפן לאתר הזה. כדי להפעיל אותן, אפשרו התראות בהגדרות האתר בדפדפן ורעננו את העמוד.',
  off: 'קבלו עדכון כשההזמנה יוצאת לדרך, כשקופון ממתין לכם וכשנכנס קאשבק לארנק.',
  on: 'התראות פעילות בדפדפן הזה. אפשר לכבות בכל רגע, בלי לאבד שום דבר בחשבון.',
}

export default function PushOptIn() {
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window) ||
        !vapidPublicKey()
      ) {
        return 'unsupported' as const
      }
      if (Notification.permission === 'denied') return 'denied' as const
      const registration = await navigator.serviceWorker.getRegistration()
      // No registration means the worker is not live here (dev, private mode,
      // enterprise policy); the button would only produce a confusing failure.
      if (!registration) return 'unsupported' as const
      const subscription = await registration.pushManager.getSubscription()
      return subscription ? ('on' as const) : ('off' as const)
    }
    probe()
      .catch(() => 'unsupported' as const)
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enable = async () => {
    setError(null)
    setStatus('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const registration = await navigator.serviceWorker.getRegistration()
      const key = vapidPublicKey()
      if (!registration || !key) {
        setStatus('unsupported')
        return
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
        }))
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        await subscription.unsubscribe()
        setStatus('off')
        setError('הדפדפן החזיר מנוי לא תקין, נסו שוב')
        return
      }
      const saved = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      if ('error' in saved) {
        // See the header: browser-on + table-off is the unrecoverable combo.
        await subscription.unsubscribe()
        setStatus('off')
        setError(saved.error)
        return
      }
      setStatus('on')
    } catch {
      setStatus('off')
      setError('הפעלת ההתראות נכשלה, נסו שוב')
    }
  }

  const disable = async () => {
    setError(null)
    setStatus('busy')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        // Best effort: the browser-side unsubscribe already made the row
        // undeliverable, so a failure here only leaves a dead row behind.
        await removePushSubscription(endpoint)
      }
      setStatus('off')
    } catch {
      setStatus('off')
      setError('כיבוי ההתראות נכשל, נסו שוב')
    }
  }

  return (
    <section className="account-card">
      <h2 className="account-card__title">התראות דחיפה</h2>
      <p className="account-row__meta">{status === 'busy' ? COPY.checking : COPY[status]}</p>
      {error && (
        <p className="account-row__meta" role="alert">
          {error}
        </p>
      )}
      {(status === 'off' || status === 'on') && (
        <p style={{ marginTop: 12 }}>
          <button
            type="button"
            className="account-btn"
            onClick={status === 'off' ? enable : disable}
          >
            {status === 'off' ? 'הפעלת התראות בדפדפן הזה' : 'כיבוי התראות בדפדפן הזה'}
          </button>
        </p>
      )}
    </section>
  )
}
