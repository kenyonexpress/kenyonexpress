'use client'

import { ShoppingCart, Trash2 } from '@/components/icons'
import { discountPercent } from '@/lib/discount-percent'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import {
  WISHLIST_CARD_LEAVE_ANIMATION,
  WISHLIST_CARD_LEAVE_FALLBACK_MS,
  savedAgoLabel,
} from '@/lib/wishlist/page-view'
import type { WishlistViewItem } from '@/server/actions/wishlist'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * One saved product in the wishlist grid (UX20): the photo in a square
 * reservation, the name, the price with the old price struck, a stock line
 * when there is something to say, when it was saved, and two actions at the
 * foot: move to the cart, remove.
 *
 * THE CARD LEAVES, IT DOES NOT VANISH. Measured before (logs/ux20/before.json,
 * midRemove): the row was out of the DOM within one frame of either press.
 * Now a remove press marks the card `data-leaving="remove"`, freezes its two
 * buttons, and the parent's write runs on `animationend` of the exit (or on
 * the fallback timer when nothing animates), exactly once. A move asks the
 * cart FIRST, on the parent's path, and only an accepted add starts the exit
 * (`data-leaving="move"`): a refused add leaves the product saved, because a
 * product that is sold out today is exactly what the shopper saved it to be
 * told about. A refused removal puts the card back under the shopper's hands.
 *
 * The per-card busy state is the card's own: the rest of the grid stays
 * live, which is what lets a shopper remove two products in a row without
 * waiting for the first round trip.
 */

// Two across under the tablet breakpoint (48rem), then a 15rem slot: the
// account column's quarter at 1440 is 238, the catalogue's 234 card.
const THUMB_SIZES = '(max-width: 47.9rem) 50vw, 15rem'

export type WishlistCardOutcome = { ok: true } | { ok: false; error?: string }

export default function WishlistCard({
  item,
  disabled = false,
  onMove,
  onRemove,
  now,
}: {
  item: WishlistViewItem
  /** The page is busy with "move all": the card waits. */
  disabled?: boolean
  /** Ask the cart; resolves to whether it accepted. Runs BEFORE the exit. */
  onMove: (item: WishlistViewItem) => Promise<boolean>
  /** The wishlist write, run AFTER the exit; a refusal puts the card back. */
  onRemove: (item: WishlistViewItem, reason: 'remove' | 'move') => Promise<WishlistCardOutcome>
  /** For the "saved N days ago" line; defaults to the browser clock. */
  now?: Date
}) {
  const [leaving, setLeaving] = useState<'remove' | 'move' | null>(null)
  const [pending, setPending] = useState(false)
  const fired = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function finish(reason: 'remove' | 'move') {
    if (fired.current) return
    fired.current = true
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const result = await onRemove(item, reason)
    if (!result.ok) {
      // The row the store rolled back is this one: let the shopper see it.
      fired.current = false
      setLeaving(null)
    }
  }

  function leave(reason: 'remove' | 'move') {
    fired.current = false
    setLeaving(reason)
    timer.current = setTimeout(() => void finish(reason), WISHLIST_CARD_LEAVE_FALLBACK_MS)
  }

  function onAnimationEnd(event: React.AnimationEvent<HTMLElement>) {
    // A child's own animation bubbles up here; only the exit counts.
    if (event.animationName !== WISHLIST_CARD_LEAVE_ANIMATION || leaving === null) return
    void finish(leaving)
  }

  function remove() {
    if (leaving !== null || pending || disabled) return
    leave('remove')
  }

  async function move() {
    if (leaving !== null || pending || disabled || !item.available) return
    setPending(true)
    try {
      const accepted = await onMove(item)
      if (accepted) leave('move')
    } finally {
      setPending(false)
    }
  }

  const price = item.priceIls
  const old = item.fullPriceIls
  const hasDiscount = price != null && old != null && Number(old) > Number(price)
  const pct = hasDiscount ? discountPercent(Number(price), Number(old)) : 0
  const frozen = leaving !== null || pending || disabled
  const saved = savedAgoLabel(item.savedAt, now)

  const media = (
    <span className="wishlist-card__thumb">
      {item.image ? <Image src={item.image} alt="" fill sizes={THUMB_SIZES} /> : null}
      {hasDiscount && pct > 0 ? <span className="wishlist-card__badge">-{pct}%</span> : null}
    </span>
  )
  const title = <span className="wishlist-card__title">{item.name}</span>

  return (
    <article
      className="wishlist-card"
      data-product-id={item.productId}
      data-leaving={leaving ?? undefined}
      aria-busy={frozen ? 'true' : undefined}
      onAnimationEnd={onAnimationEnd}
    >
      {item.slug ? (
        <Link href={`/product/${item.slug}`} className="wishlist-card__link">
          {media}
          {title}
        </Link>
      ) : (
        <span className="wishlist-card__link">
          {media}
          {title}
        </span>
      )}
      {price != null ? (
        <p className="wishlist-card__price">
          <span>{shekelsFromIlsRounded(price)}</span>
          {hasDiscount ? <del>{shekelsFromIlsRounded(old)}</del> : null}
        </p>
      ) : null}
      {item.soldOut ? (
        <p className="wishlist-card__state" data-state="sold-out">
          אזל מהמלאי
        </p>
      ) : !item.available ? (
        <p className="wishlist-card__state" data-state="gone">
          המוצר כבר לא זמין
        </p>
      ) : null}
      {saved ? <p className="wishlist-card__saved">{saved}</p> : null}
      <div className="wishlist-card__actions">
        <button
          type="button"
          className="wishlist-card__move"
          onClick={() => void move()}
          disabled={!item.available || frozen}
          aria-label={item.available ? `העברת ${item.name} לסל` : undefined}
        >
          <ShoppingCart size={16} aria-hidden="true" />
          {leaving === 'move'
            ? 'עבר לסל'
            : pending
              ? 'מעביר...'
              : item.available
                ? 'העברה לסל'
                : item.soldOut
                  ? 'אזל מהמלאי'
                  : 'לא זמין'}
        </button>
        <button
          type="button"
          className="wishlist-card__remove"
          onClick={remove}
          disabled={frozen}
          aria-label={`הסרת ${item.name} מהרשימה`}
          title="הסרה מהרשימה"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
