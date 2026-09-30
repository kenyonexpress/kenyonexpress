'use client'

import {
  loginHrefForWishlist,
  useIsWishlisted,
  useWishlistStore,
} from '@/lib/wishlist/client-store'
import { Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

/**
 * The heart on a product, everywhere a product appears.
 *
 * Client-only state on purpose: the product page and every grid are cached for
 * every visitor, so the saved/unsaved answer, which is per session, is read
 * after paint and never renders on the server. The answer comes from the one
 * shared store (`lib/wishlist/client-store.ts`), loaded once per page, so a
 * grid of forty hearts is one server read and not forty.
 *
 * THREE VARIANTS, ONE BEHAVIOUR.
 *   `icon`     the 44px round heart for a standalone control.
 *   `inline`   heart plus a word, sized to sit in the product page's tag line
 *              without changing its measured height.
 *   `overlay`  the small round heart in a card's image corner. Hidden until
 *              the card is hovered or the heart is focused on a device that
 *              can hover (Electro's own card behaviour, and it keeps the
 *              pixel gate's un-hovered screenshots unchanged); always shown
 *              where there is no hover, and always shown once saved.
 *
 * SIGNED OUT: one click sends the shopper to sign in with a return path to
 * the page they were on, instead of a message they cannot act on.
 */
const UUID = /^[0-9a-f-]{36}$/i

export default function WishlistButton({
  productId,
  variant = 'icon',
  className,
}: {
  productId: string
  variant?: 'icon' | 'inline' | 'overlay'
  className?: string
}) {
  const saved = useIsWishlisted(productId)
  const load = useWishlistStore((s) => s.load)
  const toggle = useWishlistStore((s) => s.toggle)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    void load()
  }, [load])

  function onToggle(event: React.MouseEvent) {
    // On a card the heart sits over a link to the product; the click is ours.
    event.preventDefault()
    event.stopPropagation()
    setMessage(null)
    startTransition(async () => {
      const result = await toggle(productId)
      if (result.ok) return
      if (result.signedOut) {
        const here = `${window.location.pathname}${window.location.search}`
        router.push(loginHrefForWishlist(here))
        return
      }
      setMessage(result.error)
    })
  }

  const label = saved ? 'הסר מרשימת המשאלות' : 'הוסף לרשימת המשאלות'

  // The home deals rail carries synthetic ids (`ke-deal-9132`) that no row
  // answers to; the toggle would refuse them as "מוצר לא תקין". No heart is
  // better than a heart that can only apologise.
  if (!UUID.test(productId)) return null

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        data-saved={saved ? 'true' : 'false'}
        className={
          className ??
          'absolute start-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white/95 text-icon opacity-0 shadow-sm transition-opacity hover:border-price focus-visible:opacity-100 disabled:opacity-50 group-hover:opacity-100 data-[saved=true]:text-price data-[saved=true]:opacity-100 [@media(hover:none)]:opacity-100'
        }
      >
        <Heart
          size={18}
          strokeWidth={2}
          aria-hidden="true"
          fill={saved ? 'currentColor' : 'none'}
        />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        aria-pressed={saved}
        aria-label={label}
        className={
          className ??
          (variant === 'inline'
            ? 'inline-flex items-center gap-1.5 text-sm font-semibold text-heading transition-colors hover:text-price disabled:opacity-50'
            : 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-xl transition-colors hover:border-price disabled:opacity-50')
        }
      >
        <span aria-hidden="true" className={saved ? 'text-price' : 'text-gray-400'}>
          {saved ? '♥' : '♡'}
        </span>
        {variant === 'inline' && <span aria-hidden="true">{saved ? 'נשמר' : 'שמירה'}</span>}
      </button>
      {message ? (
        <output aria-live="polite" className="text-xs text-price">
          {message}
        </output>
      ) : null}
    </span>
  )
}
