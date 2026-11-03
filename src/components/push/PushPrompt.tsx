'use client'

import { urlBase64ToUint8Array } from '@/lib/push/vapid'
import { savePushSubscription } from '@/server/actions/push'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'ke_push_prompt_dismissed'

/**
 * Offered once a purchase has gone through: reminders before a coupon
 * expires are the reason to say yes, and they only exist after buying one.
 * Shown only when the browser supports push, the site has a VAPID key, the
 * visitor has not decided yet, and they have not dismissed it before.
 */
export default function PushPrompt() {
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    try {
      if (
        vapid &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        Notification.permission === 'default' &&
        localStorage.getItem(DISMISS_KEY) !== '1'
      ) {
        setVisible(true)
      }
    } catch {
      setVisible(false)
    }
  }, [vapid])

  if (!visible || !vapid) return null

  async function enable() {
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setVisible(false)
        return
      }
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'))
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid as string).buffer as ArrayBuffer,
        }))
      // The cookie-authed action, not /api/push/subscribe: that route takes a
      // Bearer token this page does not have, so every save from here was a
      // 401 and the shopper saw "could not enable" after granting permission.
      // A guest buyer is an anonymous Supabase user, which the action accepts.
      const json = subscription.toJSON()
      const saved = await savePushSubscription({
        endpoint: json.endpoint ?? '',
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      })
      if ('error' in saved) {
        // Browser subscribed with no stored row is unreachable and also stops
        // the next attempt from asking again; undo it.
        await subscription.unsubscribe()
        setState('error')
        return
      }
      setState('done')
    } catch {
      setState('error')
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private mode: the banner simply comes back next time.
    }
    setVisible(false)
  }

  return (
    <aside aria-label="התראות" className="push-prompt">
      {state === 'done' ? (
        <p>מעולה. נזכיר לך שבוע ויום לפני שתוקף קופון פג.</p>
      ) : (
        <>
          <p>רוצים תזכורת שבוע ויום לפני שתוקף הקופון פג?</p>
          {state === 'error' && <p role="alert">לא הצלחנו להפעיל התראות. אפשר לנסות שוב.</p>}
          <div className="push-prompt__actions">
            <button type="button" onClick={enable} disabled={state === 'working'}>
              {state === 'working' ? 'מפעילים...' : 'הפעלת התראות'}
            </button>
            <button type="button" onClick={dismiss}>
              לא עכשיו
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
