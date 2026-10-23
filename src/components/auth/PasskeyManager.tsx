'use client'

import { createClient } from '@/lib/supabase/client'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useCallback, useEffect, useState } from 'react'

type Credential = {
  id: string
  friendly_name: string | null
  created_at: string
  last_used_at: string | null
}

/**
 * The account's passkeys (rc5 F15): add one on this device, see and remove
 * the rest. Listing and removing run on the user's own session (the table's
 * select_own and delete_own policies); adding goes through the server, which
 * verifies the attestation before storing anything.
 */
export default function PasskeyManager() {
  const [supported, setSupported] = useState(false)
  const [items, setItems] = useState<Credential[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient()
      .from('webauthn_credentials')
      .select('id, friendly_name, created_at, last_used_at')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError('לא הצלחנו לטעון את מפתחות הגישה. נסו לרענן את הדף.')
      return
    }
    setItems((data ?? []) as Credential[])
  }, [])

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
    void load()
  }, [load])

  async function add() {
    setPending(true)
    setError(null)
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
      await load()
    } catch (err) {
      if (!/NotAllowedError|AbortError/.test(String((err as { name?: string })?.name))) {
        setError('הוספת מפתח הגישה נכשלה. נסו שוב.')
      }
    } finally {
      setPending(false)
    }
  }

  async function remove(id: string) {
    await createClient().from('webauthn_credentials').delete().eq('id', id)
    await load()
  }

  return (
    <section className="rounded-xl border border-border-alt bg-white p-5">
      <h2 className="font-semibold">מפתחות גישה</h2>
      <p className="mt-1 text-sm text-gray-600">
        כניסה בטביעת אצבע, בזיהוי פנים או בנעילת המסך של המכשיר, בלי סיסמה.
      </p>
      {items.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span>
                {c.friendly_name ?? 'מפתח גישה'} · נוסף{' '}
                {new Date(c.created_at).toLocaleDateString('he-IL')}
              </span>
              <button type="button" onClick={() => remove(c.id)} className="text-red-600 underline">
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {supported ? (
        <button type="button" onClick={add} disabled={pending} className="account-btn mt-3">
          {pending ? 'מוסיפים...' : 'הוספת מפתח גישה'}
        </button>
      ) : (
        <p className="mt-3 text-sm text-gray-600">הדפדפן הזה אינו תומך במפתחות גישה.</p>
      )}
    </section>
  )
}
