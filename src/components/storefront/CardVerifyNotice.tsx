'use client'

import { useSearchParams } from 'next/navigation'

const MESSAGES: Record<string, { text: string; good: boolean }> = {
  verified: {
    text: 'הכרטיס אומת והחיוב של 1 ש"ח בוטל. קיבלנו את הפרטים ונחזור אליכם בהקדם.',
    good: true,
  },
  failed: {
    text: 'אימות הכרטיס נכשל, ולכן הבקשה לא נשמרה. אפשר לנסות שוב עם כרטיס אחר.',
    good: false,
  },
  pending: { text: 'אימות הכרטיס עדיין בבדיקה. נעדכן אתכם במייל.', good: true },
}

/** The result of the ₪1 card verification, after Cardcom sends the applicant back. */
export default function CardVerifyNotice() {
  const card = useSearchParams().get('card') ?? ''
  const message = MESSAGES[card]
  if (!message) return null
  return (
    <p
      role={message.good ? undefined : 'alert'}
      className={`mb-6 rounded-lg px-3 py-2 text-sm ${message.good ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-600'}`}
    >
      {message.text}
    </p>
  )
}
