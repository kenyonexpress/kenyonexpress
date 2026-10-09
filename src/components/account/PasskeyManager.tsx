'use client'

import { formatDate } from '@/lib/account/format'
import type { PasskeySummary } from '@/lib/auth/passkeys/store'
import {
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyRegistration,
  listPasskeys,
} from '@/server/actions/passkeys'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { useEffect, useState, useTransition } from 'react'

/**
 * The ceremony is driven from the client because only the browser can talk to
 * the authenticator: begin action, `navigator.credentials.create` via
 * startRegistration, finish action. Everything that decides anything happens
 * on the server; this component is choreography and Hebrew.
 */

type Feedback = { error: string } | { success: string } | null

function deviceLabel(passkey: PasskeySummary): string {
  if (passkey.friendly_name) return passkey.friendly_name
  return passkey.device_type === 'multiDevice' ? 'מפתח מסונכרן בין מכשירים' : 'מפתח במכשיר הזה'
}

function registrationErrorHebrew(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'NotAllowedError') {
    return 'ההרשמה בוטלה או שלא אושרה במכשיר'
  }
  if (cause instanceof Error && cause.name === 'InvalidStateError') {
    return 'המכשיר הזה כבר רשום בחשבון'
  }
  return 'הוספת המפתח נכשלה, נסו שוב'
}

export default function PasskeyManager({ initial }: { initial: PasskeySummary[] }) {
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>(initial)
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [supported, setSupported] = useState(false)
  const [pending, startTransition] = useTransition()

  // Support is a browser fact, so it is only knowable after hydration; the
  // server renders the unsupported state and the effect upgrades it.
  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
  }, [])

  async function refresh(): Promise<void> {
    const result = await listPasskeys()
    if ('available' in result && result.available) setPasskeys(result.passkeys)
  }

  function register(): void {
    startTransition(async () => {
      setFeedback(null)
      const begin = await beginPasskeyRegistration()
      if ('error' in begin) {
        setFeedback({ error: begin.error })
        return
      }
      let response: Awaited<ReturnType<typeof startRegistration>>
      try {
        response = await startRegistration({ optionsJSON: begin.options })
      } catch (cause) {
        setFeedback({ error: registrationErrorHebrew(cause) })
        return
      }
      const finish = await finishPasskeyRegistration(response, name)
      setFeedback(finish)
      if (finish && 'success' in finish) {
        setName('')
        await refresh()
      }
    })
  }

  function remove(id: string): void {
    startTransition(async () => {
      setFeedback(null)
      const result = await deletePasskey(id)
      setFeedback(result)
      if (result && 'success' in result) await refresh()
    })
  }

  return (
    <section className="account-card">
      <h2 className="account-card__title">מפתחות כניסה (Passkeys)</h2>
      <p className="account-row__meta">
        כניסה מהירה עם טביעת אצבע, Face ID או קוד המכשיר, בלי סיסמה. המפתח נשמר במכשיר שלכם ולא ניתן
        לנחש או לגנוב אותו מרחוק.
      </p>

      {feedback && 'error' in feedback && (
        <p className="account-alert account-alert--error" role="alert">
          {feedback.error}
        </p>
      )}
      {feedback && 'success' in feedback && (
        <output className="account-alert account-alert--success">{feedback.success}</output>
      )}

      {passkeys.length === 0 ? (
        <p className="account-row__meta">עוד לא נרשמו מפתחות כניסה בחשבון הזה.</p>
      ) : (
        passkeys.map((passkey) => (
          <div className="account-row" key={passkey.id}>
            <div className="account-row__main">
              <p className="account-row__title">
                {deviceLabel(passkey)}{' '}
                {passkey.backed_up && (
                  <span className="account-chip account-chip--default">מגובה בענן</span>
                )}
              </p>
              <p className="account-row__meta">
                נוסף ב-{formatDate(passkey.created_at)}
                {passkey.last_used_at
                  ? `, שימוש אחרון ${formatDate(passkey.last_used_at)}`
                  : ', עוד לא היה בשימוש'}
              </p>
            </div>
            <div className="account-row__actions">
              <button
                className="account-btn account-btn--danger"
                type="button"
                disabled={pending}
                onClick={() => remove(passkey.id)}
              >
                הסרה
              </button>
            </div>
          </div>
        ))
      )}

      {supported ? (
        <div style={{ marginTop: 16 }}>
          <label className="account-row__meta" htmlFor="passkey-name">
            שם למפתח (לא חובה, לדוגמה: האייפון שלי)
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input
              id="passkey-name"
              type="text"
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
            <button className="account-btn" type="button" disabled={pending} onClick={register}>
              {pending ? 'רגע...' : 'הוספת מפתח'}
            </button>
          </div>
        </div>
      ) : (
        <p className="account-row__meta" style={{ marginTop: 16 }}>
          הדפדפן הזה לא תומך במפתחות כניסה.
        </p>
      )}
    </section>
  )
}
