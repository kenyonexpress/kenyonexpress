'use client'

import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import {
  CARRIER_IDS,
  CARRIER_REGISTRY,
  type CarrierId,
  isCarrierId,
} from '@/lib/shipping/carrier-registry'
import { createShipmentLabel, refreshShipmentTracking } from '@/server/actions/admin/shipments'
import { markItemDelivered, markItemShipped } from '@/server/actions/admin/shipping'
import type { AdminShipmentView } from '@/server/shipping/read'
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
 * Per-line fulfillment controls for the physical half of an order, plus the
 * carrier label path (STEP 43): pick a carrier and service, press once, and
 * every pending physical line ships with the carrier's tracking number. The
 * manual buttons stay for a parcel handed to a courier the registry does not
 * know. The server action re-derives every verdict; these controls only
 * offer what the machine would accept anyway.
 */
export default function ShipmentClient({
  orderId,
  lines,
  shipments = [],
  shipmentsAvailable = true,
  preferredCarrier = null,
  preferredService = null,
}: {
  orderId: string
  lines: ShipmentLine[]
  shipments?: AdminShipmentView[]
  /** False while 258 is not applied: labels still print, history is not kept. */
  shipmentsAvailable?: boolean
  /** The shopper's checkout pick, when the order carries one. */
  preferredCarrier?: string | null
  preferredService?: string | null
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const initialCarrier: CarrierId = isCarrierId(preferredCarrier) ? preferredCarrier : 'israel_post'
  const [apiCarrier, setApiCarrier] = useState<CarrierId>(initialCarrier)
  const [service, setService] = useState<string>(
    preferredService ?? CARRIER_REGISTRY[initialCarrier].services[0]?.code ?? '',
  )

  if (lines.length === 0) return null

  const pendingCount = lines.filter((l) => l.itemStatus === 'pending').length

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setMessage(result.error)
      if (result.ok) router.refresh()
    })
  }

  function createLabel() {
    setMessage(null)
    startTransition(async () => {
      const result = await createShipmentLabel(orderId, apiCarrier, service)
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      // Joined, not concatenated: a `+` between template literals has lost
      // text in the production build here before.
      setMessage(
        [
          `נוצרה תווית ${result.trackingNumber} (${result.linesShipped} שורות)`,
          result.notified ? ', הלקוח עודכן' : '',
          result.stored ? '' : '. היסטוריית המעקב תישמר אחרי מיגרציה 258.',
        ].join(''),
      )
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="font-semibold text-gray-800 mb-3">משלוח</h2>

      {pendingCount > 0 ? (
        <form
          className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3"
          aria-label="יצירת תווית משלוח"
          onSubmit={(e) => {
            e.preventDefault()
            createLabel()
          }}
        >
          <p className="mb-2 text-xs text-gray-600">
            תווית דרך חברת משלוחים: כל {pendingCount} השורות הממתינות יסומנו כנשלחו עם מספר המעקב של
            החברה, והלקוח יקבל הודעה.
            {preferredCarrier ? ' הלקוח ביקש בקופה את החברה המסומנת.' : ''}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-gray-700">
              חברת משלוחים
              <select
                value={apiCarrier}
                onChange={(e) => {
                  const next = e.target.value as CarrierId
                  setApiCarrier(next)
                  setService(CARRIER_REGISTRY[next].services[0]?.code ?? '')
                }}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              >
                {CARRIER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CARRIER_REGISTRY[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-700">
              שירות
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              >
                {CARRIER_REGISTRY[apiCarrier].services.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label} ({s.minDays}-{s.maxDays} ימי עסקים)
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? 'יוצר...' : 'צור תווית ושלח'}
            </button>
          </div>
        </form>
      ) : null}

      {shipments.length > 0 ? (
        <ul className="mb-4 divide-y divide-gray-100" aria-label="תוויות שנוצרו">
          {shipments.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>
                {s.carrierLabel} · {s.serviceLabel}
                <span className="mr-2 text-xs text-gray-500">
                  {s.statusLabel}
                  {s.providerKind === 'mock' ? ' · דמה' : ''}
                  {s.carrierCostAgorot !== null
                    ? ` · עלות ${shekels(agorot(s.carrierCostAgorot))}`
                    : ''}
                </span>
                <span dir="ltr" className="mr-2 font-mono text-xs text-gray-700">
                  {s.trackingNumber}
                </span>
              </span>
              <span className="flex gap-2">
                <a
                  href={`/api/admin/shipments/${s.id}/label`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800"
                >
                  תווית PDF
                </a>
                {s.status !== 'delivered' && s.status !== 'returned' && s.status !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => refreshShipmentTracking(s.id))}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
                  >
                    רענון מעקב
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {!shipmentsAvailable ? (
        <p className="mb-3 text-xs text-gray-500">
          היסטוריית המעקב תישמר אחרי החלת מיגרציה 258; עד אז מספר המעקב נשמר על השורות.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="מוביל (למשל: חבילה פלוס)"
          list="shipment-carrier-options"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <datalist id="shipment-carrier-options">
          {CARRIER_IDS.map((id) => (
            <option key={id} value={CARRIER_REGISTRY[id].legacyCarrierText} />
          ))}
        </datalist>
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
