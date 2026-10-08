'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { track } from '@/lib/analytics/tracker'
import { referralShareText } from '@/lib/referrals/share'
import { waShareLink } from '@/lib/whatsapp'
import { ensureMyReferralCode } from '@/server/actions/referrals'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * The half of the referrals page that a customer acts on: their code, the link
 * built from it, the three ways to send it, and the button that mints a code
 * when they have none.
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
 *
 * WHATSAPP IS THE FIRST BUTTON, NOT A FALLBACK
 *
 * This is an Israeli shop and the message a referrer actually sends is a
 * WhatsApp message. The share link for that channel carries `utm_source=
 * whatsapp` so a landing from it is tellable apart from a pasted link, and the
 * tap is reported as `whatsapp_click` like every other WhatsApp exit on the
 * site. The native share sheet is offered only where the browser has one
 * (`navigator.share`, decided after mount so the server and the first client
 * render agree), and the copy button is always there.
 */
export default function ReferralShareCard({
  initialCode,
  shareOrigin,
  friendBonusLabel,
  minOrderLabel,
}: {
  initialCode: string | null
  /** Absolute origin the link is built on, resolved on the server. */
  shareOrigin: string
  /** The friend's bonus, formatted by the page from the live terms, or null when zero. */
  friendBonusLabel: string | null
  /** The minimum qualifying order, formatted by the page from the live terms. */
  minOrderLabel: string
}) {
  const [code, setCode] = useState(initialCode)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const share = code
    ? {
        whatsapp: referralShareText({
          code,
          origin: shareOrigin,
          channel: 'whatsapp',
          friendBonusLabel,
          minOrderLabel,
        }),
        native: referralShareText({
          code,
          origin: shareOrigin,
          channel: 'share',
          friendBonusLabel,
          minOrderLabel,
        }),
        copy: referralShareText({
          code,
          origin: shareOrigin,
          channel: 'copy',
          friendBonusLabel,
          minOrderLabel,
        }),
      }
    : null

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

  const openWhatsApp = () => {
    if (!share) return
    // Before the window opens: the exit to a chat is the moment this page
    // loses the shopper, so the event must not wait for a return.
    track('whatsapp_click', { context: 'referral' })
    window.open(waShareLink(share.whatsapp.text), '_blank', 'noopener,noreferrer')
  }

  const nativeShare = async () => {
    if (!share) return
    try {
      await navigator.share({
        title: 'חבר מביא חבר בקניון Express',
        text: share.native.text,
        url: share.native.url,
      })
    } catch {
      // A dismissed sheet is not an error to report.
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
      <p className="referral-share__code" dir="ltr" data-testid="referral-code">
        {code}
      </p>

      <div className="referral-share__actions">
        <button
          type="button"
          className="account-btn account-btn--primary referral-share__whatsapp"
          onClick={openWhatsApp}
          data-testid="referral-share-whatsapp"
        >
          <WhatsAppIcon size={18} />
          שיתוף בוואטסאפ
        </button>
        {canShare && (
          <button
            type="button"
            className="account-btn"
            onClick={nativeShare}
            data-testid="referral-share-native"
          >
            שיתוף...
          </button>
        )}
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
          value={share?.copy.url ?? ''}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="account-btn account-btn--primary"
          onClick={() => share && copy(share.copy.url, 'הקישור')}
        >
          העתקת הקישור
        </button>
      </div>
    </div>
  )
}
