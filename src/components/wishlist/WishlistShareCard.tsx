'use client'

import { sharedWishlistPath } from '@/lib/wishlist/share-token'
import {
  type WishlistShareCommand,
  type WishlistShareState,
  setWishlistShare,
} from '@/server/actions/wishlist'
import { Check, Link2, RefreshCw, Share2 } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'

/**
 * The share card on `/wishlist`: one link, on or off, copy it, send it.
 *
 * THE URL IS BUILT IN THE BROWSER from `window.location.origin`, the same way
 * `ShareButton` reads the page URL at click time: the shopper shares the site
 * they are on, and a preview deployment never hands out a production link or
 * the other way round.
 *
 * WHATSAPP GETS ITS OWN BUTTON because that is where Israeli shoppers forward
 * things; the phone's share sheet covers the rest and the clipboard covers a
 * desktop without one, exactly the split the product page makes.
 *
 * "Rotate" is deliberately a second click away from "share": it kills a link
 * the shopper may have posted, and the copy says so.
 */
export default function WishlistShareCard({
  initial,
  itemCount,
}: {
  initial: WishlistShareState
  itemCount: number
}) {
  const [share, setShare] = useState<WishlistShareState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [origin, setOrigin] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    setOrigin(window.location.origin)
  }, [])

  if (!share.available) return null

  const url = share.token && share.enabled ? `${origin}${sharedWishlistPath(share.token)}` : null
  const shareText = 'הנה המוצרים ששמרתי בקניון Express:'

  function run(command: WishlistShareCommand) {
    setError(null)
    startTransition(async () => {
      const result = await setWishlistShare(command)
      if (result.ok) setShare(result.share)
      else setError(result.error)
    })
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard denied: the link is on screen in the read-only field.
    }
  }

  async function nativeShare() {
    if (!url) return
    try {
      await navigator.share({ title: 'רשימת המשאלות שלי', text: shareText, url })
    } catch {
      // Dismissed sheet: nothing to report.
    }
  }

  const whatsappHref = url
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`
    : null

  return (
    <section className="account-card" aria-labelledby="wishlist-share-title">
      <h2 id="wishlist-share-title" className="account-card__title">
        שיתוף הרשימה
      </h2>
      {url ? (
        <>
          <p className="account-row__meta">
            כל מי שמקבל את הקישור רואה את המוצרים ששמרת ({itemCount}), בלי השם שלך ובלי פרטים
            נוספים.
          </p>
          <label className="mt-3 block">
            <span className="sr-only">קישור לשיתוף</span>
            <input
              readOnly
              dir="ltr"
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-border-alt bg-surface-hover px-3 py-2 text-sm text-heading"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void copy()}
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-md border border-border-alt bg-white px-3 py-2 text-sm font-semibold text-heading hover:border-price"
            >
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Link2 size={16} aria-hidden="true" />
              )}
              {copied ? 'הקישור הועתק' : 'העתקת קישור'}
            </button>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border-alt bg-white px-3 py-2 text-sm font-semibold text-heading hover:border-price"
              >
                שיתוף בוואטסאפ
              </a>
            ) : null}
            {canShare ? (
              <button
                type="button"
                onClick={() => void nativeShare()}
                className="inline-flex items-center gap-2 rounded-md border border-border-alt bg-white px-3 py-2 text-sm font-semibold text-heading hover:border-price"
              >
                <Share2 size={16} aria-hidden="true" />
                שיתוף
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => run('rotate')}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 font-semibold text-heading underline-offset-2 hover:underline disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden="true" />
              קישור חדש (הישן יפסיק לעבוד)
            </button>
            <button
              type="button"
              onClick={() => run('disable')}
              disabled={isPending}
              className="font-semibold text-price underline-offset-2 hover:underline disabled:opacity-50"
            >
              ביטול השיתוף
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="account-row__meta">
            קישור אחד שאפשר לשלוח לחברים או למשפחה. מי שפותח אותו רואה את המוצרים ששמרת ויכול להוסיף
            אותם לסל שלו.
          </p>
          <button
            type="button"
            onClick={() => run('enable')}
            disabled={isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark hover:opacity-90 disabled:opacity-50"
          >
            <Share2 size={16} aria-hidden="true" />
            {share.token ? 'הפעלת הקישור מחדש' : 'יצירת קישור לשיתוף'}
          </button>
        </>
      )}
      {error ? (
        <p className="account-row__meta mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
