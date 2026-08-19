'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import { useCart, useCartAuth } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import type { CartViewItem } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { ShoppingCart, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * The Electro mini-cart: a panel that hangs off the masthead's cart icon.
 *
 * It shares `drawerOpen` with `CartDrawer` rather than holding a second flag.
 * The two are one feature at two widths — a dropdown where there is room beside
 * the icon, a full-height sheet where there is not — and CSS decides which is
 * visible. A separate piece of state would mean `addToCart`'s auto-open had to
 * know which viewport it was running in, which is exactly the sort of thing
 * that works until someone resizes the window.
 */
function MiniCartLine({ item, onNavigate }: { item: CartViewItem; onNavigate: () => void }) {
  const { removeItem, isPending } = useCart()

  return (
    <li className="mini-cart__item">
      <Link href={`/product/${item.slug}`} className="mini-cart__thumb" onClick={onNavigate}>
        {item.image_url ? (
          <SmartImage
            src={item.image_url}
            alt={item.name_he}
            width={64}
            height={64}
            className="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
          />
        ) : (
          <span className="mini-cart__thumb-empty" aria-hidden="true">
            —
          </span>
        )}
      </Link>

      <div className="mini-cart__item-body">
        <Link href={`/product/${item.slug}`} className="mini-cart__item-name" onClick={onNavigate}>
          {item.name_he}
        </Link>
        <span className="mini-cart__item-meta tabular-nums">
          {item.quantity} × {shekels(item.unit_price)}
        </span>
        {item.type === 'coupon' && item.balance_due_at_business > 0 && (
          <span className="mini-cart__item-note">
            יתרה בחנות: {shekels(item.balance_due_at_business)}
          </span>
        )}
      </div>

      <div className="mini-cart__item-end">
        <span className="mini-cart__item-price tabular-nums">
          {shekels(item.customer_pays_now)}
        </span>
        <button
          type="button"
          className="mini-cart__item-remove"
          onClick={() => void removeItem(item.product_id, item.variant_id)}
          disabled={isPending}
          aria-label={`הסר ${item.name_he} מהעגלה`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

export default function MiniCartDropdown() {
  const { cart, drawerOpen, closeDrawer, isPending } = useCart()
  const isAuthenticated = useCartAuth()
  const panelRef = useRef<HTMLDialogElement | null>(null)
  const pathname = usePathname()

  // Close on route CHANGE, and the distinction is the fix.
  //
  // Without this the panel survives a click on one of its own product links and
  // hangs over the page it just navigated to. But an effect keyed on `pathname`
  // also runs on MOUNT, and `usePathname` settles after hydration, so this used
  // to fire once on a page the shopper had not navigated anywhere from. That
  // was harmless only because it was always over long before anyone could
  // click: on a request-time product page the first paint cost a Supabase round
  // trip. [46] took that page to a prerendered 2ms, and the same effect started
  // landing AFTER add-to-cart had set `drawerOpen`, so adding an item settled
  // the real cart, updated the badge to its real total, and then silently shut
  // the panel that is the shopper's only confirmation. Reproduced 5/5, and the
  // panel still opened from the header control, which is what named the culprit
  // as this effect and not the mutation.
  //
  // The ref makes it close on a real navigation only. Do not "simplify" it back.
  const lastPathname = useRef(pathname)
  useEffect(() => {
    if (lastPathname.current === pathname) return
    lastPathname.current = pathname
    closeDrawer()
  }, [pathname, closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    // Pointerdown rather than click: a click listener fires after the button's
    // own handler has already toggled the panel back open, so pressing the cart
    // icon while the panel was open closed and reopened it in one gesture.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      // THIS PANEL IS `display: none` BELOW 768px, AND A HIDDEN PANEL MUST NOT
      // DISMISS THE ONE THE SHOPPER CAN SEE.
      //
      // Below that width the visible surface is `CartDrawer`'s full-height
      // sheet, and this component still mounts - CSS hides the markup, it does
      // not detach the listener. Every point inside that sheet is outside THIS
      // panel, so the sheet dismissed itself on contact: pressing "הוסף כמות",
      // "המשך לתשלום", or even its own title closed it. Measured on a 390px
      // viewport - one tap on `.cart-drawer__title` and the sheet was gone,
      // which makes the quantity controls unreachable on a phone.
      //
      // The check reads the CSS rather than repeating the breakpoint: whatever
      // width `.mini-cart__panel` is hidden at, it stops acting there. A
      // `matchMedia('(min-width: 768px)')` here would be a second copy of a
      // number that already lives in mini-cart.css, which is how this class of
      // bug is written in the first place.
      if (!panelRef.current || getComputedStyle(panelRef.current).display === 'none') return
      if (panelRef.current.contains(target)) return
      // The trigger lives outside the panel and owns its own toggle.
      if ((target as Element).closest?.('[data-mini-cart-trigger]')) return
      closeDrawer()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  const isEmpty = cart.items.length === 0

  return (
    // A real <dialog open>, not a div with role="dialog". Open-but-not-modal is
    // exactly what a dropdown is: it keeps the semantics without the top-layer
    // promotion and focus trap that showModal() would bring, and the panel has
    // to stay anchored under the icon rather than centred over the page.
    <dialog
      ref={panelRef}
      open
      className={`mini-cart__panel ${isPending ? 'mini-cart__panel--pending' : ''}`}
      aria-label="עגלת קניות"
    >
      {isEmpty ? (
        <div className="mini-cart__empty">
          <ShoppingCart size={32} aria-hidden="true" />
          <p>אין מוצרים בסל הקניות</p>
          <Link href="/products" className="mini-cart__empty-cta" onClick={closeDrawer}>
            המשך לקניות
          </Link>
        </div>
      ) : (
        <>
          <ul className="mini-cart__list">
            {cart.items.map((item) => (
              <MiniCartLine
                key={`${item.product_id}::${item.variant_id ?? 'null'}`}
                item={item}
                onNavigate={closeDrawer}
              />
            ))}
          </ul>

          <div className="mini-cart__footer">
            <div className="mini-cart__subtotal">
              <span>סה"כ לתשלום באתר</span>
              <strong className="tabular-nums">{shekels(cart.subtotal)}</strong>
            </div>
            {cart.balance_due_at_business > 0 && (
              <div className="mini-cart__balance">
                <span>יתרה לתשלום בחנות</span>
                <span className="tabular-nums">{shekels(cart.balance_due_at_business)}</span>
              </div>
            )}
            <div className="mini-cart__actions">
              <Link href="/cart" className="mini-cart__view" onClick={closeDrawer}>
                צפייה בעגלה
              </Link>
              {/* Same two-part gate as the sheet and the cart page. This panel
                  is the desktop half of the same cart, and an unavailable line
                  has to stop the checkout on every surface that offers one or
                  the refusal just moves to the pay button. */}
              <CartCheckoutButton
                isAuthenticated={isAuthenticated}
                disabled={cart.items.some((item) => !item.available)}
                className="mini-cart__checkout"
                onNavigate={closeDrawer}
              />
            </div>
          </div>
        </>
      )}
    </dialog>
  )
}
