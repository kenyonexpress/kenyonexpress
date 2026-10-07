import type { TrackingEvent, TrackingStatus } from '@/lib/shipping/providers/types'

/**
 * What a tracking status means to the customer and to the order machine. Pure.
 *
 * The fulfilment machine (`transitions.ts`) knows two moves, ship and
 * deliver. Carrier feeds are richer, so this module folds every carrier
 * status into the one thing the machine cares about (has the parcel been
 * handed over yet) and the one thing the customer cares about (a sentence and
 * a step on a four-step timeline).
 */

export const TRACKING_LABELS_HE: Record<TrackingStatus, string> = {
  label_created: 'תווית נוצרה, ממתין לאיסוף',
  in_transit: 'בדרך אליך',
  out_for_delivery: 'יצא לחלוקה',
  delivered: 'נמסר',
  exception: 'עיכוב במשלוח',
  returned: 'הוחזר לשולח',
}

export type TimelineStep = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered'

export const TIMELINE_STEPS: readonly { step: TimelineStep; label: string }[] = [
  { step: 'ordered', label: 'ההזמנה התקבלה' },
  { step: 'shipped', label: 'נשלח' },
  { step: 'out_for_delivery', label: 'יצא לחלוקה' },
  { step: 'delivered', label: 'נמסר' },
]

/** How far along the four-step timeline a status sits (0..3). */
export function timelineIndex(status: TrackingStatus | null): number {
  switch (status) {
    case null:
    case 'label_created':
      return 1
    case 'in_transit':
    case 'exception':
    case 'returned':
      return 1
    case 'out_for_delivery':
      return 2
    case 'delivered':
      return 3
  }
}

/** Statuses the poller keeps asking about; the rest are final. */
export function isActiveTrackingStatus(status: TrackingStatus): boolean {
  return status !== 'delivered' && status !== 'returned'
}

/** The tone the account chip uses. */
export function trackingTone(status: TrackingStatus): 'ok' | 'warn' | 'default' | 'dead' {
  if (status === 'delivered') return 'ok'
  if (status === 'exception') return 'warn'
  if (status === 'returned') return 'dead'
  return 'default'
}

/**
 * Newest first, deduplicated on (at, status): carriers replay their whole
 * history on every poll and the UI should not show the same scan twice.
 */
export function mergeTrackingEvents(
  existing: readonly TrackingEvent[],
  incoming: readonly TrackingEvent[],
): TrackingEvent[] {
  const seen = new Set<string>()
  const out: TrackingEvent[] = []
  for (const event of [...incoming, ...existing]) {
    const key = `${event.at}|${event.status}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/**
 * Maps a carrier's free-text status onto ours. Shared by the HTTP adapters,
 * which each receive a different vocabulary and all land here. Unknown words
 * are `in_transit`: the parcel exists and is somewhere, which is the only
 * claim a word we do not know supports.
 */
export function normalizeCarrierStatus(raw: string | null | undefined): TrackingStatus {
  const value = (raw ?? '').toLowerCase()
  if (/deliver|נמסר|מסירה בוצעה|supplied/.test(value) && !/out|יצא|לחלוקה|failed|לא/.test(value)) {
    return 'delivered'
  }
  if (/out.?for|יצא לחלוקה|בחלוקה|with courier|אצל השליח/.test(value)) return 'out_for_delivery'
  if (/return|הוחזר|חזר לשולח/.test(value)) return 'returned'
  if (/exception|fail|נכשל|עיכוב|לא נמצא|refused|סירוב|damaged|ניזוק/.test(value))
    return 'exception'
  if (/created|label|נוצר|registered|נרשם|pending pickup|ממתין לאיסוף/.test(value)) {
    return 'label_created'
  }
  return 'in_transit'
}
