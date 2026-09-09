'use client'

import { useWishlist } from '@/components/wishlist/WishlistProvider'
import { Heart } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties } from 'react'

/**
 * The masthead heart, with the counter live's YITH header shows beside it.
 *
 * Both call sites (`MastheadNav` at xl and up, `Header` below it) pass their
 * own measured icon geometry rather than sharing a constant, because they are
 * two different measurements off the live site and collapsing them would make
 * one of them wrong.
 *
 * THE BADGE IS ABSENT AT ZERO, not rendered empty, and that is the only state a
 * first-time visitor ever sees. It is also `aria-hidden`: the count is already
 * in the link's accessible name, and a screen reader reading "מועדפים 3 3" is
 * how a decorative duplicate sounds. Same shape as `CartNavLink`.
 */
export default function WishlistNavLink({
  size,
  strokeWidth,
  className = '',
  style,
}: {
  size: number
  strokeWidth: number
  className?: string
  style?: CSSProperties
}) {
  const wishlist = useWishlist()
  const count = wishlist?.count ?? 0

  return (
    <Link
      href="/account/wishlist"
      aria-label={count > 0 ? `מועדפים, ${count} מוצרים` : 'מועדפים'}
      className={className}
      style={style}
    >
      <span className="relative">
        <Heart size={size} strokeWidth={strokeWidth} aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-nano font-bold text-brand-dark"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
    </Link>
  )
}
