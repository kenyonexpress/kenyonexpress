'use client'

import {
  bulkMarkItemsDelivered,
  bulkMarkItemsShipped,
  markItemDelivered,
  markItemShipped,
} from '@/server/actions/admin/shipping'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין למשלוח',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

interface BulkResult {
  ok: boolean
  moved: number
  failures: { itemId: string; error: string }[]
  error?: string
}

export interface ShipmentLine {
  id: string
  productName: string
  itemStatus: string
  carrier: string | null
  trackingNumber: string | null
}

/**
 * Per-line fulfillment controls for the physical half of an order. The server
 * action re-derives every verdict; these buttons only offer what the machine
 * would accept anyway.
 */
export default function ShipmentClient({ lines }: { lines: ShipmentLine[] }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  if (lines.length === 0) return null

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setMessage(result.error)
      if (result.ok) router.refresh()
    })
  }

  /**
   * Bulk reports per line, not as a count. "3 מתוך 5 עודכנו" leaves the operator
   * guessing which two, and the two that refused are exactly the ones that need
   * a human.
   */
  function runBulk(fn: () => Promise<BulkResult>) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      const failures = result.failures
        .map((f) => {
          const line = lines.find((l) => l.id === f.itemId)
          return `${line?.productName ?? f.itemId}: ${f.error}`
        })
        .join(' | ')
      const summary = [result.moved > 0 ? `עודכנו ${result.moved} שורות.` : '', failures]
        .filter(Boolean)
        .join(' ')
      setMessage(result.error ?? (summary === '' ? null : summary))
      if (result.moved > 0) {
        setSelected([])
        router.refresh()
      }
    })
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectable = lines.filter((l) => l.itemStatus === 'pending' || l.itemStatus === 'shipped')
  const chosen = selected.filter((id) => selectable.some((l) => l.id === id))
  // The two verbs need different from-states, so a mixed selection can only
  // offer what the whole selection can actually do.
  const allPending =
    chosen.length > 0 &&
    chosen.every((id) => lines.some((l) => l.id === id && l.itemStatus === 'pending'))
  const allShipped =
    chosen.length > 0 &&
    chosen.every((id) => lines.some((l) => l.id === id && l.itemStatus === 'shipped'))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="font-semibold text-gray-800 mb-3">משלוח</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="מוביל (למשל: חבילה פלוס)"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="מספר מעקב"
          dir="ltr"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
      </div>
      {selectable.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <button
            type="button"
            onClick={() =>
              setSelected(chosen.length === selectable.length ? [] : selectable.map((l) => l.id))
            }
            className="text-sm font-medium text-gray-700 underline underline-offset-2"
          >
            {chosen.length === selectable.length ? 'ניקוי הבחירה' : 'בחירת הכל'}
          </button>
          <span className="text-xs text-gray-500">נבחרו {chosen.length}</span>
          <span className="ms-auto flex gap-2">
            <button
              type="button"
              disabled={isPending || !allPending}
              onClick={() => runBulk(() => bulkMarkItemsShipped(chosen, carrier, tracking))}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              סימון הנבחרים כנשלחו
            </button>
            <button
              type="button"
              disabled={isPending || !allShipped}
              onClick={() => runBulk(() => bulkMarkItemsDelivered(chosen))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
            >
              סימון הנבחרים כנמסרו
            </button>
          </span>
        </div>
      ) : null}
      <ul className="divide-y divide-gray-100">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-sm text-gray-800">
              {line.itemStatus === 'pending' || line.itemStatus === 'shipped' ? (
                <input
                  type="checkbox"
                  checked={selected.includes(line.id)}
                  onChange={() => toggle(line.id)}
                  aria-label={`בחירת ${line.productName}`}
                  className="size-4"
                />
              ) : null}
              {line.productName}
              <span className="ms-2 text-xs text-gray-500">
                {STATUS_HE[line.itemStatus] ?? line.itemStatus}
                {line.carrier ? ` · ${line.carrier}` : ''}
                {line.trackingNumber ? <span dir="ltr"> {line.trackingNumber}</span> : null}
              </span>
            </span>
            <span className="flex gap-2">
              {line.itemStatus === 'pending' ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => markItemShipped(line.id, carrier, tracking))}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  סמן כנשלח
                </button>
              ) : null}
              {line.itemStatus === 'shipped' ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => markItemDelivered(line.id))}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
                >
                  סמן כנמסר
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {message ? (
        <output aria-live="polite" className="mt-2 block text-sm text-price">
          {message}
        </output>
      ) : null}
    </div>
  )
}
