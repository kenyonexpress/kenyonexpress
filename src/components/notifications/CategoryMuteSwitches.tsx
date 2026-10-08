'use client'

import {
  CATEGORIES,
  CATEGORY_HINT_HE,
  CATEGORY_LABEL_HE,
  type Category,
} from '@/lib/notifications/categories'
import { setCategoryMute } from '@/server/actions/notifications'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * Four switches, one per shelf, governing the in-app bell only.
 *
 * ON MEANS SHOWN. The control is "show notifications from this shelf", not
 * "mute", because a switch that is on when something is off is the control
 * people get backwards; the stored row is `enabled`, same polarity.
 *
 * SAVED ONE SWITCH AT A TIME, OPTIMISTIC, ROLLED BACK ON ITS OWN FAILURE:
 * the rule PreferenceSwitches follows, for the reason written there.
 * `router.refresh()` after a save so the list and the tab counters above
 * re-read under the new mute without a reload.
 *
 * WHAT THIS DOES NOT TOUCH is said on the card, because it is the question
 * a customer muting "orders" would otherwise ask support: email, push and
 * WhatsApp keep their own switches, and the receipt, the coupon and the
 * refund notice are never switched off anywhere.
 */

export default function CategoryMuteSwitches({ muted }: { muted: Category[] }) {
  const router = useRouter()
  const [shown, setShown] = useState<Record<Category, boolean>>(
    () =>
      Object.fromEntries(CATEGORIES.map((c) => [c, !muted.includes(c)])) as Record<
        Category,
        boolean
      >,
  )
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  const set = (category: Category, value: boolean) =>
    setShown((current) => ({ ...current, [category]: value }))

  return (
    <div>
      <p className="text-sm text-muted">
        השתקה מסתירה קטגוריה מהפעמון ומהרשימה שכאן, בלי למחוק דבר, ואינה משנה מייל, התראות דחיפה או
        וואטסאפ.
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <ul className="mute-list">
        {CATEGORIES.map((category) => (
          <li key={category} className="mute-list__item">
            <label className="mute-list__label">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={shown[category]}
                onChange={(event) => {
                  const next = event.target.checked
                  set(category, next)
                  setError(null)
                  start(async () => {
                    const result = await setCategoryMute(category, !next)
                    if (!result.ok) {
                      set(category, !next)
                      setError(result.error ?? 'השמירה נכשלה.')
                      return
                    }
                    router.refresh()
                  })
                }}
              />
              <span className="mute-list__text">
                <span className="mute-list__name">
                  {CATEGORY_LABEL_HE[category]}
                  {!shown[category] && (
                    <span className="account-chip account-chip--warn">מושתק</span>
                  )}
                </span>
                <span className="mute-list__hint">{CATEGORY_HINT_HE[category]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
