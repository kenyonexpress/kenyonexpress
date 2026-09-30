import { ORDER_STATUS_LABELS } from '@/lib/admin/labels'
import type { CsvColumn } from '@/lib/reports/csv'
import type { BoardOrder } from '@/server/queries/fulfillment-board'
import { LANE_LABELS } from './fulfillment-lanes'

/**
 * The columns of the fulfilment board's CSV. Pure: rows in, strings out.
 *
 * Money is integer agorot until the last character. The decimal is printed
 * with integer division and a two-digit remainder, never `/ 100` into a
 * float, so `123456` is `1234.56` and stays that on every platform the file
 * is opened on. A plain number and not `shekelsPlain`: the CSV cell should
 * sum in a spreadsheet, which a ₪ sign and a non-breaking space defeat.
 */
export function agorotToDecimal(agorot: number): string {
  const sign = agorot < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(agorot))
  const whole = Math.trunc(abs / 100)
  const rest = abs - whole * 100
  return `${sign}${whole}.${String(rest).padStart(2, '0')}`
}

function statusLabel(status: string): string {
  return (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? status
}

function kindLabel(order: Pick<BoardOrder, 'couponLines' | 'physicalLines'>): string {
  if (order.couponLines > 0 && order.physicalLines > 0) return 'מעורב'
  if (order.couponLines > 0) return 'קופון'
  if (order.physicalLines > 0) return 'פיזי'
  return ''
}

/** Distinct, in line order, blanks dropped: one cell, `;`-joined. */
function distinct(values: (string | null | undefined)[]): string {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ''))).join('; ')
}

function isoDate(iso: string): string {
  // The date part of the ISO stamp, which sorts in a spreadsheet; the
  // Hebrew-locale rendering the screen uses does not.
  return iso.slice(0, 10)
}

export const orderCsvColumns: readonly CsvColumn<BoardOrder>[] = [
  { header: 'מספר הזמנה', value: (o) => o.ref },
  { header: 'מזהה', value: (o) => o.id },
  { header: 'תאריך', value: (o) => isoDate(o.created_at) },
  { header: 'לקוח', value: (o) => o.customer },
  { header: 'אימייל', value: (o) => o.email },
  { header: 'טלפון', value: (o) => o.phone },
  { header: 'עיר', value: (o) => o.city },
  { header: 'שלב', value: (o) => LANE_LABELS[o.lane] },
  { header: 'סטטוס', value: (o) => statusLabel(o.status) },
  { header: 'סוג', value: (o) => kindLabel(o) },
  { header: 'פריטים', value: (o) => o.lines.length },
  { header: 'סכום (₪)', value: (o) => agorotToDecimal(o.total_agorot) },
  { header: 'מוביל', value: (o) => distinct(o.lines.map((l) => l.carrier)) },
  { header: 'מספרי מעקב', value: (o) => distinct(o.lines.map((l) => l.tracking_number)) },
]

export function ordersCsvFilename(today: string, lane?: string): string {
  return lane ? `הזמנות-${lane}-${today}.csv` : `הזמנות-${today}.csv`
}
