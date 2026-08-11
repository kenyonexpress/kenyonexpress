import type { CsvColumn } from '@/lib/reports/csv'
import type { PeriodTotals, ReportGranularity, SupplierObligation } from './settlement-report'

/**
 * What the two CSV exports contain, decided here and nowhere else.
 *
 * Pure, and separate from the screen on purpose: an export is read months later
 * by somebody reconciling a bank statement, with no page around it to explain
 * what a column meant. The headings therefore say the whole thing in Hebrew
 * rather than abbreviating to fit a table cell.
 */

const AGOROT_PER_ILS = 100

/**
 * Agorot as a plain decimal, e.g. `-1250.50`.
 *
 * NOT `formatIls`: that produces `₪1,250.50`, and both the currency symbol and
 * the thousands separator make Excel store the cell as TEXT. A column of text
 * does not sum, which is the first thing anybody does to an exported money
 * column.
 *
 * Built by string arithmetic rather than `value / 100`, for the reason the whole
 * money path is integers: division introduces a binary fraction, and `.toFixed`
 * then rounds it back. It agrees for every value we can hold, but the rule here
 * is that money never passes through a float, and an export is not the place to
 * make the one exception.
 */
export function agorotToCsvNumber(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const absolute = Math.abs(rounded)
  const whole = Math.floor(absolute / AGOROT_PER_ILS)
  const fraction = absolute % AGOROT_PER_ILS
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`
}

export function salesColumns(granularity: ReportGranularity): CsvColumn<PeriodTotals>[] {
  return [
    { header: granularity === 'month' ? 'חודש' : 'תאריך', value: (row) => row.period },
    { header: 'מכירות (₪)', value: (row) => agorotToCsvNumber(row.grossAgorot) },
    { header: 'עמלת פלטפורמה (₪)', value: (row) => agorotToCsvNumber(row.commissionAgorot) },
    { header: 'חלק הספקים (₪)', value: (row) => agorotToCsvNumber(row.supplierDueAgorot) },
    // Its own column, never netted off the one above it. See the note on
    // `aggregate`: a day with one sale and one refund must not read as a day
    // with no activity.
    { header: 'הוחזר ללקוחות (₪)', value: (row) => agorotToCsvNumber(row.refundedAgorot) },
    { header: 'הנחות במימון הפלטפורמה (₪)', value: (row) => agorotToCsvNumber(row.discountAgorot) },
    { header: 'הזמנות', value: (row) => row.orders },
  ]
}

export const supplierColumns: CsvColumn<SupplierObligation>[] = [
  // The name can be null when a supplier row was removed after the event was
  // journalled; the id is what makes the line identifiable either way, so it is
  // exported next to it rather than instead of it.
  { header: 'ספק', value: (row) => row.supplierName ?? 'ללא שם' },
  { header: 'מזהה ספק', value: (row) => row.supplierId },
  { header: 'נצבר לספק (₪)', value: (row) => agorotToCsvNumber(row.earnedAgorot) },
  { header: 'קוזז בהחזרים (₪)', value: (row) => agorotToCsvNumber(row.debitedAgorot) },
  { header: 'כבר שולם (₪)', value: (row) => agorotToCsvNumber(row.settledAgorot) },
  // Deliberately called an open obligation and not a balance in trust: there is
  // no Escrow here and no J5 (decision C3). May be negative, and a negative one
  // means the supplier owes the platform money.
  { header: 'התחייבות פתוחה (₪)', value: (row) => agorotToCsvNumber(row.openAgorot) },
]

/**
 * The filename, in Hebrew, carrying the range.
 *
 * The range is in the name because these accumulate in a downloads folder, and
 * two exports of the same report over different months are otherwise
 * `report.csv` and `report (1).csv`.
 */
export function reportFilename(report: 'sales' | 'suppliers', from: string, to: string): string {
  const label = report === 'sales' ? 'מכירות' : 'התחייבויות-לספקים'
  return `דוח-${label}-${from}-עד-${to}.csv`
}
