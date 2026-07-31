'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import { useCart, useCartAuth } from '@/components/cart/CartProvider'
import SmartImage from '@/components/ui/SmartImage'
import { shekels } from '@/lib/cart/format'
import type { CartViewItem } from '@/lib/cart/types'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

function DrawerLineItem({ item }: { item: CartViewItem }) {
  const { updateQuantity, removeItem, isPending } = useCart()

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
              disabled={isPending || item.quantity >= 99}
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

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  return (
    <div className="cart-drawer-root" role="presentation">
      <button
        type="button"
        className="cart-drawer__overlay"
        aria-label="סגור עגלת קניות"
        onClick={closeDrawer}
      />

      <dialog open className="cart-drawer" aria-label="עגלת קניות">
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
            {/* Same gate as the cart page. Linking straight to /checkout here
                sent a guest into a proxy bounce instead of the sign-in they
                actually need, and lost the drawer's context on the way. */}
            <CartCheckoutButton
              isAuthenticated={isAuthenticated}
              className="cart-drawer__checkout"
              onNavigate={closeDrawer}
            />
          </footer>
        )}
      </dialog>
    </div>
  )
}
