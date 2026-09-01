'use client'

import { type QuickSearchHit, quickSearchOrders } from '@/server/actions/admin/quick-search'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cmd+K anywhere in the panel: find an order by invoice number, email or phone.
 *
 * The search itself is a server action behind `requireSection('orders','read')`,
 * so this component holds no credentials and can reach nothing an admin could
 * not already read. It is a keyboard shortcut over an authorised query.
 *
 * Mounted once in the admin layout rather than per page, because the whole
 * point is that it works from wherever the operator happens to be standing when
 * the phone rings.
 */

const DEBOUNCE_MS = 250
const MIN_TERM = 2

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<QuickSearchHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Guards against an older, slower response overwriting a newer one.
  const requestId = useRef(0)

  const close = useCallback(() => {
    setOpen(false)
    setTerm('')
    setHits([])
    setError(null)
    setCursor(0)
  }, [])

  // Cmd+K / Ctrl+K to open, Escape to close. Bound on the document because the
  // palette has to answer from any page in the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
        return
      }
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = term.trim()
    if (trimmed.length < MIN_TERM) {
      setHits([])
      setError(null)
      return
    }

    const id = ++requestId.current
    setBusy(true)
    const timer = setTimeout(async () => {
      const result = await quickSearchOrders({ term: trimmed })
      // A response from a term the operator has already typed past is stale.
      if (id !== requestId.current) return
      setBusy(false)
      if ('error' in result) {
        setError(result.error)
        setHits([])
      } else {
        setError(null)
        setHits(result.hits)
        setCursor(0)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term, open])

  const go = useCallback(
    (hit: QuickSearchHit) => {
      close()
      router.push(`/admin/orders/${hit.orderId}`)
    },
    [close, router],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      // Clicking the backdrop closes. The dialog itself stops propagation.
      onMouseDown={close}
    >
      <dialog
        open
        aria-label="חיפוש מהיר"
        className="w-full max-w-xl rounded-lg border border-black/10 bg-surface p-0 shadow-xl"
        dir="rtl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((c) => Math.min(c + 1, hits.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            } else if (event.key === 'Enter' && hits[cursor]) {
              event.preventDefault()
              go(hits[cursor])
            }
          }}
          placeholder="מס׳ חשבונית, אימייל או טלפון…"
          className="h-12 w-full rounded-t-lg border-b border-black/10 bg-transparent px-4 text-sm outline-none"
        />

        <div className="max-h-80 overflow-y-auto">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}

          {!error && term.trim().length >= MIN_TERM && !busy && hits.length === 0 && (
            <p className="p-4 text-sm text-black/50">לא נמצאו הזמנות</p>
          )}

          {!error &&
            hits.map((hit, index) => (
              <button
                key={hit.orderId}
                type="button"
                onClick={() => go(hit)}
                onMouseEnter={() => setCursor(index)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-start text-sm ${
                  index === cursor ? 'bg-black/5' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="font-medium">{hit.invoiceNumber ?? '(ללא מספר)'}</span>
                  <span className="ms-2 text-black/50">
                    {hit.customerName ?? hit.customerEmail ?? ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-black/40">
                  {hit.matchedOn === 'invoice' ? 'חשבונית' : 'לקוח'} ·{' '}
                  {new Date(hit.createdAt).toLocaleDateString('he-IL')}
                </span>
              </button>
            ))}
        </div>

        <p className="border-t border-black/10 px-4 py-2 text-xs text-black/40">
          ⌘K לפתיחה · ↑↓ לניווט · Enter לפתיחת הזמנה · Esc לסגירה
        </p>
      </dialog>
    </div>
  )
}
