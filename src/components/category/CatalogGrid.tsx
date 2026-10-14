'use client'

import CategoryProductCard from '@/components/category/CategoryProductCard'
import {
  type ArchivePageItem,
  type ArchivePageResponse,
  archivePageUrl,
  resultCountText,
} from '@/lib/catalog-archive'
import {
  CATALOG_PAGINGS,
  CATALOG_PAGING_LABELS,
  CATALOG_PAGING_LEGEND,
  type CatalogPaging,
  DEFAULT_CATALOG_PAGING,
  RESTORE_MAX_PAGES,
  clearScrollDepth,
  readScrollDepth,
  readStoredCatalogPaging,
  scrollDepthKey,
  writeScrollDepth,
  writeStoredCatalogPaging,
} from '@/lib/catalog-paging'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

type LoadedPage = { page: number; items: ArchivePageItem[] }

type Status = 'idle' | 'loading' | 'error'

/** The grid's copy, in one place for the component and its tests. */
export const LOAD_MORE_LABEL = 'טעינת עוד מוצרים'
export const LOADING_LABEL = 'טוען מוצרים…'
export const RETRY_LABEL = 'הטעינה נכשלה, לנסות שוב'

/**
 * How far under the viewport the foot of the grid is "reached": the next
 * page starts loading one screen before the shopper gets there, so a steady
 * scroll never meets an empty foot.
 */
const PREFETCH_MARGIN = '0px 0px 600px 0px'

function announceLoaded(count: number, total: number, from: number, to: number): string {
  return `נטענו ${count} מוצרים נוספים. מציג ${from}–${to} מתוך ${total}.`
}

/**
 * THE ARCHIVE GRID, WITH ITS TWO WAYS OF GOING PAST PAGE ONE (UX22).
 *
 * The server renders this page's cards as `children`, the numbered
 * `pagination` under them, and the switch that chooses between numbered
 * pages and continuous loading. That server HTML is the numbered mode,
 * always: the first client render matches it byte for byte, and the stored
 * preference is read in an effect after hydration, which is the one order
 * that cannot produce a hydration mismatch (`CatalogViewProvider` explains
 * the measured cost of doing it the other way). A crawler, a reader with
 * storage disabled and the first paint all get `<a href="?page=2">`.
 *
 * In continuous mode the pagination is not rendered and the foot of the grid
 * carries one button, "טעינת עוד מוצרים". An IntersectionObserver presses it
 * when it comes within one screen of the viewport, so a shopper who scrolls
 * never sees it; a shopper who tabs to it, or whose engine has no observer,
 * presses it themselves. The next page comes from `/api/catalog/page` with
 * this URL's every filter and lands INSIDE the same `<ul>`, so the grid is
 * one list to a screen reader and one flex-wrap to the stylesheet (24 a page
 * divides by 2, 3 and 5 columns, so the seam is invisible). A refused or
 * failed fetch turns the button into a retry and auto-loading stops until
 * it is pressed; nothing loops.
 *
 * The depth reached is written to `sessionStorage` per archive URL, and on
 * mount the grid refills to it before the browser restores the scroll, so
 * the back button from a product lands where the shopper left.
 */
export default function CatalogGrid({
  children,
  page,
  totalPages,
  total,
  pageSize,
  from,
  to,
  pagination,
}: {
  /** The server-rendered `<li>`s of this page. */
  children: ReactNode
  page: number
  totalPages: number
  total: number
  pageSize: number
  /** The page's window, for the numbered mode's count line. */
  from: number
  to: number
  /** The server-rendered numbered pages; null when there is one page. */
  pagination: ReactNode
}) {
  const [paging, setPaging] = useState<CatalogPaging>(DEFAULT_CATALOG_PAGING)
  const [loaded, setLoaded] = useState<LoadedPage[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [announcement, setAnnouncement] = useState('')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const inFlight = useRef(false)
  const depthKey = useRef<string | null>(null)

  const lastLoaded = loaded[loaded.length - 1]
  const loadedThrough = lastLoaded ? lastLoaded.page : page
  const hasMore = loadedThrough < totalPages
  const continuous = paging === 'scroll' && totalPages > 1

  useEffect(() => {
    depthKey.current = scrollDepthKey(window.location.pathname, window.location.search)
    setPaging(readStoredCatalogPaging())
  }, [])

  const fetchPage = useCallback(async (target: number): Promise<LoadedPage | null> => {
    const url = archivePageUrl(window.location.pathname, window.location.search, target)
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as Partial<ArchivePageResponse>
    if (!Array.isArray(body.items)) return null
    return { page: target, items: body.items }
  }, [])

  const loadNext = useCallback(async () => {
    if (inFlight.current || !hasMore) return
    inFlight.current = true
    setStatus('loading')
    const target = loadedThrough + 1
    try {
      const next = await fetchPage(target)
      if (!next) {
        setStatus('error')
        return
      }
      setLoaded((prev) => [...prev, next])
      setStatus('idle')
      if (depthKey.current) writeScrollDepth(depthKey.current, target)
      setAnnouncement(
        announceLoaded(next.items.length, total, from, Math.min(target * pageSize, total)),
      )
    } catch {
      setStatus('error')
    } finally {
      inFlight.current = false
    }
  }, [fetchPage, from, hasMore, loadedThrough, pageSize, total])

  // The refill on the way back: the depth this URL reached in this session,
  // fetched in parallel and appended in order, capped so a stale entry cannot
  // walk the whole archive. Runs once, when continuous mode settles.
  const restored = useRef(false)
  useEffect(() => {
    if (!continuous || restored.current) return
    restored.current = true
    const key = depthKey.current
    const depth = key ? readScrollDepth(key) : null
    if (!depth || depth <= page) return
    const last = Math.min(depth, totalPages, page + RESTORE_MAX_PAGES)
    const targets: number[] = []
    for (let p = page + 1; p <= last; p += 1) targets.push(p)
    if (targets.length === 0) return
    inFlight.current = true
    setStatus('loading')
    Promise.all(targets.map((p) => fetchPage(p).catch(() => null)))
      .then((pages) => {
        // Stop at the first page that did not come back, so the list is
        // never page 1, page 3 with a hole where page 2 should be.
        const contiguous: LoadedPage[] = []
        for (const result of pages) {
          if (!result) break
          contiguous.push(result)
        }
        setLoaded(contiguous)
        setStatus(contiguous.length === targets.length ? 'idle' : 'error')
        const deepest = contiguous[contiguous.length - 1]
        if (key && deepest) writeScrollDepth(key, deepest.page)
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [continuous, fetchPage, page, totalPages])

  // The observer presses the button when its box comes within one screen of
  // the viewport. "Above the viewport" counts as reached too: a jump to the
  // very foot of the page can carry the button from below the fold to above
  // it in one frame, with no intersecting state in between
  // (lib/ui/use-scrolled-past.ts measured that on the buy row), and the
  // shopper standing under the grid wants the next page either way.
  useEffect(() => {
    const el = buttonRef.current
    if (!continuous || !hasMore || status !== 'idle' || !el) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
            observer.disconnect()
            void loadNext()
            return
          }
        }
      },
      { threshold: 0, rootMargin: PREFETCH_MARGIN },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [continuous, hasMore, status, loadNext])

  const choose = useCallback((next: CatalogPaging) => {
    setPaging(next)
    writeStoredCatalogPaging(next)
    if (next === 'pages') {
      // Back to numbered pages: the grid shows this page alone again, so the
      // count line and the links describe the same 24 cards.
      setLoaded([])
      setStatus('idle')
      setAnnouncement('')
      if (depthKey.current) clearScrollDepth(depthKey.current)
    }
  }, [])

  const buttonLabel =
    status === 'loading' ? LOADING_LABEL : status === 'error' ? RETRY_LABEL : LOAD_MORE_LABEL
  const countTo = continuous ? Math.min(loadedThrough * pageSize, total) : to

  return (
    <>
      <ul className="category-products">
        {children}
        {loaded.map((entry) =>
          entry.items.map((item) => (
            <li
              key={`${entry.page}-${item.id}`}
              className="category-products__item"
              data-loaded-page={entry.page}
            >
              <CategoryProductCard
                product={item}
                blurDataURL={item.blur}
                dimensions={item.dimensions}
              />
            </li>
          )),
        )}
      </ul>

      {continuous ? (
        <div className="category-load-more" aria-busy={status === 'loading' || undefined}>
          {hasMore && (
            <button
              type="button"
              ref={buttonRef}
              className="category-load-more__btn"
              disabled={status === 'loading'}
              data-status={status}
              onClick={() => void loadNext()}
            >
              {buttonLabel}
            </button>
          )}
          <output className="sr-only" aria-live="polite">
            {announcement}
          </output>
        </div>
      ) : (
        pagination
      )}

      {totalPages > 1 && (
        <fieldset className="category-paging-switch">
          <legend className="sr-only">{CATALOG_PAGING_LEGEND}</legend>
          {CATALOG_PAGINGS.map((option) => {
            const active = paging === option
            return (
              <button
                key={option}
                type="button"
                className={`category-paging-switch__btn${active ? ' is-active' : ''}`}
                aria-pressed={active}
                data-paging={option}
                onClick={() => choose(option)}
              >
                {CATALOG_PAGING_LABELS[option]}
              </button>
            )
          })}
        </fieldset>
      )}

      <p className="category-page__count category-page__count--bottom">
        {resultCountText(total, from, countTo)}
      </p>
    </>
  )
}
