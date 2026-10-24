'use client'

import { CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import {
  type GranularConsent,
  getAcceptAllConsent,
  getDefaultConsent,
  getRejectAllConsent,
  parseGranularConsent,
  serializeGranularConsent,
} from '@/lib/analytics/consent-categories'
import { saveGranularConsent } from '@/server/actions/consent'
import { useEffect, useState } from 'react'

interface ConsentSettingsProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Granular cookie consent settings modal for C63.
 *
 * Three categories:
 * - Essential: Always on (auth, cart, security)
 * - Analytics: GA4, PostHog
 * - Marketing: Meta Pixel, ads
 */
export default function ConsentSettings({ isOpen, onClose }: ConsentSettingsProps) {
  const [consent, setConsent] = useState<GranularConsent>(
    getDefaultConsent(CONSENT_WORDING_VERSION),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load current consent from cookie when modal opens
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const cookieMatch = document.cookie.match(/(?:^|; )ke_consent_prefs=([^;]*)/)
    const cookieValue = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : null
    const parsed = parseGranularConsent(cookieValue)

    if (parsed && parsed.wordingVersion >= CONSENT_WORDING_VERSION) {
      setConsent(parsed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      const value = serializeGranularConsent(consent)
      await saveGranularConsent(value)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAcceptAll = async () => {
    setIsSubmitting(true)
    try {
      const all = getAcceptAllConsent(CONSENT_WORDING_VERSION)
      const value = serializeGranularConsent(all)
      await saveGranularConsent(value)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRejectAll = async () => {
    setIsSubmitting(true)
    try {
      const none = getRejectAllConsent(CONSENT_WORDING_VERSION)
      const value = serializeGranularConsent(none)
      await saveGranularConsent(value)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <dialog
      open={isOpen}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop:bg-black/50"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      aria-labelledby="consent-settings-title"
    >
      <div
        className="mx-4 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="consent-settings-title" className="mb-4 text-2xl font-bold text-heading">
          הגדרות עוגיות ופרטיות
        </h2>

        <p className="mb-6 text-sm text-muted">
          אנחנו משתמשים בעוגיות לשיפור החווייה באתר. אתם יכולים לבחור באילו קטגוריות להשתמש.
        </p>

        <div className="space-y-4">
          {/* Essential - always on */}
          <div className="rounded-lg border border-overlay-hairline p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-heading">עוגיות הכרחיות</h3>
                <p className="text-sm text-muted">
                  נדרשות לתפקוד בסיסי של האתר: התחברות, עגלת קניות, אבטחה
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">תמיד פעיל</span>
                <div className="h-6 w-11 rounded-full bg-brand-primary" />
              </div>
            </div>
          </div>

          {/* Analytics */}
          <div className="rounded-lg border border-overlay-hairline p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-heading">ניתוח שימוש</h3>
                <p className="text-sm text-muted">
                  Google Analytics, PostHog - עוזרים לנו להבין איך משתמשים באתר ולשפר אותו
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConsent({ ...consent, analytics: !consent.analytics })}
                className={`h-6 w-11 rounded-full transition-colors ${
                  consent.analytics ? 'bg-brand-primary' : 'bg-overlay-hairline'
                }`}
                aria-label={consent.analytics ? 'כבה ניתוח שימוש' : 'הפעל ניתוח שימוש'}
                disabled={isSubmitting}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    consent.analytics ? 'translate-x-[-1.25rem]' : 'translate-x-[-0.125rem]'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Marketing */}
          <div className="rounded-lg border border-overlay-hairline p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-heading">שיווק ופרסום</h3>
                <p className="text-sm text-muted">
                  Meta Pixel, פלטפורמות פרסום - למדידת קמפיינים והצגת פרסום רלוונטי
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConsent({ ...consent, marketing: !consent.marketing })}
                className={`h-6 w-11 rounded-full transition-colors ${
                  consent.marketing ? 'bg-brand-primary' : 'bg-overlay-hairline'
                }`}
                aria-label={consent.marketing ? 'כבה שיווק ופרסום' : 'הפעל שיווק ופרסום'}
                disabled={isSubmitting}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    consent.marketing ? 'translate-x-[-1.25rem]' : 'translate-x-[-0.125rem]'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAcceptAll}
              disabled={isSubmitting}
              className="min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              אישור הכל
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              disabled={isSubmitting}
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-50"
            >
              דחיית הכל
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="min-h-11 rounded-lg bg-black/90 px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              שמירת העדפות
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-11 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.04] disabled:opacity-50"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
