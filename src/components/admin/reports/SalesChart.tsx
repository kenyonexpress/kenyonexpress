'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Sales over time: bars for what customers paid, a line for the platform's cut.
 *
 * RTL IS NOT A STYLESHEET HERE. An SVG chart has no writing direction, so
 * `dir="rtl"` on an ancestor does nothing to it: the category axis still runs
 * left to right and the value axis still sits on the left, which for a Hebrew
 * reader puts the oldest day where the newest belongs and reads as a chart
 * running backwards. Both are turned round explicitly — `reversed` on the
 * category axis, `orientation="right"` on the value axis — and that is the only
 * reason those two props exist on this component.
 *
 * Colours come through CSS custom properties rather than literals. SVG `fill`
 * and `stroke` accept `var()`, so the chart is on the same palette as everything
 * else and a rebrand does not have to know this file exists.
 *
 * TWO MEASURES, TWO ENCODINGS. Gross and commission differ by roughly the
 * platform percent, so plotted as two bar series the smaller one is a stub next
 * to the larger at every point. The line reads at that ratio; a second bar does
 * not.
 *
 * The table underneath the chart on the page carries the same numbers as text.
 * The chart is the summary, never the record — which is also why it takes
 * shekels: the agorot integers are what the table and the CSV are built from,
 * and nothing is computed from these.
 */

export type SalesPoint = {
  /** Bucket key, `2026-08-06` or `2026-08`. Unique, used as the React key. */
  key: string
  /** Axis label, already formatted for a Hebrew reader. */
  label: string
  grossIls: number
  commissionIls: number
}

const shekels = (value: number) =>
  `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Axis ticks are scanned, not read: ₪1,250.00 at every gridline is noise. */
const shortShekels = (value: number) => `₪${Math.round(value).toLocaleString('he-IL')}`

export default function SalesChart({ points }: { points: SalesPoint[] }) {
  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-black/50">אין נתונים בטווח הזה.</p>
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-rule)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            reversed
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            stroke="var(--color-rule)"
            // Ticks are thinned by recharts rather than rotated: a 366-day range
            // rotated to 45 degrees is unreadable either way, and the table
            // below is where an exact date is looked up.
            minTickGap={16}
          />
          <YAxis
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            stroke="var(--color-rule)"
            tickFormatter={shortShekels}
            width={64}
          />
          <Tooltip
            // recharts types the payload value as possibly undefined and
            // possibly an array; Number(undefined) is NaN, which would render
            // "₪NaN" rather than nothing, so it is handled rather than cast away.
            formatter={(value) => {
              const numeric = Number(Array.isArray(value) ? value[0] : value)
              return Number.isFinite(numeric) ? shekels(numeric) : '—'
            }}
            contentStyle={{
              direction: 'rtl',
              fontSize: 12,
              borderColor: 'var(--color-border)',
              borderRadius: 8,
            }}
          />
          <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
          <Bar
            dataKey="grossIls"
            name="נגבה באתר"
            fill="var(--color-heading)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            dataKey="commissionIls"
            name="עמלת פלטפורמה"
            type="monotone"
            stroke="var(--color-price)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
