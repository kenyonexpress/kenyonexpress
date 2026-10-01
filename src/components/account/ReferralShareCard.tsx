'use client'

import FacebookShareButton from '@/components/shared/FacebookShareButton'
import TelegramShareButton from '@/components/shared/TelegramShareButton'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import { t } from '@/lib/i18n/messages'
import { buildReferralShareMessage } from '@/lib/share/message'
import { ensureMyReferralCode } from '@/server/actions/referrals'
import { Share2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

/**
 * The half of the referrals page that a customer acts on: their code, the link
 * built from it, the button that mints one when they have none, and the
 * public channel buttons that send it.
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
 * THE DEFAULT LINK IS `/?ref=<code>`, NOT A SHORT LINK, BECAUSE THIS CARD IS
 * SHARED BY TWO PROGRAMMES. `/account/affiliate` renders this same component
 * over the same code (`profiles.referral_code`, see share-url.ts's "ONE
 * PARAMETER" note), and a short link baked with one programme's campaign tag
 * would mislabel the other's shares. `buildShareUrl` lets a caller that DOES
 * know which programme it is substitute its own path; the referrals page uses
 * it for the public `/r/<code>` short link, the affiliate page leaves it unset.
 */
export default function ReferralShareCard({
  initialCode,
  shareOrigin,
  shareParam,
  buildShareUrl,
  shareSource = 'referral',
}: {
  initialCode: string | null
  /** Absolute origin the link is built on, resolved on the server. */
  shareOrigin: string
  shareParam: string
  /** Overrides the default `/?<shareParam>=<code>` path for this caller. */
  buildShareUrl?: (code: string) => string
  /** Tags the whatsapp_click event with which programme's card this is. */
  shareSource?: string
}) {
  const [code, setCode] = useState(initialCode)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showFallback, setShowFallback] = useState(false)

  const shareUrl = code
    ? (buildShareUrl ?? ((c: string) => `${shareOrigin}/?${shareParam}=${c}`))(code)
    : null
  const shareMessage = buildReferralShareMessage()

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

  /** Same platform-sheet-first shape as the product page's ProductShareRow. */
  const handleNativeShare = async () => {
    if (!shareUrl) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareMessage, text: shareMessage, url: shareUrl })
      } catch {
        // AbortError on cancel, or a share target that failed on its own end.
      }
      return
    }
    setShowFallback((v) => !v)
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

      <div className="referral-share__channels flex flex-wrap items-center gap-4">
        <WhatsAppShareButton
          message={shareMessage}
          url={() => shareUrl ?? ''}
          source={shareSource}
        />
        <button
          type="button"
          onClick={() => void handleNativeShare()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:opacity-80"
        >
          <Share2 size={18} />
          {t('share.shareLabel')}
        </button>
      </div>

      {/* Desktop fallback: shown only once a click already proved
          navigator.share is unavailable, never guessed from user-agent. */}
      {showFallback && (
        <div className="flex flex-wrap items-center gap-4 ps-1">
          <FacebookShareButton url={() => shareUrl ?? ''} />
          <TelegramShareButton text={shareMessage} url={() => shareUrl ?? ''} />
        </div>
      )}
    </div>
  )
}
