'use client'

import { DELETE_CONFIRMATION_PHRASE } from '@/lib/account/delete-account'
import { deleteAccount } from '@/server/actions/account'
import { useActionState, useState } from 'react'

const INITIAL = {} as Awaited<ReturnType<typeof deleteAccount>>

/**
 * The danger zone. Two gates before the button arms: an explicit "I understand"
 * checkbox, and the confirmation phrase typed exactly. A checkbox alone
 * confirms a finger; the typed phrase confirms a person read what happens.
 *
 * The copy states what is kept, because "deletion" here is legally
 * anonymization: invoices and order history are bookkeeping with a statutory
 * retention period and survive with no name on them.
 */
export default function DeleteAccountSection() {
  const [state, action, pending] = useActionState(deleteAccount, INITIAL)
  const [understood, setUnderstood] = useState(false)
  const [typed, setTyped] = useState('')
  const armed = understood && typed.trim() === DELETE_CONFIRMATION_PHRASE

  return (
    <section className="account-card account-card--danger">
      <h2 className="account-card__title">מחיקת חשבון</h2>
      <div className="account-card__body">
        <p>
          המחיקה מיידית ובלתי הפיכה: הפרטים האישיים (שם, אימייל, טלפון), הכתובות, כרטיסי האשראי
          השמורים והעגלה יימחקו, וההתחברות תבוטל.
        </p>
        <p>
          היסטוריית הזמנות, תשלומים וחשבוניות נשמרת ללא שם, כנדרש בחוק (שמירת רשומות הנהלת חשבונות),
          ואינה ניתנת לשיוך אליך.
        </p>
      </div>
      <form action={action} className="account-form">
        <label className="account-field account-field--check">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          <span>אני מבין/ה שהמחיקה בלתי הפיכה ושלא אוכל להתחבר שוב לחשבון זה</span>
        </label>
        <div className="account-field">
          <label htmlFor="delete-confirm" className="account-field__label">
            הקלידו למטה: "{DELETE_CONFIRMATION_PHRASE}"
          </label>
          <input
            id="delete-confirm"
            name="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            dir="rtl"
            autoComplete="off"
            className="account-field__input"
          />
        </div>
        {state && 'error' in state && state.error && (
          <p className="account-alert account-alert--error">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={!armed || pending}
          className="account-btn account-btn--destroy"
        >
          {pending ? 'מוחק...' : 'מחיקת החשבון לצמיתות'}
        </button>
      </form>
    </section>
  )
}
