'use client'

import { Check, ShoppingCart } from '@/components/icons'
import { useEffect } from 'react'

/**
 * Body class set while the bar is on screen. `product-page.css` reads it to
 * pad the page bottom so the footer's last row is not buried under the bar,
 * the same contract `MobileCartBar` keeps with `mobile-cart-bar-visible`.
 */
export const PDP_STICKY_CLASS = 'pdp-sticky-visible'

interface Props {
  name: string
  /** Already formatted: the summary column formats money once and hands it down. */
  priceLabel: string
  variantName: string | null
  qty: number
  /** The buy button's own label, so the two never disagree about what a click does. */
  label: string
  disabled: boolean
  added: boolean
  onAdd: () => void
}

/**
 * The buy row that follows the shopper (UX15). Rendered by `ProductInfo` only
 * once the real buy row has scrolled off the top of the viewport, and gone
 * again the moment it is back on screen: a second add-to-cart beside the
 * first is a duplicate control, below the fold it is a reach. One button,
 * the same handler and the same label as the row it stands in for, with the
 * name, the chosen variant and the quantity it will add, so pressing it is
 * never a guess about what is being bought.
 *
 * Pinned to the bottom edge at every width. On a phone it sits above the
 * sticky cart bar when that one is up (the CSS offsets it by the cart bar's
 * height through the body class the cart bar sets), under the consent
 * banner's reservation, and never over the WhatsApp float's corner.
 */
export default function PdpStickyBar({
  name,
  priceLabel,
  variantName,
  qty,
  label,
  disabled,
  added,
  onAdd,
}: Props) {
  useEffect(() => {
    document.body.classList.add(PDP_STICKY_CLASS)
    return () => document.body.classList.remove(PDP_STICKY_CLASS)
  }, [])

  const detail = [variantName, qty > 1 ? `כמות: ${qty}` : null].filter(Boolean).join(' · ')

  return (
    <section className="pdp-sticky" data-pdp-sticky="" aria-label="הוספה מהירה לסל">
      <div className="pdp-sticky__text">
        <p className="pdp-sticky__name">{name}</p>
        <p className="pdp-sticky__meta">
          <span className="pdp-sticky__price">{priceLabel}</span>
          {detail && <span className="pdp-sticky__detail">{detail}</span>}
        </p>
      </div>
      <button
        type="button"
        className="pdp-sticky__atc"
        onClick={onAdd}
        disabled={disabled}
        aria-label={`${label}, ${name}`}
      >
        {added ? (
          <>
            <Check size={18} aria-hidden="true" />
            נוסף לסל
          </>
        ) : (
          <>
            <ShoppingCart size={18} aria-hidden="true" />
            {label}
          </>
        )}
      </button>
    </section>
  )
}
