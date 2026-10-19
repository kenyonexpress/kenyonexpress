'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'ke_push_prompt_dismissed'

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

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
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapid as string) as BufferSource,
      })
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      setState(response.ok ? 'done' : 'error')
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
