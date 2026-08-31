'use client'

import { ensureMyReferralCode } from '@/server/actions/referrals'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * The half of the referrals page that a customer acts on: their code, the link
 * built from it, and the button that mints one when they have none.
 *
 * MINTING IS A BUTTON AND NOT A PAGE LOAD
 *
 * `fn_ensure_referral_code` writes to `profiles`, and a page render is a GET.
 * Minting on render would leave a permanent code behind for every shopper who
 * opened this screen once and closed it, and would let anything that crawls the
 * account area write a row per visit. So the read and the write are separated,
 * and this is the write.
 *
 * THE LINK IS SHOWN AS TEXT, NOT ONLY AS A COPY BUTTON
 *
 * `navigator.clipboard` needs a secure context and a permission that a browser
 * can refuse without saying so. A copy button that silently does nothing is
 * worse than no copy button, so the URL sits in a readonly field that can
 * always be selected by hand, and the button is the shortcut rather than the
 * only route.
 */
export default function ReferralShareCard({
  initialCode,
  shareOrigin,
  shareParam,
}: {
  initialCode: string | null
  /** Absolute origin the link is built on, resolved on the server. */
  shareOrigin: string
  shareParam: string
}) {
  const [code, setCode] = useState(initialCode)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const shareUrl = code ? `${shareOrigin}/?${shareParam}=${code}` : null

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${what} הועתק`)
    } catch {
      // Not a silent failure and not a thrown one. The text is on screen and
      // selectable, so the honest message is the one that says so.
      toast.error('ההעתקה נחסמה בדפדפן. אפשר לסמן את הטקסט ולהעתיק ידנית.')
    }
  }

  if (!code) {
    return (
      <div className="referral-share">
        <p className="referral-share__empty">
          עדיין אין לך קוד הפניה. ניצור לך קוד אישי וקבוע, ואפשר יהיה לשתף אותו מיד.
        </p>
        {error && <p className="referral-share__error">{error}</p>}
        <button
          type="button"
          className="account-btn account-btn--primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const result = await ensureMyReferralCode()
              if (result.ok && result.code) setCode(result.code)
              else setError(result.error ?? 'יצירת הקוד נכשלה')
            })
          }
        >
          {pending ? 'יוצר קוד...' : 'צרו לי קוד הפניה'}
        </button>
      </div>
    )
  }

  return (
    <div className="referral-share">
      <p className="referral-share__label">הקוד שלך</p>
      {/* dir="ltr" on the code itself: it is eight Latin characters and digits,
          and inside an RTL paragraph a browser would otherwise reorder a code
          that ends in a digit. The container stays RTL. */}
      <p className="referral-share__code" dir="ltr">
        {code}
      </p>

      <div className="referral-share__actions">
        <button type="button" className="account-btn" onClick={() => code && copy(code, 'הקוד')}>
          העתקת הקוד
        </button>
      </div>

      <label className="referral-share__link-label" htmlFor="referral-link">
        הקישור לשיתוף
      </label>
      <div className="referral-share__link-row">
        <input
          id="referral-link"
          className="referral-share__link"
          dir="ltr"
          readOnly
          value={shareUrl ?? ''}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="account-btn account-btn--primary"
          onClick={() => shareUrl && copy(shareUrl, 'הקישור')}
        >
          העתקת הקישור
        </button>
      </div>
    </div>
  )
}
