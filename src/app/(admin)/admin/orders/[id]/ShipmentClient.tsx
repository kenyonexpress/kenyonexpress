'use client'

import { markItemDelivered, markItemShipped } from '@/server/actions/admin/shipping'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין למשלוח',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
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

  if (lines.length === 0) return null

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setMessage(result.error)
      if (result.ok) router.refresh()
    })
  }

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
      <ul className="divide-y divide-gray-100">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm text-gray-800">
              {line.productName}
              <span className="mr-2 text-xs text-gray-500">
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
