'use client'

import { passkeysEnabled } from '@/lib/auth/passkeys-flag'
import { createClient } from '@/lib/supabase/client'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'ke_passkey_banner_dismissed'

/**
 * Offered once a purchase has gone through, to a signed-in customer who has no
 * passkey yet: next time they sign in with FaceID or TouchID instead of a code.
 * Hidden where WebAuthn is unsupported, for guests, after a dismissal, and once
 * a passkey exists.
 */
export default function PasskeyBanner() {
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        if (
          !passkeysEnabled() ||
          !browserSupportsWebAuthn() ||
          localStorage.getItem(DISMISS_KEY) === '1'
        )
          return
        const supabase = createClient()
        const { data: auth, error: authError } = await supabase.auth.getUser()
        if (authError || !auth.user) return
        const { count, error } = await supabase
          .from('webauthn_credentials')
          .select('id', { count: 'exact', head: true })
        if (!cancelled && !error && count === 0) setVisible(true)
      } catch {
        // Banner is optional; stay hidden.
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible) return null

  async function enable() {
    setState('working')
    try {
      const optionsRes = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step: 'options' }),
      })
      const optionsJson = await optionsRes.json()
      if (!optionsJson.ok) throw new Error(optionsJson.error)
      const attestation = await startRegistration({ optionsJSON: optionsJson.options })
      const verifyRes = await fetch('/api/auth/passkey/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          step: 'verify',
          response: attestation,
          name: navigator.userAgent.includes('iPhone') ? 'iPhone' : 'מכשיר זה',
        }),
      })
      const verifyJson = await verifyRes.json()
      if (!verifyJson.ok) throw new Error(verifyJson.error)
      setState('done')
    } catch (err) {
      if (/NotAllowedError|AbortError/.test(String((err as { name?: string })?.name))) {
        setState('idle')
      } else {
        setState('error')
      }
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
    <aside aria-label="מפתח גישה" className="push-prompt">
      {state === 'done' ? (
        <p>מעולה. בפעם הבאה אפשר להיכנס בזיהוי פנים או בטביעת אצבע.</p>
      ) : (
        <>
          <p>רוצים להיכנס בפעם הבאה בזיהוי פנים או בטביעת אצבע, בלי קוד?</p>
          {state === 'error' && <p role="alert">לא הצלחנו להוסיף מפתח גישה. אפשר לנסות שוב.</p>}
          <div className="push-prompt__actions">
            <button type="button" onClick={enable} disabled={state === 'working'}>
              {state === 'working' ? 'מוסיפים...' : 'הוספת מפתח גישה'}
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
