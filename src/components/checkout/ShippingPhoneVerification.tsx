'use client'

import { useState } from 'react'

const ERRORS: Record<string, string> = {
  invalid_phone: 'נא להזין מספר נייד ישראלי בשדה הטלפון.',
  invalid_code: 'הקוד הוא 6 ספרות.',
  wrong_code: 'הקוד שגוי.',
  expired: 'הקוד פג או נוצל. אפשר לבקש קוד חדש.',
  rate_limited: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
  undeliverable: 'לא הצלחנו לשלוח קוד. בדקו את המספר ונסו שוב.',
  unauthenticated: 'יש להתחבר לפני אימות הטלפון.',
}

/**
 * The WhatsApp phone check inside the checkout address step (F42).
 *
 * Buttons only, never a nested `<form>`: this sits inside the checkout form,
 * and a form inside a form is invalid HTML that submits the wrong one. The
 * phone is read from the checkout's own phone field through `readPhone` at
 * the moment the shopper asks for a code, so the number proven is the number
 * the courier will call. On success `onVerified` is told which E.164 number
 * passed; the server re-reads the consumed code row and trusts nothing here.
 */
export default function ShippingPhoneVerification({
  readPhone,
  verified,
  onVerified,
  error,
}: {
  readPhone: () => string
  verified: boolean
  onVerified: (phoneE164: string) => void
  /** The step gate's message when the shopper tries to continue unverified. */
  error?: string
}) {
  const [step, setStep] = useState<'idle' | 'code'>('idle')
  const [phone, setPhone] = useState<string | null>(null)
  const [masked, setMasked] = useState<string | null>(null)
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean
      error?: string
      channel?: 'whatsapp' | 'email'
      phone?: string
      masked?: string
    }
  }

  async function send() {
    setPending(true)
    setLocalError(null)
    const r = await post('/api/checkout/phone-otp/send', { phone: readPhone() })
    setPending(false)
    if (!r.ok || !r.phone) return setLocalError(ERRORS[r.error ?? ''] ?? 'השליחה נכשלה.')
    setPhone(r.phone)
    setMasked(r.masked ?? r.phone)
    setChannel(r.channel ?? 'whatsapp')
    setCode('')
    setStep('code')
  }

  async function verify() {
    if (!phone) return
    setPending(true)
    setLocalError(null)
    const r = await post('/api/checkout/phone-otp/verify', { phone, code })
    setPending(false)
    if (!r.ok) return setLocalError(ERRORS[r.error ?? ''] ?? 'האימות נכשל.')
    onVerified(phone)
  }

  if (verified) {
    return (
      <output className="checkout-verify checkout-verify--done" aria-live="polite">
        מספר הטלפון אומת. אפשר להמשיך.
      </output>
    )
  }

  return (
    <div className="checkout-verify" data-testid="shipping-phone-verification">
      <p className="checkout-verify__intro">
        אחרי חמש הזמנות של מוצרים פיזיים אנחנו מאמתים את מספר הטלפון למשלוח בקוד חד-פעמי בוואטסאפ.
      </p>

      {step === 'idle' ? (
        <button
          type="button"
          className="checkout-nav__next checkout-verify__btn"
          onClick={send}
          disabled={pending}
        >
          {pending ? 'שולחים...' : 'שליחת קוד אימות בוואטסאפ'}
        </button>
      ) : (
        <div className="checkout-verify__code">
          <p className="checkout-verify__sent">
            {channel === 'email'
              ? 'וואטסאפ לא זמין כרגע, שלחנו את הקוד למייל של החשבון.'
              : `שלחנו קוד בן 6 ספרות בוואטסאפ למספר ${masked ?? ''}.`}
          </p>
          <div className="checkout-field">
            <label htmlFor="co-phone-code">קוד בן 6 ספרות</label>
            <input
              id="co-phone-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="checkout-nav">
            <button type="button" className="checkout-nav__back" onClick={send} disabled={pending}>
              שליחה חוזרת
            </button>
            <button
              type="button"
              className="checkout-nav__next"
              onClick={verify}
              disabled={pending || code.length !== 6}
            >
              {pending ? 'בודקים...' : 'אימות'}
            </button>
          </div>
        </div>
      )}

      {(localError || error) && (
        <span id="co-err-phone-verified" className="checkout-field__error" role="alert">
          {localError ?? error}
        </span>
      )}
    </div>
  )
}
