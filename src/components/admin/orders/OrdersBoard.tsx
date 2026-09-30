'use client'

import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import { type Agorot, agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import {
  type BulkOutcome,
  cancelOrders,
  deliverOrders,
  shipOrders,
} from '@/server/actions/admin/fulfillment'
import {
  type BoardMove,
  FULFILLMENT_LANES,
  type FulfillmentLane,
  LANE_LABELS,
  moveForDrop,
  movesForLanes,
} from '@/server/domain/orders/fulfillment-lanes'
import type { BoardOrder } from '@/server/queries/fulfillment-board'
import { Download, Package, Truck, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type DragEvent, useMemo, useState, useTransition } from 'react'

/**
 * The fulfilment board (STEP 15): five lanes derived from the order status
 * and the physical lines, a checkbox on every card, and one toolbar for the
 * selection.
 *
 * THE BOARD IS A MENU, NOT A MACHINE. Every move is a server action that
 * re-derives its verdict from the database; a card dragged into a lane it
 * cannot legally reach snaps back with nothing sent. Drag-and-drop is a
 * shortcut for "select this card and press the lane's button": it opens the
 * same panel, because a ship needs a tracking number and a cancel needs a
 * reason, and a drop has neither.
 *
 * SELECTION IS THE UNIT. The toolbar's buttons follow the lanes of the
 * selected cards (movesForLanes), so an operator who ticked a paid order and
 * a delivered one sees "ship" and nothing that would refuse both. The
 * outcome the server returns is printed per order, skips with their reason,
 * because a bulk action that says "done" over a refused parcel is how a
 * customer waits for a parcel that never left.
 */

const LANE_TONE: Record<FulfillmentLane, string> = {
  new: 'border-amber-200 bg-amber-50/60',
  paid: 'border-sky-200 bg-sky-50/60',
  shipped: 'border-violet-200 bg-violet-50/60',
  delivered: 'border-emerald-200 bg-emerald-50/60',
  cancelled: 'border-gray-200 bg-gray-50',
}

const MOVE_LABELS: Record<BoardMove, string> = {
  ship: 'סימון כנשלח',
  deliver: 'סימון כנמסר',
  cancel: 'ביטול הזמנה',
}

type Panel = { move: BoardMove; orderIds: string[] } | null

interface Props {
  orders: BoardOrder[]
  /** The export URL for what the board shows; `ids=` is appended for a selection. */
  exportHref: string
}

function kindLabel(order: Pick<BoardOrder, 'couponLines' | 'physicalLines'>): string {
  if (order.couponLines > 0 && order.physicalLines > 0) return 'מעורב'
  if (order.couponLines > 0) return 'קופון'
  if (order.physicalLines > 0) return 'פיזי'
  return ''
}

function trackingOf(order: BoardOrder): string[] {
  return Array.from(
    new Set(
      order.lines.map((l) => l.tracking_number).filter((t): t is string => !!t && t.trim() !== ''),
    ),
  )
}

function withIds(href: string, ids: string[]): string {
  const url = new URL(href, 'http://local')
  url.searchParams.set('ids', ids.join(','))
  return `${url.pathname}${url.search}`
}

export default function OrdersBoard({ orders, exportHref }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [panel, setPanel] = useState<Panel>(null)
  const [outcome, setOutcome] = useState<(BulkOutcome & { move: BoardMove }) | null>(null)
  const [dragOver, setDragOver] = useState<FulfillmentLane | null>(null)
  const [pending, startTransition] = useTransition()

  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const lanes = useMemo(() => {
    const groups: Record<FulfillmentLane, BoardOrder[]> = {
      new: [],
      paid: [],
      shipped: [],
      delivered: [],
      cancelled: [],
    }
    for (const order of orders) groups[order.lane].push(order)
    return groups
  }, [orders])

  const selectedOrders = Array.from(selected)
    .map((id) => byId.get(id))
    .filter((o): o is BoardOrder => !!o)
  const moves = movesForLanes(selectedOrders.map((o) => o.lane))

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleLane(lane: FulfillmentLane, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const order of lanes[lane]) {
        if (on) next.add(order.id)
        else next.delete(order.id)
      }
      return next
    })
  }

  function openPanel(move: BoardMove, orderIds: string[]) {
    setOutcome(null)
    setPanel({ move, orderIds })
  }

  function run(move: BoardMove, fn: () => Promise<BulkOutcome>) {
    startTransition(async () => {
      const result = await fn()
      setOutcome({ ...result, move })
      if (result.done.length > 0) {
        setSelected((prev) => {
          const next = new Set(prev)
          for (const id of result.done) next.delete(id)
          return next
        })
        setPanel(null)
        router.refresh()
      }
    })
  }

  // --- drag and drop: a shortcut into the same panels ---------------------

  function onDragStart(event: DragEvent<HTMLElement>, order: BoardOrder) {
    event.dataTransfer.setData('text/plain', order.id)
    event.dataTransfer.effectAllowed = 'move'
  }

  function onDrop(event: DragEvent<HTMLElement>, lane: FulfillmentLane) {
    event.preventDefault()
    setDragOver(null)
    const id = event.dataTransfer.getData('text/plain')
    const order = byId.get(id)
    if (!order) return
    const move = moveForDrop(order.lane, lane)
    if (!move) return
    setSelected((prev) => new Set(prev).add(id))
    openPanel(move, [id])
  }

  return (
    <div className="space-y-4">
      <Toolbar
        count={selectedOrders.length}
        moves={moves}
        pending={pending}
        exportAllHref={exportHref}
        exportSelectionHref={
          selectedOrders.length > 0
            ? withIds(
                exportHref,
                selectedOrders.map((o) => o.id),
              )
            : null
        }
        onMove={(move) =>
          openPanel(
            move,
            selectedOrders.map((o) => o.id),
          )
        }
        onClear={() => {
          setSelected(new Set())
          setOutcome(null)
        }}
      />

      {panel ? (
        <MovePanel
          panel={panel}
          orders={panel.orderIds.map((id) => byId.get(id)).filter((o): o is BoardOrder => !!o)}
          pending={pending}
          onClose={() => setPanel(null)}
          onShip={(entries) => run('ship', () => shipOrders(entries))}
          onDeliver={(ids) => run('deliver', () => deliverOrders(ids))}
          onCancel={(ids, reason) => run('cancel', () => cancelOrders(ids, reason))}
        />
      ) : null}

      {outcome ? <Outcome outcome={outcome} byId={byId} /> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {FULFILLMENT_LANES.map((lane) => {
          const cards = lanes[lane]
          const allChecked = cards.length > 0 && cards.every((o) => selected.has(o.id))
          return (
            <section
              key={lane}
              aria-label={LANE_LABELS[lane]}
              data-lane={lane}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragOver !== lane) setDragOver(lane)
              }}
              onDragLeave={() => setDragOver((cur) => (cur === lane ? null : cur))}
              onDrop={(e) => onDrop(e, lane)}
              className={`flex min-h-[12rem] flex-col rounded-xl border ${LANE_TONE[lane]} ${
                dragOver === lane ? 'ring-2 ring-brand' : ''
              }`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    disabled={cards.length === 0}
                    onChange={(e) => toggleLane(lane, e.target.checked)}
                    aria-label={`בחירת כל ההזמנות בשלב ${LANE_LABELS[lane]}`}
                    className="size-4 accent-brand-primary"
                  />
                  {LANE_LABELS[lane]}
                </label>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-black/60">
                  {cards.length}
                </span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 p-2">
                {cards.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-black/40">אין הזמנות</li>
                ) : null}
                {cards.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    checked={selected.has(order.id)}
                    onCheck={(on) => toggle(order.id, on)}
                    onDragStart={(e) => onDragStart(e, order)}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function OrderCard({
  order,
  checked,
  onCheck,
  onDragStart,
}: {
  order: BoardOrder
  checked: boolean
  onCheck: (on: boolean) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
}) {
  const badge = orderStatusBadge(order.status)
  const tracking = trackingOf(order)
  const draggable = order.lane === 'new' || order.lane === 'paid' || order.lane === 'shipped'
  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart}
      data-order-id={order.id}
      className={`rounded-lg border bg-white p-3 text-sm shadow-sm ${
        checked ? 'border-brand ring-1 ring-brand' : 'border-black/10'
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheck(e.target.checked)}
            aria-label={`בחירת הזמנה ${order.ref}`}
            className="size-4 accent-brand-primary"
          />
          <Link
            href={`/admin/orders/${order.id}`}
            className="font-mono text-xs text-brand hover:underline"
            dir="ltr"
          >
            {order.ref}
          </Link>
        </label>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>
      <p className="mt-2 truncate font-medium text-gray-900">{order.customer || 'ללא שם'}</p>
      <p className="mt-1 flex items-center justify-between text-xs text-black/60">
        <span>{shekels(agorot(order.total_agorot) as Agorot)}</span>
        <span>{kindLabel(order)}</span>
        <span>{new Date(order.created_at).toLocaleDateString('he-IL')}</span>
      </p>
      {order.city ? <p className="mt-1 text-xs text-black/50">{order.city}</p> : null}
      {tracking.length > 0 ? (
        <p className="mt-2 flex flex-wrap gap-1">
          {tracking.map((t) => (
            <span
              key={t}
              dir="ltr"
              className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700"
            >
              {t}
            </span>
          ))}
        </p>
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------------------

function Toolbar({
  count,
  moves,
  pending,
  exportAllHref,
  exportSelectionHref,
  onMove,
  onClear,
}: {
  count: number
  moves: BoardMove[]
  pending: boolean
  exportAllHref: string
  exportSelectionHref: string | null
  onMove: (move: BoardMove) => void
  onClear: () => void
}) {
  const btn =
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50'
  return (
    <div
      role="toolbar"
      aria-label="פעולות על ההזמנות שנבחרו"
      className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 shadow-sm"
    >
      <span className="text-sm text-gray-700">
        {count === 0 ? 'לא נבחרו הזמנות' : `נבחרו ${count} הזמנות`}
      </span>
      {moves.includes('ship') ? (
        <button
          type="button"
          disabled={pending || count === 0}
          onClick={() => onMove('ship')}
          className={`${btn} bg-violet-100 text-violet-900 hover:bg-violet-200`}
        >
          <Truck size={15} aria-hidden />
          {MOVE_LABELS.ship}
        </button>
      ) : null}
      {moves.includes('deliver') ? (
        <button
          type="button"
          disabled={pending || count === 0}
          onClick={() => onMove('deliver')}
          className={`${btn} bg-emerald-100 text-emerald-900 hover:bg-emerald-200`}
        >
          <Package size={15} aria-hidden />
          {MOVE_LABELS.deliver}
        </button>
      ) : null}
      {moves.includes('cancel') ? (
        <button
          type="button"
          disabled={pending || count === 0}
          onClick={() => onMove('cancel')}
          className={`${btn} bg-red-100 text-red-800 hover:bg-red-200`}
        >
          <X size={15} aria-hidden />
          {MOVE_LABELS.cancel}
        </button>
      ) : null}
      <span className="ms-auto flex items-center gap-2">
        {exportSelectionHref ? (
          <a
            href={exportSelectionHref}
            className={`${btn} border border-gray-300 text-gray-800 hover:bg-gray-50`}
          >
            <Download size={15} aria-hidden />
            ייצוא הנבחרות ל-CSV
          </a>
        ) : null}
        <a
          href={exportAllHref}
          className={`${btn} border border-gray-300 text-gray-800 hover:bg-gray-50`}
        >
          <Download size={15} aria-hidden />
          ייצוא הלוח ל-CSV
        </a>
        {count > 0 ? (
          <button type="button" onClick={onClear} className="text-sm text-gray-500 hover:underline">
            ניקוי בחירה
          </button>
        ) : null}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MovePanel({
  panel,
  orders,
  pending,
  onClose,
  onShip,
  onDeliver,
  onCancel,
}: {
  panel: NonNullable<Panel>
  orders: BoardOrder[]
  pending: boolean
  onClose: () => void
  onShip: (entries: { orderId: string; carrier?: string; trackingNumber?: string }[]) => void
  onDeliver: (ids: string[]) => void
  onCancel: (ids: string[], reason: string) => void
}) {
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const ids = orders.map((o) => o.id)

  return (
    <section
      aria-label={MOVE_LABELS[panel.move]}
      className="space-y-3 rounded-xl border border-black/10 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">
          {MOVE_LABELS[panel.move]} · {orders.length} הזמנות
        </h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:underline">
          סגירה
        </button>
      </div>

      {panel.move === 'ship' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onShip(
              ids.map((orderId) => ({
                orderId,
                carrier: carrier || undefined,
                trackingNumber: tracking[orderId] || undefined,
              })),
            )
          }}
        >
          <p className="text-xs text-gray-500">
            כל שורת מוצר פיזי שממתינה תסומן כנשלחה. הלקוח יקבל הודעה במייל ובוואטסאפ עם מספר המעקב,
            אם הסכים לקבל עדכונים.
          </p>
          <label className="block text-xs font-medium text-gray-700">
            מוביל (משותף לכל ההזמנות)
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="למשל: חבילה פלוס"
              maxLength={120}
              className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <ul className="divide-y divide-gray-100">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-28 font-mono text-xs text-gray-700" dir="ltr">
                  {order.ref}
                </span>
                <span className="min-w-[8rem] flex-1 truncate text-sm">{order.customer}</span>
                <input
                  value={tracking[order.id] ?? ''}
                  onChange={(e) => setTracking((prev) => ({ ...prev, [order.id]: e.target.value }))}
                  placeholder="מספר מעקב"
                  aria-label={`מספר מעקב להזמנה ${order.ref}`}
                  dir="ltr"
                  maxLength={120}
                  className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? 'שולח...' : `סימון ${orders.length} הזמנות כנשלחו`}
          </button>
        </form>
      ) : null}

      {panel.move === 'deliver' ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            כל שורה שנשלחה תסומן כנמסרה. הזמנה שכל פריטיה נמסרו תעבור לסטטוס "סופקה" והלקוח יקבל
            עדכון בוואטסאפ, אם הסכים.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDeliver(ids)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? 'מעדכן...' : `סימון ${orders.length} הזמנות כנמסרו`}
          </button>
        </div>
      ) : null}

      {panel.move === 'cancel' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onCancel(ids, reason)
          }}
        >
          <p className="text-xs text-gray-500">
            רק הזמנות שממתינות לתשלום מבוטלות כאן. המלאי וההנחה משוחררים מיד. הזמנה ששולמה מזוכה דרך
            מסלול ההחזרים.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            placeholder="סיבת הביטול (חובה)"
            aria-label="סיבת הביטול"
            className="block w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending || reason.trim().length < 3}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? 'מבטל...' : `ביטול ${orders.length} הזמנות`}
          </button>
        </form>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------

function Outcome({
  outcome,
  byId,
}: {
  outcome: BulkOutcome & { move: BoardMove }
  byId: Map<string, BoardOrder>
}) {
  const ref = (id: string) => byId.get(id)?.ref ?? id.slice(0, 8).toUpperCase()
  return (
    <output
      aria-live="polite"
      className="block space-y-1 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm"
    >
      {outcome.error ? <p className="text-red-700">{outcome.error}</p> : null}
      {outcome.done.length > 0 ? (
        <p className="text-emerald-800">
          {MOVE_LABELS[outcome.move]}: בוצע על {outcome.done.length} הזמנות
          {outcome.move === 'ship' && typeof outcome.notified === 'number'
            ? `, נשלחו הודעות ל-${outcome.notified} לקוחות`
            : ''}
          .
        </p>
      ) : null}
      {outcome.skipped.length > 0 ? (
        <ul className="space-y-0.5 text-amber-900">
          {outcome.skipped.map((skip) => (
            <li key={skip.orderId}>
              <span className="font-mono text-xs" dir="ltr">
                {ref(skip.orderId)}
              </span>
              : {skip.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </output>
  )
}
