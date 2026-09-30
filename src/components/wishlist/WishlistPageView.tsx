'use client'

import WishlistAlertPrefsCard from '@/components/account/WishlistAlertPrefs'
import { useCart } from '@/components/cart/CartProvider'
import WishlistShareCard from '@/components/wishlist/WishlistShareCard'
import { track } from '@/lib/analytics/tracker'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { loginHrefForWishlist, useWishlistStore } from '@/lib/wishlist/client-store'
import {
  type WishlistViewItem,
  type WishlistViewState,
  getMyWishlistView,
} from '@/server/actions/wishlist'
import { Heart, ShoppingCart, Trash2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/**
 * `/wishlist`, the page the heart points at. Client-rendered from one server
 * read after hydration, like `/cart`: the page itself is static, the list is
 * per shopper, and a static shell with a client fetch is what lets the route
 * be prerendered and cached under `cacheComponents`.
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
export default function WishlistPageView() {
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

  return (
    <div className="cart-page">
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/">עמוד הבית</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">רשימת המשאלות</span>
      </nav>
      <h1 className="cart-page__title">רשימת המשאלות שלי</h1>

      {failed ? (
        <p className="text-muted" role="alert">
          לא הצלחנו לטעון את הרשימה. נסו לרענן את הדף.
        </p>
      ) : view === null ? (
        <p className="text-muted" aria-live="polite">
          טוען את הרשימה...
        </p>
      ) : !view.signedIn ? (
        <SignedOut />
      ) : (
        <SignedIn view={view} onChange={setView} />
      )}
    </div>
  )
}

function SignedOut() {
  return (
    <section className="rounded-lg border border-border-alt bg-white p-6">
      <p className="mb-3 flex items-center gap-2 text-lg font-bold text-heading">
        <Heart size={20} aria-hidden="true" className="text-price" />
        רשימת המשאלות נשמרת בחשבון שלך
      </p>
      <p className="text-muted">
        התחברות קצרה, והלב על כל מוצר שומר אותו כאן: מכל מכשיר, עם התראה במייל כשהמחיר יורד או
        כשהמוצר חוזר למלאי.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={loginHrefForWishlist('/wishlist')}
          className="inline-flex items-center rounded-md bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark hover:opacity-90"
        >
          התחברות
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center rounded-md border border-border-alt px-4 py-2 text-sm font-semibold text-heading hover:border-price"
        >
          לכל המוצרים
        </Link>
      </div>
    </section>
  )
}

function SignedIn({
  view,
  onChange,
}: {
  view: Extract<WishlistViewState, { signedIn: true }>
  onChange: (next: WishlistViewState) => void
}) {
  const { addToCart } = useCart()
  const remove = useWishlistStore((s) => s.remove)
  const [busy, setBusy] = useState<string | 'all' | null>(null)

  const items = view.items
  const movable = items.filter((i) => i.available)

  function drop(productId: string) {
    onChange({ ...view, items: view.items.filter((i) => i.productId !== productId) })
  }

  async function moveOne(item: WishlistViewItem): Promise<boolean> {
    const accepted = await addToCart(item.productId, null, 1, item.name)
    if (!accepted) return false
    track('add_to_cart', { product_id: item.productId, quantity: 1, variant_id: null })
    const result = await remove(item.productId)
    if (result.ok) drop(item.productId)
    return true
  }

  async function onMove(item: WishlistViewItem) {
    setBusy(item.productId)
    try {
      await moveOne(item)
    } finally {
      setBusy(null)
    }
  }

  async function onRemove(item: WishlistViewItem) {
    setBusy(item.productId)
    try {
      const result = await remove(item.productId)
      if (result.ok) drop(item.productId)
      else if (!result.signedOut) toast.error(result.error)
    } finally {
      setBusy(null)
    }
  }

  async function onMoveAll() {
    setBusy('all')
    let moved = 0
    try {
      for (const item of movable) {
        if (await moveOne(item)) moved += 1
      }
      if (moved > 0) toast.success(`${moved} מוצרים עברו לסל`)
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <>
        <section className="rounded-lg border border-border-alt bg-white p-6">
          <p className="text-muted">
            עוד לא שמרת מוצרים. לחיצה על הלב על כל מוצר שומרת אותו כאן.{' '}
            <Link href="/products" className="font-semibold text-price underline">
              לכל המוצרים
            </Link>
          </p>
        </section>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <WishlistAlertPrefsCard />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {items.length === 1 ? 'מוצר אחד שמור' : `${items.length} מוצרים שמורים`}
        </p>
        {movable.length > 1 ? (
          <button
            type="button"
            onClick={() => void onMoveAll()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark hover:opacity-90 disabled:opacity-50"
          >
            <ShoppingCart size={16} aria-hidden="true" />
            העברת הכל לסל ({movable.length})
          </button>
        ) : null}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.productId}
            className="flex flex-col rounded-lg border border-border-alt bg-white p-3"
          >
            <ItemBody item={item} />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onMove(item)}
                disabled={!item.available || busy !== null}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-primary px-3 py-2 text-sm font-bold text-brand-dark hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart size={16} aria-hidden="true" />
                {item.available ? 'העברה לסל' : item.soldOut ? 'אזל מהמלאי' : 'לא זמין'}
              </button>
              <button
                type="button"
                onClick={() => void onRemove(item)}
                disabled={busy !== null}
                aria-label={`הסרת ${item.name} מהרשימה`}
                title="הסרה מהרשימה"
                className="grid h-10 w-10 place-items-center rounded-md border border-border-alt text-icon hover:border-price hover:text-price disabled:opacity-50"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <WishlistShareCard initial={view.share} itemCount={items.length} />
        <WishlistAlertPrefsCard />
      </div>
    </>
  )
}

function ItemBody({ item }: { item: WishlistViewItem }) {
  const price = item.priceIls
  const old = item.fullPriceIls
  const hasDiscount = price != null && old != null && Number(old) > Number(price)
  const body = (
    <span className="flex items-center gap-3">
      {item.image ? (
        <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
          <Image src={item.image} alt="" fill sizes="80px" className="object-cover" />
        </span>
      ) : (
        <span aria-hidden="true" className="h-20 w-20 shrink-0 rounded-lg bg-surface-hover" />
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 block font-semibold text-heading">{item.name}</span>
        {price != null ? (
          <span className="mt-1 flex items-baseline gap-2">
            <span className="text-price font-bold">{shekelsFromIlsRounded(price)}</span>
            {hasDiscount ? (
              <span className="text-sm text-price-strike line-through">
                {shekelsFromIlsRounded(old)}
              </span>
            ) : null}
          </span>
        ) : null}
        {item.soldOut ? (
          <span className="mt-1 block text-xs font-semibold text-price">אזל מהמלאי</span>
        ) : !item.available ? (
          <span className="mt-1 block text-xs font-semibold text-muted">המוצר כבר לא זמין</span>
        ) : null}
      </span>
    </span>
  )
  return item.slug ? (
    <Link href={`/product/${item.slug}`} className="hover:underline">
      {body}
    </Link>
  ) : (
    body
  )
}
