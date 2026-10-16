'use client'

import WishlistAlertPrefsCard from '@/components/account/WishlistAlertPrefs'
import { useCart } from '@/components/cart/CartProvider'
import { Heart, ShoppingCart } from '@/components/icons'
import WishlistCard, { type WishlistCardOutcome } from '@/components/wishlist/WishlistCard'
import WishlistShareAction from '@/components/wishlist/WishlistShareAction'
import WishlistShareCard from '@/components/wishlist/WishlistShareCard'
import { track } from '@/lib/analytics/tracker'
import { notify } from '@/lib/ui/toast'
import { loginHrefForWishlist, useWishlistStore } from '@/lib/wishlist/client-store'
import {
  movableItems,
  moveAllLabel,
  movedAnnouncement,
  movedManyAnnouncement,
  removedAnnouncement,
  restoreItem,
  restoredAnnouncement,
  savedCountLabel,
} from '@/lib/wishlist/page-view'
import {
  type WishlistShareState,
  type WishlistViewItem,
  type WishlistViewState,
  getMyWishlistView,
} from '@/server/actions/wishlist'
import Link from 'next/link'
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

/**
 * `/wishlist` and `/account/wishlist`, the page the heart points at. Client-
 * rendered from one server read after hydration, like `/cart`: the page
 * itself is static, the list is per shopper, and a static shell with a client
 * fetch is what lets the route be prerendered and cached under
 * `cacheComponents`.
 *
 * UX20: A PRODUCT GRID WITH A TOOLBAR. Two cards across on a phone, three
 * from 768, four from 1200, each the catalogue card's anatomy (photo, name,
 * price, stock line) plus the two actions the catalogue card does not have:
 * move to cart and remove. The toolbar above it carries the count, a one-
 * press share, and "move all". A sr-only live region announces every move
 * and removal; a removal offers an undo in its toast that puts the product
 * back where it was.
 *
 * MOVE TO CART IS TWO STEPS IN ONE ORDER, AND THE ORDER MATTERS. The cart is
 * asked first, on the cart store (the same path the card button takes, so
 * stock and status are validated by the server and the toast comes from the
 * cart). Only an ACCEPTED add removes the row from the wishlist; a refused
 * add leaves the product saved, because a product that is sold out today is
 * exactly what the shopper saved it to be told about.
 *
 * SIGNED OUT is a page, not a bounce: the proxy leaves `/wishlist` public on
 * purpose so a visitor who pressed a heart lands somewhere that explains and
 * offers sign-in with a return path.
 */
export default function WishlistPageView({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<WishlistViewState | null>(null)
  const [failed, setFailed] = useState(false)
  const replace = useWishlistStore((s) => s.replace)

  useEffect(() => {
    let cancelled = false
    getMyWishlistView()
      .then((state) => {
        if (cancelled) return
        setView(state)
        replace(state.signedIn ? state.items.map((i) => i.productId) : [], state.signedIn)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [replace])

  const body = failed ? (
    <p className="text-muted" role="alert">
      לא הצלחנו לטעון את הרשימה. נסו לרענן את הדף.
    </p>
  ) : view === null ? (
    <LoadingGrid />
  ) : !view.signedIn ? (
    <SignedOut returnTo={embedded ? '/account/wishlist' : '/wishlist'} />
  ) : (
    <SignedIn view={view} onChange={setView} />
  )

  // UX18: inside the account shell the breadcrumb and the frame are the
  // shell's; the page contributes its title in the account's own type.
  if (embedded) {
    return (
      <>
        <h1 className="account-title">רשימת המשאלות</h1>
        <p className="account-subtitle">המוצרים ששמרת עם הלב, מכל מכשיר</p>
        {body}
      </>
    )
  }

  return (
    <div className="cart-page">
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/">עמוד הבית</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">רשימת המשאלות</span>
      </nav>
      <h1 className="cart-page__title">רשימת המשאלות שלי</h1>
      {body}
    </div>
  )
}

/** The same cells as the grid, so nothing moves when the list lands. */
function LoadingGrid() {
  return (
    <div className="wishlist">
      <ul className="wishlist-grid" aria-busy="true" aria-label="טוען את הרשימה">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
          <li key={i} className="wishlist-grid__item">
            <div className="wishlist-card wishlist-card--skeleton">
              <span className="wishlist-skeleton wishlist-skeleton--thumb" />
              <span className="wishlist-skeleton wishlist-skeleton--line" />
              <span className="wishlist-skeleton wishlist-skeleton--line is-short" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SignedOut({ returnTo }: { returnTo: string }) {
  return (
    <section className="wishlist-empty">
      <p className="wishlist-empty__title">
        <Heart size={20} aria-hidden="true" />
        רשימת המשאלות נשמרת בחשבון שלך
      </p>
      <p className="wishlist-empty__text">
        התחברות קצרה, והלב על כל מוצר שומר אותו כאן: מכל מכשיר, עם התראה במייל כשהמחיר יורד או
        כשהמוצר חוזר למלאי.
      </p>
      <div className="wishlist-empty__actions">
        <Link
          href={loginHrefForWishlist(returnTo)}
          className="wishlist-toolbar__button wishlist-toolbar__button--primary"
        >
          התחברות
        </Link>
        <Link href="/products" className="wishlist-toolbar__button">
          לכל המוצרים
        </Link>
      </div>
    </section>
  )
}

type SignedInView = Extract<WishlistViewState, { signedIn: true }>

function SignedIn({
  view,
  onChange,
}: {
  view: SignedInView
  /**
   * A functional updater on purpose: the undo in a toast fires after other
   * removals may have landed, so every edit reads the freshest view the page
   * holds rather than the one the closure captured.
   */
  onChange: Dispatch<SetStateAction<WishlistViewState | null>>
}) {
  const { addToCart } = useCart()
  const remove = useWishlistStore((s) => s.remove)
  const toggle = useWishlistStore((s) => s.toggle)
  const [movingAll, setMovingAll] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const items = view.items
  const movable = movableItems(items)

  function editItems(edit: (items: WishlistViewItem[]) => WishlistViewItem[]) {
    onChange((prev) => (prev?.signedIn ? { ...prev, items: edit(prev.items) } : prev))
  }

  function setShare(share: WishlistShareState) {
    onChange((prev) => (prev?.signedIn ? { ...prev, share } : prev))
  }

  /** Ask the cart. The card starts its exit only on `true`. */
  async function moveToCart(item: WishlistViewItem): Promise<boolean> {
    const accepted = await addToCart(item.productId, null, 1, item.name)
    if (!accepted) return false
    track('add_to_cart', { product_id: item.productId, quantity: 1, variant_id: null })
    return true
  }

  /** The wishlist write, after the card's exit. */
  async function removeSaved(
    item: WishlistViewItem,
    reason: 'remove' | 'move',
  ): Promise<WishlistCardOutcome> {
    const index = view.items.findIndex((i) => i.productId === item.productId)
    const result = await remove(item.productId)
    if (!result.ok) {
      if (!result.signedOut) notify('error', result.error)
      return { ok: false }
    }
    editItems((current) => current.filter((i) => i.productId !== item.productId))
    if (reason === 'move') {
      setAnnouncement(movedAnnouncement(item.name))
      return { ok: true }
    }
    setAnnouncement(removedAnnouncement(item.name))
    notify('success', removedAnnouncement(item.name), {
      action: {
        label: 'ביטול',
        onClick: () => void restore(item, index),
      },
    })
    return { ok: true }
  }

  /** The undo: the heart's own toggle puts the row back, then the card. */
  async function restore(item: WishlistViewItem, index: number) {
    const result = await toggle(item.productId)
    if (!result.ok) {
      if (!result.signedOut) notify('error', result.error)
      return
    }
    if (!result.saved) return
    editItems((current) => restoreItem(current, item, index))
    setAnnouncement(restoredAnnouncement(item.name))
  }

  async function onMoveAll() {
    setMovingAll(true)
    let moved = 0
    try {
      for (const item of movable) {
        const accepted = await moveToCart(item)
        if (!accepted) continue
        const result = await remove(item.productId)
        if (!result.ok) continue
        moved += 1
        editItems((current) => current.filter((i) => i.productId !== item.productId))
      }
      if (moved > 0) {
        setAnnouncement(movedManyAnnouncement(moved))
        notify('success', movedManyAnnouncement(moved))
      }
    } finally {
      setMovingAll(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="wishlist">
        <section className="wishlist-empty">
          <p className="wishlist-empty__title">
            <Heart size={20} aria-hidden="true" />
            עוד לא שמרת מוצרים
          </p>
          <p className="wishlist-empty__text">
            לחיצה על הלב על כל מוצר שומרת אותו כאן, ונודיע לך במייל כשהמחיר יורד או כשהמוצר חוזר
            למלאי.
          </p>
          <div className="wishlist-empty__actions">
            <Link
              href="/products"
              className="wishlist-toolbar__button wishlist-toolbar__button--primary"
            >
              לכל המוצרים
            </Link>
            <Link href="/coupons" className="wishlist-toolbar__button">
              לקופונים
            </Link>
          </div>
        </section>
        <output className="sr-only" aria-live="polite">
          {announcement}
        </output>
        <div className="wishlist-foot">
          <WishlistAlertPrefsCard />
        </div>
      </div>
    )
  }

  return (
    <div className="wishlist">
      <div className="wishlist-toolbar">
        <p className="wishlist-toolbar__count">{savedCountLabel(items.length)}</p>
        <div className="wishlist-toolbar__actions">
          <WishlistShareAction share={view.share} onShareChange={setShare} />
          {movable.length > 1 ? (
            <button
              type="button"
              onClick={() => void onMoveAll()}
              disabled={movingAll}
              className="wishlist-toolbar__button wishlist-toolbar__button--primary"
            >
              <ShoppingCart size={16} aria-hidden="true" />
              {movingAll ? 'מעביר לסל...' : moveAllLabel(movable.length)}
            </button>
          ) : null}
        </div>
      </div>

      <ul className="wishlist-grid" aria-label="המוצרים השמורים">
        {items.map((item) => (
          <li key={item.productId} className="wishlist-grid__item">
            <WishlistCard
              item={item}
              disabled={movingAll}
              onMove={moveToCart}
              onRemove={removeSaved}
            />
          </li>
        ))}
      </ul>

      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>

      <div className="wishlist-foot">
        <WishlistShareCard share={view.share} onChange={setShare} itemCount={items.length} />
        <WishlistAlertPrefsCard />
      </div>
    </div>
  )
}
