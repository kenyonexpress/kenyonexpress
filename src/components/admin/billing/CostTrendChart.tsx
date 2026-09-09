'use client'

import type { TrendPoint } from '@/lib/costs/model'
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
 * Twelve months of infrastructure spend: stacked bars for fixed and variable,
 * a line for what one order cost.
 *
 * RTL IS NOT A STYLESHEET HERE, and the reason is the one `SalesChart` gives:
 * an SVG has no writing direction, so `dir="rtl"` on an ancestor leaves the
 * category axis running left to right and the value axis on the left. For a
 * Hebrew reader that puts the oldest month where the newest belongs and reads
 * as a chart running backwards. `reversed` and `orientation="right"` are the
 * only reason those two props are here.
 *
 * FIXED AND VARIABLE ARE STACKED RATHER THAN PLOTTED SIDE BY SIDE. The question
 * this chart answers is "is the bill growing", and the answer is the height of
 * the whole column; two adjacent bars make the reader add them by eye. Which
 * half is growing is the second question, and the split within the column
 * answers it without competing with the first.
 *
 * THE PER-ORDER LINE BREAKS WHERE THERE WERE NO ORDERS. `perOrderMicro` is null
 * for such a month rather than zero, and `connectNulls` is deliberately off: a
 * line joined across the gap would draw a smooth descent through a month in
 * which the bill was paid and nothing was sold, which is the opposite of what
 * happened.
 *
 * Money arrives in micro units and is converted here for display only. Nothing
 * is computed from these numbers; the cards above the chart carry the figures
 * that matter, and this is the summary.
 */

function toUnits(micro: number): number {
  return Math.round(micro / 10_000) / 100
}

export default function CostTrendChart({
  points,
  currency,
}: {
  points: TrendPoint[]
  currency: string
}) {
  const data = points.map((point) => ({
    label: point.label,
    fixed: toUnits(point.fixedMicro),
    variable: toUnits(point.variableMicro),
    perOrder: point.perOrderMicro === null ? null : toUnits(point.perOrderMicro),
    orders: point.orders,
  }))

  // Ticks are scanned rather than read, so they carry no decimals: the exact
  // figure is one hover away and four of them stacked up the axis is noise.
  const axisMoney = (value: number) => `${currency === 'USD' ? '$' : ''}${Math.round(value)}`
  const tipMoney = (value: number) =>
    `${currency === 'USD' ? '$' : ''}${value.toFixed(2)}${currency === 'USD' ? '' : ` ${currency}`}`

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-rule)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            reversed
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            stroke="var(--color-rule)"
          />
          <YAxis
            yAxisId="spend"
            orientation="right"
            tickFormatter={axisMoney}
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            stroke="var(--color-rule)"
          />
          <YAxis
            yAxisId="perOrder"
            orientation="left"
            tickFormatter={axisMoney}
            tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
            stroke="var(--color-rule)"
          />
          <Tooltip
            // recharts types a payload value as possibly undefined and possibly
            // an array; Number(undefined) is NaN, which renders "$NaN" rather
            // than nothing, so it is handled rather than cast away. Same reason
            // SalesChart does it.
            formatter={(value) => {
              const numeric = Number(Array.isArray(value) ? value[0] : value)
              return Number.isFinite(numeric) ? tipMoney(numeric) : '—'
            }}
            labelFormatter={(label) => `חודש ${String(label)}`}
            contentStyle={{
              direction: 'rtl',
              fontSize: 12,
              borderColor: 'var(--color-border)',
              borderRadius: 8,
            }}
          />
          <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
          <Bar
            yAxisId="spend"
            dataKey="fixed"
            stackId="spend"
            name="קבוע"
            fill="var(--color-heading)"
            maxBarSize={28}
          />
          <Bar
            yAxisId="spend"
            dataKey="variable"
            stackId="spend"
            name="משתנה"
            fill="var(--color-brand-primary)"
            maxBarSize={28}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="perOrder"
            type="monotone"
            dataKey="perOrder"
            name="עלות להזמנה"
            stroke="var(--color-price)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
