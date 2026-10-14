'use client'

import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import {
  type ListingSnapshot,
  mergeItems,
  pageUrl,
  parseSnapshot,
  serializeSnapshot,
  snapshotKey,
} from '@/lib/catalogue/infinite-state'
import { resultCountText } from '@/lib/catalogue/result-count'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * The listing grid, with the next page appended as the shopper nears the end.
 *
 * THE SERVER STILL RENDERS A WHOLE PAGE, AND THE NUMBERED LINKS STILL EXIST.
 * `initial` is page N from the server and `children` is the numbered
 * pagination. A crawler, and a browser that runs no script or has no
 * IntersectionObserver, gets exactly the page it got before this component
 * existed. The enhancement replaces the numbered links with a sentinel only
 * after it has mounted and knows it can observe.
 *
 * The button under the grid is the same action as the sentinel. It is there
 * for a keyboard, for a failed request (it is the retry), and for a browser
 * that cancels observers in the background.
 *
 * BACK RETURNS TO THE CARD, NOT TO THE TOP. Appended pages live in component
 * state, which a navigation discards. On the way out the grid stores what it
 * had appended and the scroll offset in sessionStorage; on the way back, and
 * only on a history navigation, it puts both back before the browser paints.
 * A fresh visit to the same URL starts at page one like any other.
 */

type Props = {
  initial: CategoryProduct[]
  /** The page `initial` is. The grid appends from the one after it. */
  startPage: number
  totalPages: number
  total: number
  pageSize: number
  /** `/api/catalogue/listing?...` for this listing, without `page`. */
  endpoint: string
  /** The numbered pagination, shown until the grid can load pages itself. */
  children?: ReactNode
}

type Status = 'idle' | 'loading' | 'error'

/**
 * True while the navigation that mounted the page was Back or Forward. A
 * client-side history navigation fires `popstate` before the page mounts, so
 * the listener has to outlive every instance of the component: it is
 * registered once, when this module first loads in the browser.
 */
let arrivedByHistory = false
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    arrivedByHistory = true
  })
}

function isHistoryNavigation(): boolean {
  if (arrivedByHistory) return true
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  return entry?.type === 'back_forward'
}

function readSnapshot(key: string): ListingSnapshot | null {
  try {
    return parseSnapshot(window.sessionStorage.getItem(key), Date.now())
  } catch {
    return null
  }
}

function writeSnapshot(key: string, snapshot: ListingSnapshot): void {
  try {
    window.sessionStorage.setItem(key, serializeSnapshot(snapshot))
  } catch {
    // Storage is full or refused (private mode). Losing the snapshot costs a
    // scroll position, never a page.
  }
}

export default function InfiniteProductGrid({
  initial,
  startPage,
  totalPages,
  total,
  pageSize,
  endpoint,
  children,
}: Props) {
  const [extra, setExtra] = useState<CategoryProduct[]>([])
  const [nextPage, setNextPage] = useState(startPage + 1)
  const [status, setStatus] = useState<Status>('idle')
  const [enhanced, setEnhanced] = useState(false)
  const [restoreY, setRestoreY] = useState<number | null>(null)

  const sentinel = useRef<HTMLDivElement | null>(null)
  const busy = useRef(false)
  const key = snapshotKey(endpoint, startPage)
  const done = nextPage > totalPages

  // Read after mount, never during render: the server has no storage and the
  // first client render must match what it sent.
  useEffect(() => {
    setEnhanced('IntersectionObserver' in window)
    const history = isHistoryNavigation()
    arrivedByHistory = false
    if (!history) return
    const snapshot = readSnapshot(key)
    if (!snapshot) return
    setExtra(snapshot.items as unknown as CategoryProduct[])
    setNextPage(snapshot.nextPage)
    setRestoreY(snapshot.scrollY)
  }, [key])

  // After the restored cards are in the document, so the page is tall enough
  // for the offset to exist.
  useLayoutEffect(() => {
    if (restoreY === null) return
    window.scrollTo(0, restoreY)
    setRestoreY(null)
  }, [restoreY])

  const loadNext = useCallback(async () => {
    if (busy.current || nextPage > totalPages) return
    busy.current = true
    setStatus('loading')
    try {
      const res = await fetch(pageUrl(endpoint, nextPage), {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`listing ${res.status}`)
      const body = (await res.json()) as { items?: CategoryProduct[] }
      const items = Array.isArray(body.items) ? body.items : []
      setExtra((current) => mergeItems(initial, current, items))
      // An empty page ends the list: asking again would loop on the sentinel.
      setNextPage(items.length === 0 ? totalPages + 1 : nextPage + 1)
      setStatus('idle')
    } catch {
      setStatus('error')
    } finally {
      busy.current = false
    }
  }, [endpoint, initial, nextPage, totalPages])

  useEffect(() => {
    const node = sentinel.current
    if (!enhanced || done || status === 'error' || !node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNext()
      },
      // Start a screen early, so the next row is there before the last one is read.
      { rootMargin: '0% 0% 100% 0%' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enhanced, done, status, loadNext])

  // Persist on the way out. `pagehide` covers a real navigation and a closed
  // tab; the pointer and key handlers cover a client-side navigation, where
  // the offset has to be read before the router scrolls the next page.
  const latest = useRef({ extra, nextPage })
  latest.current = { extra, nextPage }
  useEffect(() => {
    const save = () => {
      if (latest.current.extra.length === 0) return
      writeSnapshot(key, {
        items: latest.current.extra,
        nextPage: latest.current.nextPage,
        scrollY: window.scrollY,
        savedAt: Date.now(),
      })
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('click', save, true)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('click', save, true)
    }
  }, [key])

  const shown = initial.length + extra.length
  const from = (startPage - 1) * pageSize + 1
  const to = Math.min(from + shown - 1, total)

  return (
    <>
      <ul className="category-products">
        {initial.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product} />
          </li>
        ))}
        {extra.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product} />
          </li>
        ))}
      </ul>

      {enhanced
        ? !done && (
            <div ref={sentinel} className="category-pagination">
              <button
                type="button"
                className="category-load-more"
                onClick={() => void loadNext()}
                disabled={status === 'loading'}
              >
                {status === 'loading'
                  ? 'טוענים מוצרים נוספים...'
                  : status === 'error'
                    ? 'הטעינה נכשלה. נסו שוב'
                    : 'הצגת מוצרים נוספים'}
              </button>
            </div>
          )
        : children}

      <p className="category-page__count category-page__count--bottom" aria-live="polite">
        {resultCountText(total, from, to)}
      </p>
    </>
  )
}
