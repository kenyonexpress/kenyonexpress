'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { useCallback, useEffect, useRef, useState } from 'react'

type Page = { items: Product[]; nextOffset: number | null }

/**
 * Deals, appended as the shopper nears the end, until the list is exhausted;
 * then a closing line and the footer. `initial` is rendered by the server, so
 * a browser without script still gets the first page.
 */
export default function HomeInfiniteDeals({ initial }: { initial: Page }) {
  const [items, setItems] = useState(initial.items)
  const [next, setNext] = useState(initial.nextOffset)
  const [failed, setFailed] = useState(false)
  const loading = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (next == null || loading.current) return
    loading.current = true
    try {
      const res = await fetch(`/api/home/deals?offset=${next}`)
      if (!res.ok) throw new Error(String(res.status))
      const page = (await res.json()) as Page
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))]
      })
      setNext(page.nextOffset)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      loading.current = false
    }
  }, [next])

  useEffect(() => {
    const el = sentinel.current
    if (!el || next == null || failed || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load()
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [load, next, failed])

  return (
    <section dir="rtl" aria-label="כל הדילים" className="home-section">
      <h2 className="home-section__title">כל הדילים</h2>
      <div className="home-deals-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {next != null ? (
        <div ref={sentinel} className="home-deals-end" data-state={failed ? 'error' : 'loading'}>
          {failed ? (
            <button type="button" onClick={() => void load()} className="home-deals-end__retry">
              נסו שוב
            </button>
          ) : (
            <span aria-live="polite">טוענים עוד דילים…</span>
          )}
        </div>
      ) : (
        <p className="home-deals-end" data-state="done">
          זה הכול להיום — ראיתם את כל הדילים
        </p>
      )}
    </section>
  )
}
