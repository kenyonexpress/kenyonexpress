'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Product = {
  id: string
  name_he: string | null
  kenyon_price: number | null
  images: unknown
}

export default function GiftPurchaseForm({ product }: { product: Product }) {
  const router = useRouter()
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [message, setMessage] = useState('')
  const [sendDate, setSendDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Add to cart with gift params, then redirect to checkout
    const params = new URLSearchParams({
      gift_recipient_email: recipientEmail,
      gift_recipient_name: recipientName,
      gift_message: message,
      gift_send_date: sendDate,
    })

    // Navigate to checkout with gift params
    router.push(`/checkout?${params.toString()}`)
  }

  const minDate = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2>{product.name_he}</h2>
        <p>מחיר: ₪{product.kenyon_price}</p>
      </div>

      <div>
        <label htmlFor="gift-email" style={{ display: 'block', marginBottom: '0.5rem' }}>
          אימייל של המקבל *
        </label>
        <input
          id="gift-email"
          type="email"
          required
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
          placeholder="dana@example.com"
        />
      </div>

      <div>
        <label htmlFor="gift-name" style={{ display: 'block', marginBottom: '0.5rem' }}>
          שם המקבל (אופציונלי)
        </label>
        <input
          id="gift-name"
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
          placeholder="דנה"
          maxLength={80}
        />
      </div>

      <div>
        <label htmlFor="gift-message" style={{ display: 'block', marginBottom: '0.5rem' }}>
          ברכה אישית (אופציונלי)
        </label>
        <textarea
          id="gift-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', minHeight: '100px' }}
          placeholder="מזל טוב! תיהנו מהמתנה"
          maxLength={500}
        />
      </div>

      <div>
        <label htmlFor="gift-send-date" style={{ display: 'block', marginBottom: '0.5rem' }}>
          מתי לשלוח? (אופציונלי - ריק = מיידי)
        </label>
        <input
          id="gift-send-date"
          type="date"
          value={sendDate}
          onChange={(e) => setSendDate(e.target.value)}
          min={minDate}
          max={maxDate}
          style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
        />
        <small
          style={{ display: 'block', marginTop: '0.25rem', color: 'var(--color-text-secondary)' }}
        >
          המייל יישלח ב-06:00 UTC (08:00-09:00 שעון ישראל) ביום שתבחרו
        </small>
      </div>

      <button
        type="submit"
        style={{
          padding: '1rem',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          backgroundColor: 'var(--color-primary)',
          border: 'none',
          cursor: 'pointer',
          marginTop: '1rem',
        }}
      >
        המשך לתשלום
      </button>

      <p
        style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}
      >
        אחרי התשלום יישלח למקבל מייל עם קישור אישי לקבלת הקופון. עד שהוא ייאסף הקופון נשאר בחשבון
        שלכם.
      </p>
    </form>
  )
}
