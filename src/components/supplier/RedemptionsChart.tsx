import { formatIls } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { agorot } from '@/lib/money'
import type { MonthlyRedemptionBucket } from '@/lib/supplier/dashboard'

/**
 * Twelve months of coupon scans, as bars.
 *
 * NO CHART LIBRARY, AND NOT BY OVERSIGHT. The admin panel draws its charts with
 * recharts (`CostTrendChart`, `SalesChart`) and that is right there: an admin is
 * at a desk, the panel already ships the bundle, and those charts have axes,
 * tooltips and two series. This one is twelve numbers on a phone that is
 * propped next to a till, on shop wifi. recharts is a client bundle and a
 * hydration boundary, and the entire supplier console is otherwise server-
 * rendered. Twelve `<div>`s with a height are the same information at no
 * bundle cost and no JavaScript, so a chart cannot be the reason the till page
 * is slow to become interactive.
 *
 * THE BARS ARE HIDDEN FROM ASSISTIVE TECHNOLOGY AND THE TABLE IS NOT. A
 * proportional height is not information a screen reader can convey, and
 * `aria-label="4 מימושים"` on each column produces twelve announcements a
 * listener has to hold in their head to compare. The same numbers are below as
 * a real `<table>` with a caption, visually hidden: the sighted reader gets the
 * shape, the screen-reader user gets the figures in a structure built for
 * comparing rows. WCAG 1.1.1, and the same split `PrintDaySummary` makes.
 *
 * DIRECTION IS THE PARENT'S. Unlike the SVG charts in the admin panel -- where
 * `reversed` and `orientation="right"` are needed because an SVG has no writing
 * direction -- these are flow elements inside the portal's `dir="rtl"` frame,
 * so the first month in the DOM lands on the RIGHT and time runs right to left
 * on its own. Nothing here reverses anything, and nothing should: adding a
 * `flex-row-reverse` would run the axis backwards.
 */

/** Bar column height. Tailwind needs whole classes, so the scale is inline. */
const TRACK_PX = 96

export default function RedemptionsChart({
  buckets,
  title = 'מימושים לפי חודש',
}: {
  buckets: readonly MonthlyRedemptionBucket[]
  title?: string
}) {
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0)
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-heading">{title}</h2>
        <p className="text-xs text-gray-500">{buckets.length} חודשים אחרונים</p>
      </div>

      {total === 0 ? (
        /* An all-zero chart is twelve empty tracks and a baseline, which reads
           as a rendering failure rather than as "no scans yet". */
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          אין מימושים בתקופה הזו.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto" aria-hidden="true">
          <div className="flex min-w-max items-end gap-2">
            {buckets.map((bucket) => {
              // The floor is what makes a month with scans distinguishable from
              // a month with none: a bar rounded to 0px next to an empty track
              // says "nothing happened", and something did.
              const height =
                bucket.count === 0 ? 0 : Math.max(4, Math.round((bucket.count / peak) * TRACK_PX))
              return (
                <div key={bucket.month} className="flex w-12 shrink-0 flex-col items-center gap-1">
                  <span className="text-xs font-bold text-heading" dir="ltr">
                    {bucket.count || ''}
                  </span>
                  <div
                    className="flex w-full items-end rounded-md bg-gray-100"
                    style={{ height: `${TRACK_PX}px` }}
                  >
                    <div
                      className="w-full rounded-md bg-heading"
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <span className="text-center text-xs leading-tight text-gray-500">
                    {bucket.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{t('supplier.chartMonth')}</th>
            <th scope="col">{t('supplier.chartRedemptions')}</th>
            <th scope="col">{t('supplier.chartTillCollected')}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.month}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.count}</td>
              <td>{formatIls(agorot(bucket.tillCollectedAgorot))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
