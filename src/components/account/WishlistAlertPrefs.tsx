'use client'

import {
  type WishlistAlertPrefs,
  getWishlistAlertPrefs,
  saveWishlistAlertPrefs,
} from '@/server/actions/wishlist-alerts'
import { useEffect, useState } from 'react'

/**
 * The three wishlist mail toggles on the notifications page.
 *
 * SAVES ON EVERY FLIP, OPTIMISTICALLY, AND ROLLS BACK ON FAILURE: a
 * preferences card with a separate save button is a card whose state lies
 * between the flip and the click. The digest toggle starts OFF and stays off
 * until the user flips it, which is the opt-in the weekly digest cron keys on.
 *
 * While 233 is unapplied the load answers "not available yet" and the card
 * says so instead of rendering switches that cannot hold, the same contract
 * PushOptIn keeps for 179.
 */

type Status = 'checking' | 'unavailable' | 'signed_out' | 'ready'

const LABELS: Record<keyof WishlistAlertPrefs, { title: string; detail: string }> = {
  priceDrop: {
    title: 'ירידת מחיר',
    detail: 'מייל כשמוצר ששמרת נמכר במחיר נמוך יותר',
  },
  backInStock: {
    title: 'חזרה למלאי',
    detail: 'מייל כשמוצר ששמרת חוזר למלאי',
  },
  weeklyDigest: {
    title: 'סיכום שבועי',
    detail: 'פעם בשבוע: המחירים והמלאי של כל הרשימה, במייל אחד',
  },
}

export default function WishlistAlertPrefsCard() {
  const [status, setStatus] = useState<Status>('checking')
  const [prefs, setPrefs] = useState<WishlistAlertPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getWishlistAlertPrefs()
      .then((state) => {
        if (cancelled) return
        if (state.available) {
          setPrefs(state.prefs)
          setStatus('ready')
        } else {
          setStatus(state.reason === 'signed_out' ? 'signed_out' : 'unavailable')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const flip = async (key: keyof WishlistAlertPrefs) => {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setError(null)
    const result = await saveWishlistAlertPrefs(next)
    if (!result.ok) {
      setPrefs(prefs)
      setError(result.error)
    }
  }

  return (
    <section className="account-card" style={{ marginTop: 16 }}>
      <h2 className="account-card__title">התראות על רשימת המשאלות</h2>
      {status === 'checking' && <p className="account-row__meta">טוען העדפות...</p>}
      {status === 'signed_out' && (
        <p className="account-row__meta">צריך להתחבר כדי לנהל את ההתראות.</p>
      )}
      {status === 'unavailable' && (
        <p className="account-row__meta">העדפות ההתראות עוד לא זמינות. נסו שוב מאוחר יותר.</p>
      )}
      {status === 'ready' && prefs && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(Object.keys(LABELS) as (keyof WishlistAlertPrefs)[]).map((key) => (
            <li
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => flip(key)}
                  style={{ width: 18, height: 18 }}
                />
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{LABELS[key].title}</span>
                  <span className="account-row__meta">{LABELS[key].detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="account-row__meta" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
