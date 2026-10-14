'use client'

import { useCart } from '@/components/cart/CartProvider'
import { useSavedForLaterStoreApi } from '@/components/cart/SavedForLaterProvider'
import SmartImage from '@/components/ui/SmartImage'
import { lineQuantityCeiling, unavailableMessage } from '@/lib/cart/format'
import { savedItemFromLine } from '@/lib/cart/saved-for-later'
import type { CartViewItem } from '@/lib/cart/types'
import { shekels } from '@/lib/money-format'
import { Bookmark, Minus, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { type AnimationEvent, useEffect, useId, useRef, useState } from 'react'

/**
 * What a typed quantity becomes. Pure so the test can name every edge:
 * empty and non-numeric revert to what the line had, a fraction is floored,
 * anything below one is one (typing 0 is not a removal; the trash button is,
 * and it is next to this field), and anything above the ceiling is the
 * ceiling. Null means "nothing to write".
 */
export function commitTypedQuantity(raw: string, current: number, maxQty: number): number | null {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return null
  const next = Math.min(maxQty, Math.max(1, parsed))
  return next === current ? null : next
}

/**
 * How long the row is given to animate out before the removal fires anyway.
 *
 * The exit is `cart-line-leave` in cart-page.css (240ms; the global
 * prefers-reduced-motion rule collapses it to 0.01ms and `animationend` still
 * fires). This is the floor under that: a stylesheet that failed to load, or a
 * test renderer with no layout, never fires the event, and a remove button
 * that only works when the CSS arrived is not a remove button.
 */
export const CART_LINE_LEAVE_FALLBACK_MS = 450

/** What the sr-only live region says after a quantity change. */
export function quantityAnnouncement(name: string, quantity: number): string {
  return `הכמות של ${name} עודכנה ל-${quantity}`
}

/**
 * The sentence under the stepper once `+` has nothing left to give, or null
 * while it has. Two sentences because the two ceilings mean different things:
 * the shelf is what the catalogue has, the cap is what one order may hold.
 */
export function ceilingHint(quantity: number, maxQty: number, tracked: boolean): string | null {
  if (quantity < maxQty) return null
  return tracked ? 'זו הכמות המקסימלית במלאי' : `עד ${maxQty} יחידות בהזמנה אחת`
}

export default function CartLineItem({ item }: { item: CartViewItem }) {
  const { updateQuantity, removeItem, isPending } = useCart()
  // Null outside the cart page (drawer, mini cart), where there is no list
  // to park a line in and the button is not rendered.
  const savedStore = useSavedForLaterStoreApi()
  const [localQty, setLocalQty] = useState(item.quantity)
  // The field's text while it is being edited. Kept apart from `localQty`
  // because an input bound straight to a clamped number cannot be emptied to
  // type a new value: backspace over "3" would snap to "1" before the "5" was
  // pressed. It follows `localQty` whenever that moves.
  const [draft, setDraft] = useState(String(item.quantity))
  // What the live region says. Set by the stepper and the typed field, never
  // by the server echo, so a change made in another tab is not narrated here.
  const [announce, setAnnounce] = useState('')
  // True from the remove (or park) press until the exit animation has ended
  // and the store write has fired. The row stays in the DOM for that long.
  const [leaving, setLeaving] = useState(false)
  // Pulses the line total once when the server's figure for it moves.
  const [pulse, setPulse] = useState(false)
  const previousTotal = useRef(item.line_total)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const afterLeave = useRef<(() => void) | null>(null)
  const article = useRef<HTMLElement>(null)
  const hintId = useId()

  useEffect(() => {
    setLocalQty(item.quantity)
    setDraft(String(item.quantity))
  }, [item.quantity])

  useEffect(() => {
    if (previousTotal.current === item.line_total) return
    previousTotal.current = item.line_total
    setPulse(true)
    const timer = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(timer)
  }, [item.line_total])

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    },
    [],
  )

  // Before this, `+` ran to 99 against any stock level, so the only way to
  // discover there were three left was to press it a fourth time and read the
  // error toast the server sent back.
  const maxQty = lineQuantityCeiling(item)
  const warning = unavailableMessage(item)
  const hint = ceilingHint(localQty, maxQty, item.max_quantity !== null)
  const busy = isPending || leaving

  const commit = (next: number) => {
    setLocalQty(next)
    setDraft(String(next))
    setAnnounce(quantityAnnouncement(item.name_he, next))
    void updateQuantity(item.product_id, item.variant_id, next)
  }

  const dec = () => {
    const next = Math.max(1, localQty - 1)
    if (next === localQty) return
    commit(next)
  }

  const inc = () => {
    const next = Math.min(maxQty, localQty + 1)
    // At the ceiling `next` equals `localQty`, and firing the write anyway
    // would spend a round trip to be told the quantity it already has.
    if (next === localQty) return
    commit(next)
  }

  // The stepper is one press per unit, and a shopper who wants twelve of
  // something was pressing "+" eleven times. Live's WooCommerce cart has a
  // typed number field here (refs/ke_live_computed.json, cart@380, the 75px
  // quantity row); this is that field, committed on blur and on Enter.
  const commitDraft = () => {
    const next = commitTypedQuantity(draft, localQty, maxQty)
    if (next === null) {
      setDraft(String(localQty))
      return
    }
    commit(next)
  }

  // The row leaves before the store does. `data-leaving` starts the exit in
  // cart-page.css; `animationend` (or the fallback timer, whichever is first)
  // fires the write exactly once. Measured before this (logs/ux16/before.json,
  // midRemove): the row was gone from the DOM within one frame of the press,
  // and the list under it jumped up by the row's height with nothing to say
  // which row had gone.
  //
  // The write is awaited so a REFUSED removal can put the row back: the store
  // rolls the line into the cart under the same key, so this very component
  // survives, and a `leaving` left true would be a row the shopper can see
  // through and cannot touch.
  const leave = (write: () => Promise<void>) => {
    if (leaving) return
    // The fold animates max-height, which needs a number to start from; the
    // row's own height, read now, is that number.
    const el = article.current
    if (el) el.style.setProperty('--cart-line-h', `${el.getBoundingClientRect().height}px`)
    afterLeave.current = () => {
      afterLeave.current = null
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
      leaveTimer.current = null
      void write().finally(() => setLeaving(false))
    }
    setLeaving(true)
    leaveTimer.current = setTimeout(() => afterLeave.current?.(), CART_LINE_LEAVE_FALLBACK_MS)
  }

  const onLeaveEnd = (event: AnimationEvent<HTMLElement>) => {
    // The name check keeps the price pulse (a child animation that bubbles)
    // from ending the exit early.
    if (event.target !== event.currentTarget || event.animationName !== 'cart-line-leave') return
    afterLeave.current?.()
  }

  const remove = () => {
    leave(() => removeItem(item.product_id, item.variant_id))
  }

  // Park first, then remove. The order matters when the remove is refused:
  // the store rolls the line back into the cart and the parked copy is a
  // harmless duplicate the shopper can discard. The other order would lose
  // the line on a refused park, and nothing refuses a localStorage write.
  const saveForLater = () => {
    if (!savedStore) return
    const store = savedStore
    leave(() => {
      store.getState().save(savedItemFromLine(item))
      return removeItem(item.product_id, item.variant_id)
    })
  }

  return (
    <article
      ref={article}
      className="cart-line"
      data-leaving={leaving || undefined}
      aria-busy={leaving || undefined}
      onAnimationEnd={onLeaveEnd}
    >
      <Link href={`/product/${item.slug}`} className="cart-line__thumb">
        {item.image_url ? (
          <SmartImage
            src={item.image_url}
            alt={item.name_he}
            width={100}
            height={100}
            className="h-full w-full object-contain"
            fallbackClassName="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-hover text-icon-empty text-xs">
            אין תמונה
          </div>
        )}
      </Link>

      <div className="cart-line__body">
        <Link href={`/product/${item.slug}`} className="cart-line__name">
          {item.name_he}
        </Link>

        {/* <output>, not a <p role="status">: it carries the same implicit
            role, and it is what this actually is -- a message produced in
            response to the shopper's own action, announced when a quantity
            change turns a line unavailable rather than only read on load. */}
        {warning && <output className="cart-line__warning">{warning}</output>}

        {/* The unit price times the count, on the card only (below 768 the
            stacked rows already carry a unit-price row). Hidden at one: "x1"
            tells the shopper nothing the line total does not. */}
        {item.quantity > 1 && (
          <p className="cart-line__meta" data-testid="cart-line-meta">
            {shekels(item.unit_price)} × {item.quantity}
          </p>
        )}

        {item.type === 'coupon' && item.balance_due_at_business > 0 && (
          <p className="cart-line__coupon-note">
            תשלום באתר: {shekels(item.customer_pays_now)} · יתרה בחנות:{' '}
            {shekels(item.balance_due_at_business)}
          </p>
        )}

        {/* The engine's own figure for this line, hidden at zero. Same rule
            as the product page's preview: "0% cashback" is noise. */}
        {item.cashback > 0 && (
          <p className="cart-line__cashback" data-testid="cart-line-cashback">
            קאשבק לארנק: {shekels(item.cashback)}
          </p>
        )}

        {/* Below 768 the line renders as live's stacked WooCommerce rows
            (remove / name / unit price / quantity / line total, measured
            57+83+54+75+54 in refs/ke_live_computed.json cart@380). This row is
            the unit price, which the desktop card never shows; CSS hides it
            from 768 up and orders the interactive controls around it. */}
        <div className="cart-line__unit">
          <span>מחיר:</span>
          <span>{shekels(item.unit_price)}</span>
          {/* The line is priced from a flash-sale hold (STEP 61); the
              shopper should see why this price is not the catalogue's. */}
          {item.flash_sale_id && (
            <span className="rounded bg-brand px-2 py-0.5 text-xs font-bold text-heading">
              מחיר בזק
            </span>
          )}
        </div>

        {/* DOM order is side order in this RTL flex row. Live's cart row reads
            right-to-left: remove (x1236, the far right of a 135..1305 row),
            then price (x497), then quantity (x267) with the subtotal leftmost
            (refs/ke_live_computed.json, cart@1440). Ours had the exact mirror:
            qty right, remove far left. Remove renders first (right), price
            next, and the qty pill carries the auto margin to the far left. */}
        <div className="cart-line__footer">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`הסר ${item.name_he} מהעגלה`}
            className="cart-line__remove"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>

          {savedStore && (
            <button
              type="button"
              onClick={saveForLater}
              disabled={busy}
              className="cart-line__save"
              aria-label={`שמור ${item.name_he} לאחר כך`}
            >
              <Bookmark size={14} aria-hidden="true" />
              <span>שמור לאחר כך</span>
            </button>
          )}

          {/* Mobile-only labels for the stacked rows; aria-hidden because the
              controls beside them are already named. */}
          <span className="cart-line__mlabel" aria-hidden="true">
            מחיר:
          </span>
          <span className="cart-line__price" data-pulse={pulse || undefined}>
            {shekels(item.line_total)}
          </span>

          <span className="cart-line__mlabel" aria-hidden="true">
            כמות:
          </span>
          <div className="cart-line__qty">
            <button
              type="button"
              onClick={dec}
              disabled={localQty <= 1 || busy}
              aria-label="הפחת כמות"
              className="cart-line__qty-btn"
            >
              <Minus size={14} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
              disabled={busy}
              aria-label={`כמות עבור ${item.name_he}`}
              className="cart-line__qty-value tabular-nums"
            />
            <button
              type="button"
              onClick={inc}
              disabled={localQty >= maxQty || busy}
              aria-label="הוסף כמות"
              aria-describedby={hint ? hintId : undefined}
              className="cart-line__qty-btn"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Why `+` is grey, said once it is. Before this the disabled button
              was the whole explanation. */}
          {hint && (
            <p id={hintId} className="cart-line__qty-hint">
              {hint}
            </p>
          )}

          {/* Announced, not shown: the field already shows the number. */}
          <output className="sr-only cart-line__announce" aria-live="polite">
            {announce}
          </output>
        </div>
      </div>
    </article>
  )
}

/**
 * The empty cart, rebuilt to the live page rather than invented.
 *
 * Measured off kenyonexpress.co.il/cart/ with an empty basket: a full-width
 * brand-yellow banner, 49px/300 centred text reading "סל הקניות שלך ריק כרגע.",
 * then a 157x45 grey pill at radius 50 saying "חזור לחנות". What was here
 * before was a bordered white card with an icon and a yellow CTA, which is a
 * perfectly reasonable empty state and is not the one this site has.
 *
 * The colours live in `.cart-empty` and `.cart-empty__cta` in cart-page.css.
 * Naming them here as literals is what the raw-hex gate in tokens.test.ts
 * exists to stop, even in a comment: a hex written down in two places is a hex
 * that will disagree with itself.
 */
export function CartEmptyState() {
  return (
    <>
      <div className="cart-empty">סל הקניות שלך ריק כרגע.</div>
      <p className="cart-empty__actions">
        <Link href="/products" className="cart-empty__cta">
          חזור לחנות
        </Link>
      </p>
    </>
  )
}
