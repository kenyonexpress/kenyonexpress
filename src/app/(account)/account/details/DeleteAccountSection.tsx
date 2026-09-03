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
    <section className="bg-white border border-red-200 rounded-xl p-5 space-y-4">
      <h2 className="font-semibold text-red-700">מחיקת חשבון</h2>
      <div className="text-sm text-muted space-y-2">
        <p>
          המחיקה מיידית ובלתי הפיכה: הפרטים האישיים (שם, אימייל, טלפון), הכתובות, כרטיסי האשראי
          השמורים והעגלה יימחקו, וההתחברות תבוטל.
        </p>
        <p>
          היסטוריית הזמנות, תשלומים וחשבוניות נשמרת ללא שם, כנדרש בחוק (שמירת רשומות הנהלת חשבונות),
          ואינה ניתנת לשיוך אליך.
        </p>
      </div>
      <form action={action} className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-1"
          />
          <span>אני מבין/ה שהמחיקה בלתי הפיכה ושלא אוכל להתחבר שוב לחשבון זה</span>
        </label>
        <div>
          <label htmlFor="delete-confirm" className="block text-xs font-medium text-muted mb-1">
            הקלידו למטה: "{DELETE_CONFIRMATION_PHRASE}"
          </label>
          <input
            id="delete-confirm"
            name="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            dir="rtl"
            autoComplete="off"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        {state && 'error' in state && state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={!armed || pending}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          {pending ? 'מוחק...' : 'מחיקת החשבון לצמיתות'}
        </button>
      </form>
    </section>
  )
}
