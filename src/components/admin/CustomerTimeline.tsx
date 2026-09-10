import {
  TIMELINE_KIND_LABELS,
  type TimelineEvent,
  type TimelineKind,
  timelineCounts,
} from '@/lib/admin/customer-timeline'
import { formatDateTime } from '@/lib/i18n/format'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import Link from 'next/link'

/**
 * The merged history, rendered as one column in time order.
 *
 * A SERVER COMPONENT WITH NO STATE. Filtering by kind would be the obvious next
 * feature and it is deliberately absent: the whole reason the five panels were
 * merged is that the answer support needs is the ORDER of things across kinds,
 * and a filter is a control whose only function is to take that back.
 */

const KIND_TONE: Record<TimelineKind, string> = {
  order: 'bg-sky-50 text-sky-900 border-sky-200',
  refund: 'bg-amber-50 text-amber-900 border-amber-200',
  voucher: 'bg-violet-50 text-violet-900 border-violet-200',
  wallet: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  notification: 'bg-slate-50 text-slate-800 border-slate-200',
  email: 'bg-slate-50 text-slate-800 border-slate-200',
}

/**
 * The row's timestamp, or an admission that it is not one.
 *
 * `buildCustomerTimeline` sinks an unparseable `at` to the bottom rather than
 * dropping the row, so this is reachable, and it must not render "Invalid Date"
 * next to a real event. `formatDateTime` returns '' for a bad value, which
 * would be worse here: a blank cell reads as "no date recorded".
 */
function stamp(iso: string): string {
  const formatted = formatDateTime(iso)
  return formatted || 'תאריך לא קריא'
}

/**
 * Money, with its sign kept.
 *
 * A wallet debit arrives here as a negative number and must READ as one.
 * `shekels` formats a magnitude, so the sign is put back by hand rather than
 * lost -- a ledger where crediting and spending both render as `₪5.00` is a
 * ledger that cannot be read.
 */
function money(amountAgorot: number): string {
  const sign = amountAgorot < 0 ? '-' : '+'
  return `${sign}${shekels(agorot(Math.abs(amountAgorot)))}`
}

export default function CustomerTimeline({
  events,
  partial,
}: {
  events: readonly TimelineEvent[]
  partial: readonly string[]
}) {
  const counts = timelineCounts(events)

  return (
    <section className="rounded-xl border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-800">ציר זמן של הלקוח</h2>
        <div className="flex flex-wrap gap-2 text-xs text-black/50">
          {(Object.keys(TIMELINE_KIND_LABELS) as TimelineKind[])
            .filter((kind) => counts[kind] > 0)
            .map((kind) => (
              <span key={kind} className="rounded-full bg-black/[0.04] px-2 py-0.5">
                {TIMELINE_KIND_LABELS[kind]} {counts[kind]}
              </span>
            ))}
        </div>
      </div>

      {/* A source that failed to read is named. "No refunds" and "the refunds
          table did not answer" are different sentences and support acts
          differently on each; collapsing them into an empty list is the one
          wrong answer that costs something. */}
      {partial.length > 0 && (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
          חלק מהמקורות לא נקראו ({partial.join(', ')}), ולכן הציר אינו מלא.
        </p>
      )}

      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-black/40">אין אירועים ללקוח הזה</p>
      ) : (
        <ol className="divide-y divide-black/5">
          {events.map((event) => (
            <li
              key={`${event.kind}:${event.id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm"
            >
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${KIND_TONE[event.kind]}`}
              >
                {TIMELINE_KIND_LABELS[event.kind]}
              </span>

              <span className="font-medium text-gray-900">
                {event.href ? (
                  <Link href={event.href} className="text-brand hover:underline">
                    {event.titleHe}
                  </Link>
                ) : (
                  event.titleHe
                )}
              </span>

              {event.statusHe && <span className="text-xs text-black/60">{event.statusHe}</span>}

              {typeof event.amountAgorot === 'number' && (
                <span
                  className={`text-xs font-semibold ${
                    event.amountAgorot < 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {money(event.amountAgorot)}
                </span>
              )}

              <span className="ms-auto text-xs text-black/40">{stamp(event.at)}</span>

              {event.detailHe && (
                <span className="w-full text-xs text-black/50">{event.detailHe}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
