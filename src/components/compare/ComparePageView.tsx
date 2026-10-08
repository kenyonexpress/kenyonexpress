'use client'

import { useCart } from '@/components/cart/CartProvider'
import { track } from '@/lib/analytics/tracker'
import { rehydrateCompareOnce, useCompareStore } from '@/lib/compare/client-store'
import { COMPARE_LIMIT } from '@/lib/compare/limit'
import { EMPTY_CELL, buildCompareRows } from '@/lib/compare/rows'
import type { CompareViewItem } from '@/lib/compare/view'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { getCompareView } from '@/server/actions/compare'
import { Scale, ShoppingCart, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

/**
 * `/compare`: the products the shopper lined up, side by side.
 *
 * ONE READ AFTER HYDRATION, like `/wishlist`: the page is a static shell,
 * the list of ids lives in the browser, and the columns are one server
 * action call with those ids. A product the catalogue no longer answers for
 * is dropped from the list right here, so storage cannot keep a dead column.
 *
 * THE HEADER IS STICKY. The product cells (image, name, price, the two
 * buttons) stay under the site header while the attribute rows scroll, so a
 * value fifteen rows down is never read against the wrong column. The
 * offset is the header's own height token, the same one the header is
 * sized by, at both of its heights.
 *
 * NO HORIZONTAL SCROLL CONTAINER, on purpose: `position: sticky` sticks to
 * the nearest scrolling ancestor, and an `overflow-x: auto` wrapper would
 * make the header stick to a box that never scrolls vertically. Four
 * columns share the width even at 380; names clamp, images shrink.
 */
export default function ComparePageView() {
  const ids = useCompareStore((s) => s.ids)
  const hydrated = useCompareStore((s) => s.hydrated)
  const replace = useCompareStore((s) => s.replace)
  const remove = useCompareStore((s) => s.remove)
  const clear = useCompareStore((s) => s.clear)
  const [items, setItems] = useState<CompareViewItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  useEffect(() => {
    rehydrateCompareOnce()
  }, [])

  // Only a NEW id (or the first hydration) asks the server: a remove is
  // answered from what is already here, through the `loaded` mirror below.
  // `ids` is the store's own array and changes identity only when the list
  // does, so it is the dependency.
  const loaded = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!hydrated) return
    if (ids.length === 0) {
      setItems([])
      return
    }
    if (ids.every((id) => loaded.current.has(id))) return
    let cancelled = false
    getCompareView([...ids])
      .then((state) => {
        if (cancelled) return
        if (!state.ok) {
          setFailed(true)
          return
        }
        setFailed(false)
        setItems(state.items)
        // Every id asked for counts as loaded, including one the catalogue
        // dropped: asking again would only drop it again.
        loaded.current = new Set(ids)
        const live = state.items.map((i) => i.productId)
        if (live.length !== ids.length) replace(live)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated, ids, replace])

  const shown = useMemo(() => (items ?? []).filter((i) => ids.includes(i.productId)), [items, ids])
  const rows = useMemo(() => buildCompareRows(shown), [shown])
  const visibleRows = onlyDifferences ? rows.filter((r) => !r.allSame) : rows

  return (
    <div className="cart-page">
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/">עמוד הבית</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">השוואת מוצרים</span>
      </nav>
      <h1 className="cart-page__title">השוואת מוצרים</h1>

      {failed ? (
        <p className="text-muted" role="alert">
          לא הצלחנו לטעון את המוצרים להשוואה. נסו לרענן את הדף.
        </p>
      ) : !hydrated || items === null ? (
        <p className="text-muted" aria-live="polite">
          טוען את ההשוואה...
        </p>
      ) : shown.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {shown.length} מתוך {COMPARE_LIMIT} מוצרים.
              {shown.length < COMPARE_LIMIT ? (
                <>
                  {' '}
                  <Link href="/products" className="font-semibold text-heading hover:text-price">
                    הוסיפו עוד מוצר
                  </Link>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-heading">
                <input
                  type="checkbox"
                  checked={onlyDifferences}
                  onChange={(e) => setOnlyDifferences(e.target.checked)}
                  className="h-4 w-4 accent-price"
                />
                הצג הבדלים בלבד
              </label>
              <button
                type="button"
                onClick={clear}
                className="tap-area tap-area--36 inline-flex items-center gap-1 text-sm font-semibold text-heading hover:text-price"
              >
                <X size={16} aria-hidden="true" />
                נקה הכל
              </button>
            </div>
          </div>

          <table className="w-full table-fixed border-collapse text-sm" data-testid="compare-table">
            <caption className="sr-only">טבלת השוואה בין {shown.length} מוצרים</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-header-handheld z-20 w-20 bg-white p-1 text-start align-bottom xl:top-header-masthead md:w-36"
                >
                  <span className="sr-only">מאפיין</span>
                </th>
                {shown.map((item) => (
                  <th
                    key={item.productId}
                    scope="col"
                    className="sticky top-header-handheld z-20 bg-white p-1 align-bottom xl:top-header-masthead md:p-2"
                  >
                    <ProductHead item={item} onRemove={() => remove(item.productId)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.key}
                  data-differs={row.allSame ? 'false' : 'true'}
                  className="border-t border-border-alt data-[differs=true]:bg-yellow-50/60"
                >
                  <th
                    scope="row"
                    className="p-1 text-start align-top text-xs font-bold text-heading md:p-2 md:text-sm"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={shown[i]?.productId ?? i}
                      className="break-words p-1 align-top text-xs text-heading md:p-2 md:text-sm"
                    >
                      {cell ?? <span className="text-muted">{EMPTY_CELL}</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={shown.length + 1} className="p-4 text-center text-muted">
                    אין הבדלים בין המוצרים שנבחרו.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function Empty() {
  return (
    <section className="rounded-lg border border-border-alt bg-white p-6">
      <p className="mb-3 flex items-center gap-2 text-lg font-bold text-heading">
        <Scale size={20} aria-hidden="true" className="text-price" />
        עדיין אין מוצרים להשוואה
      </p>
      <p className="text-muted">
        לחצו על ״השוו״ על עד {COMPARE_LIMIT} מוצרים, והם יופיעו כאן זה לצד זה: מחיר, הנחה, זמינות,
        ספק וכל מאפיין שהמוצר מציין.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/products"
          className="inline-flex items-center rounded-md bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark hover:opacity-90"
        >
          לכל המוצרים
        </Link>
      </div>
    </section>
  )
}

function ProductHead({ item, onRemove }: { item: CompareViewItem; onRemove: () => void }) {
  const { addToCart } = useCart()
  const [busy, setBusy] = useState(false)

  async function onAdd() {
    setBusy(true)
    try {
      const accepted = await addToCart(item.productId, null, 1, item.name)
      if (accepted) {
        track('add_to_cart', { product_id: item.productId, quantity: 1, variant_id: null })
      }
    } catch {
      toast.error('ההוספה לסל נכשלה. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const name = item.slug ? (
    <Link href={`/product/${item.slug}`} className="hover:underline">
      {item.name}
    </Link>
  ) : (
    item.name
  )

  return (
    <div className="relative flex flex-col items-center gap-1 text-center">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`הסר את ${item.name} מההשוואה`}
        title="הסר מההשוואה"
        className="tap-area absolute end-0 top-0 z-10 grid h-7 w-7 place-items-center rounded-full border border-gray-200 bg-white text-icon hover:border-price hover:text-price"
      >
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className="relative aspect-square w-14 overflow-hidden rounded-md bg-gray-50 md:w-24">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 768px) 96px, 56px"
            className="object-contain"
          />
        ) : null}
      </div>
      <p className="line-clamp-3 text-xs font-semibold text-heading md:text-sm">{name}</p>
      <p className="text-sm font-bold text-price">
        {item.priceIls === null ? EMPTY_CELL : shekelsFromIlsRounded(item.priceIls)}
      </p>
      {item.available ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          aria-label={`הוסף את ${item.name} לסל`}
          className="tap-area tap-area--36 inline-flex items-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-xs font-bold text-brand-dark hover:opacity-90 disabled:opacity-50"
        >
          <ShoppingCart size={14} aria-hidden="true" />
          <span className="hidden md:inline">לסל</span>
        </button>
      ) : (
        <span className="text-xs text-muted">{item.soldOut ? 'אזל מהמלאי' : 'לא זמין'}</span>
      )}
    </div>
  )
}
