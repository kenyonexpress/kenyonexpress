'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import { useCart, useCartAuth } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import { lineQuantityCeiling, unavailableMessage } from '@/lib/cart/format'
import type { CartViewItem } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

function DrawerLineItem({ item }: { item: CartViewItem }) {
  const { updateQuantity, removeItem, isPending } = useCart()

  // The drawer is the first cart a shopper sees -- it opens on add-to-cart --
  // and it used to be the least honest one: a bare `99` ceiling whatever the
  // shelf held, and no sign at all that a line had gone unavailable. Someone
  // could add an item, watch the drawer show it priced and fine, and only meet
  // the problem at /cart.
  const maxQty = lineQuantityCeiling(item)
  const warning = unavailableMessage(item)

  return (
    <li className="cart-drawer__item">
      <Link href={`/product/${item.slug}`} className="cart-drawer__thumb">
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
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs text-slate-400">
            —
          </div>
        )}
      </Link>

      <div className="cart-drawer__item-body">
        <Link href={`/product/${item.slug}`} className="cart-drawer__item-name">
          {item.name_he}
        </Link>
        {warning && <output className="cart-drawer__item-warning">{warning}</output>}
        <div className="cart-drawer__item-row">
          <div className="cart-drawer__qty">
            <button
              type="button"
              onClick={() =>
                item.quantity <= 1
                  ? void removeItem(item.product_id, item.variant_id)
                  : void updateQuantity(item.product_id, item.variant_id, item.quantity - 1)
              }
              disabled={isPending}
              aria-label="הפחת כמות"
              className="cart-drawer__qty-btn"
            >
              <Minus size={12} />
            </button>
            <span className="tabular-nums">{item.quantity}</span>
            <button
              type="button"
              onClick={() =>
                void updateQuantity(item.product_id, item.variant_id, item.quantity + 1)
              }
              disabled={isPending || item.quantity >= maxQty}
              aria-label="הוסף כמות"
              className="cart-drawer__qty-btn"
            >
              <Plus size={12} />
            </button>
          </div>
          <span className="cart-drawer__item-price tabular-nums">{shekels(item.line_total)}</span>
        </div>
      </div>
    </li>
  )
}

export default function CartDrawer() {
  const { cart, drawerOpen, closeDrawer, isPending } = useCart()
  const isAuthenticated = useCartAuth()

  /**
   * THE SCROLL LOCK IS A CLASS, NOT `body.style.overflow`, AND THE REASON IS
   * THAT THIS COMPONENT MOUNTS AT WIDTHS WHERE IT IS INVISIBLE.
   *
   * `.cart-drawer-root` is `display: none` above 767px - the sheet is the phone
   * surface, the mini-cart dropdown is the desktop one, and both read the same
   * `drawerOpen` flag. CSS hides the MARKUP; it does not stop the effect. So
   * opening the little dropdown on a 1440px desktop set `overflow: hidden` on
   * the body and the page stopped scrolling, measured with a real wheel
   * gesture: 0px against a 600px scroll, with only a dropdown on screen.
   *
   * That is precisely the modal behaviour `MiniCartDropdown` refuses on purpose
   * (see the note on `<dialog open>` there): a dropdown is not a modal and must
   * not freeze the page behind it.
   *
   * Putting the lock in CSS keeps the 767px boundary in ONE place, next to the
   * two `display: none` rules it has to agree with. A `matchMedia` check here
   * would work today and drift the first time that breakpoint moves - which is
   * the bug this replaces, in a new spelling.
   */
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('cart-drawer-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('cart-drawer-open')
    }
  }, [drawerOpen, closeDrawer])

  /**
   * THE PANEL COVERED THE WHOLE PHONE AND THE KEYBOARD NEVER GOT INTO IT.
   *
   * MEASURED on the built page: after add-to-cart, eight Tab presses and six
   * Shift+Tab presses landed on the buy button, the share buttons and the
   * related-products grid -- fourteen keypresses, not one of them inside the
   * drawer. Every one of those controls is UNDER the overlay, so a sighted
   * keyboard user watches the focus ring disappear behind a sheet they cannot
   * reach, on the first cart they ever see. Escape did close it, which was the
   * only part that worked.
   *
   * `<dialog open>` is not `showModal()`: no top layer, no focus trap, and
   * nothing moves focus by itself. The sheet has the other two halves of modal
   * behaviour already -- a full-screen overlay and a body scroll lock -- so
   * this is the missing third, not a change of character. `MiniCartDropdown`
   * is deliberately NOT modal and is deliberately left alone.
   *
   * THE VISIBILITY TEST IS THE SAME TRAP THE SCROLL LOCK DOCUMENTS ABOVE. This
   * component mounts at EVERY width and CSS hides its markup above 767px, so an
   * effect that focuses on `drawerOpen` alone would move focus into an
   * invisible sheet on a 1440px desktop -- worse than the bug it fixes. It asks
   * the DOM what the CSS decided rather than re-deciding it: `matchMedia` here
   * would drift the first time the breakpoint moves, which is exactly why the
   * scroll lock is a class.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const root = rootRef.current
    const panel = panelRef.current
    if (!drawerOpen || !root || !panel) return
    if (getComputedStyle(root).display === 'none') return

    const focusables = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0)

    const restoreTo = document.activeElement as HTMLElement | null
    // The close button, not the first link: it is the control a keyboard user
    // most likely wants, and landing on a product name reads as if the sheet
    // were a list rather than a thing to dismiss.
    const close = panel.querySelector<HTMLElement>('.cart-drawer__close')
    ;(close ?? focusables()[0] ?? panel).focus()

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      const active = document.activeElement
      // Wraps in both directions, and also catches focus sitting OUTSIDE the
      // panel entirely -- which is where it starts if anything steals it while
      // the sheet is open.
      if (!panel.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onTab)
    return () => {
      document.removeEventListener('keydown', onTab)
      // Only if it is still on the page: the drawer can close because the
      // shopper followed a link out of it, and focusing a detached node throws
      // the caret to the top of the new document.
      if (restoreTo?.isConnected) restoreTo.focus()
    }
  }, [drawerOpen])

  if (!drawerOpen) return null

  return (
    <div ref={rootRef} className="cart-drawer-root" role="presentation">
      <button
        type="button"
        className="cart-drawer__overlay"
        aria-label="סגור עגלת קניות"
        onClick={closeDrawer}
      />

      <dialog ref={panelRef} open className="cart-drawer" aria-label="עגלת קניות">
        <header className="cart-drawer__header">
          <h2 className="cart-drawer__title">
            <ShoppingCart size={20} aria-hidden="true" />
            סל הקניות
            {cart.item_count > 0 && <span className="cart-drawer__count">({cart.item_count})</span>}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            className="cart-drawer__close"
            aria-label="סגור"
          >
            <X size={22} />
          </button>
        </header>

        <div className={`cart-drawer__body ${isPending ? 'opacity-70' : ''}`}>
          {cart.items.length === 0 ? (
            <div className="cart-drawer__empty">
              <ShoppingCart size={40} className="text-icon-empty" aria-hidden="true" />
              <p>העגלה ריקה</p>
              <button type="button" onClick={closeDrawer} className="cart-drawer__shop-link">
                המשך לקניות
              </button>
            </div>
          ) : (
            <ul className="cart-drawer__list">
              {cart.items.map((item) => (
                <DrawerLineItem
                  key={`${item.product_id}::${item.variant_id ?? 'null'}`}
                  item={item}
                />
              ))}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && (
          <footer className="cart-drawer__footer">
            <div className="cart-drawer__subtotal">
              <span>סה"כ לתשלום באתר</span>
              <strong className="tabular-nums">{shekels(cart.subtotal)}</strong>
            </div>
            <Link href="/cart" onClick={closeDrawer} className="cart-drawer__view-cart">
              צפייה בעגלה המלאה
            </Link>
            {/* BOTH halves of the cart page's gate, which is what "same gate"
                used to mean and did not do. The auth half was here: linking
                straight to /checkout sent a guest into a proxy bounce instead
                of the sign-in they need, and lost the drawer's context on the
                way. The AVAILABILITY half was not, and this is the surface
                where it matters most - the drawer opens on add-to-cart, so it
                is the first cart most shoppers see, and it prints the warning
                for a dead line right above a button that let them check out
                with it. The refusal then arrived from `beginCheckout` after
                the whole address form was filled in. "צפייה בעגלה המלאה" above
                is the route out: that page names the lines and removes them. */}
            <CartCheckoutButton
              isAuthenticated={isAuthenticated}
              disabled={cart.items.some((item) => !item.available)}
              className="cart-drawer__checkout"
              onNavigate={closeDrawer}
            />
          </footer>
        )}
      </dialog>
    </div>
  )
}
