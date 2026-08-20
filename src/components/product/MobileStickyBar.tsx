'use client'

import { useCart } from '@/components/cart/CartProvider'
import PriceDisplay from '@/components/product/PriceDisplay'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

/**
 * The buy bar that follows a phone down the product page.
 *
 * WHEN IT APPEARS, AND WHY NOT ALWAYS. It stays hidden while the real buy
 * controls are on screen, and slides in once they scroll away. Two identical
 * buy buttons visible at the same moment is not a convenience, it is a
 * question about which one is the real one -- and pinning a bar over the fold
 * on first paint covers the price it is advertising.
 *
 * The trigger is an IntersectionObserver on `.pdp-buy`, the row
 * `storefront/ProductInfo.tsx` renders. That component owns the variant
 * selection and the quantity, and this one deliberately does not reach into
 * it: when the product has variants there is nothing here to add to a cart,
 * so the button scrolls back up to the selector instead of guessing. Guessing
 * would put a different SKU in the basket than the one on screen.
 *
 * If `.pdp-buy` is not on the page at all -- a layout change, a coupon that
 * cannot be sold -- the bar falls back to a scroll threshold rather than
 * never appearing.
 */

/** Past this many pixels the bar shows when there is no buy row to observe. */
const FALLBACK_SCROLL_PX = 400

export default function MobileStickyBar({
  productId,
  productName,
  priceIls,
  fullPriceIls,
  hasVariants,
  outOfStock,
  sellable = true,
  isCoupon,
}: {
  productId: string
  productName: string
  /** What the shopper pays here: the coupon price for a coupon, else the price. */
  priceIls: number
  /** Full value, struck through. Null when there is no higher price to show. */
  fullPriceIls: number | null
  /** True when a variant must be chosen before anything can be added. */
  hasVariants: boolean
  outOfStock: boolean
  /** False for a coupon with no admin-set price: describable, not purchasable. */
  sellable?: boolean
  isCoupon: boolean
}) {
  const { addToCart, isPending } = useCart()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const buyRow = document.querySelector('.pdp-buy')

    if (buyRow) {
      const observer = new IntersectionObserver(
        ([entry]) => setVisible(entry ? !entry.isIntersecting : false),
        // A sliver of the row counts as visible, so the bar does not flicker
        // in and out while the row is half off the bottom of the screen.
        { threshold: 0 },
      )
      observer.observe(buyRow)
      return () => observer.disconnect()
    }

    const onScroll = () => setVisible(window.scrollY > FALLBACK_SCROLL_PX)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const blocked = outOfStock || !sellable || isPending

  const handleClick = useCallback(async () => {
    if (blocked) return

    if (hasVariants) {
      document.querySelector('[data-pdp="summary"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      return
    }

    // Same path as the page's own "קנה עכשיו": add, then straight to
    // checkout. The checkout subtree is auth-gated in proxy.ts, so a guest
    // lands on sign-in with the item already saved.
    await addToCart(productId, null, 1, productName)
    router.push('/checkout')
  }, [blocked, hasVariants, addToCart, productId, productName, router])

  const label = outOfStock
    ? isCoupon
      ? 'הדיל נסגר'
      : 'אזל מהמלאי'
    : !sellable
      ? 'לא זמין לרכישה'
      : hasVariants
        ? 'בחירת גרסה'
        : 'קנה עכשיו'

  return (
    <>
      {/* The page's own tail, so the bar never covers the last row of content.
          Reserved only while the bar is up, and only on the widths that get
          one. */}
      {visible && <div className="h-20 md:hidden" aria-hidden="true" />}

      <section
        aria-label="רכישה מהירה"
        aria-hidden={!visible}
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.08)] transition-transform duration-200 md:hidden ${
          visible ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <PriceDisplay
            fullPriceIls={fullPriceIls}
            priceIls={priceIls}
            size="md"
            showSavings={false}
          />

          <button
            type="button"
            onClick={() => void handleClick()}
            disabled={blocked}
            // 44px is the minimum touch target the a11y audit holds every
            // control on this site to; `h-11` is exactly that, and the
            // horizontal padding keeps the Hebrew label off the edges.
            className="inline-flex h-11 min-w-[8rem] shrink-0 items-center justify-center rounded-lg bg-brand-primary px-5 text-base font-bold text-brand-dark transition-colors disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted"
            // Not focusable while the bar is off screen: a keyboard user
            // tabbing the page must not land on a control nobody can see.
            tabIndex={visible ? 0 : -1}
          >
            {label}
          </button>
        </div>
      </section>
    </>
  )
}
