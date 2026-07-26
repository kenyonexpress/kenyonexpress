// Single-series column chart, server-rendered, no chart library.
//
// One measure, one hue: with a single series there is nothing to tell apart, so
// there is no legend and no categorical palette to validate. Identity comes
// from the title and the axis labels, values from the table underneath, which
// is always present rather than hidden behind a toggle.

export type BarPoint = {
  key: string
  /** Axis label, already formatted for display. */
  label: string
  value: number
  /** Optional second measure, shown in the table only. */
  secondary?: number
}

export default function BarSeries({
  title,
  caption,
  points,
  valueLabel,
  secondaryLabel,
  formatValue,
  formatSecondary,
}: {
  title: string
  caption?: string
  points: BarPoint[]
  valueLabel: string
  secondaryLabel?: string
  formatValue: (value: number) => string
  formatSecondary?: (value: number) => string
}) {
  const max = points.reduce((acc, point) => Math.max(acc, point.value), 0)

  if (points.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">{title}</h2>
        <p className="mt-3 text-sm text-black/50">אין נתונים בטווח הזה.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-bold text-heading">{title}</h2>
      {caption && <p className="mt-1 text-xs text-black/50">{caption}</p>}

      {/* The bars are decorative on top of the table below, which carries the
          same numbers in text. */}
      <div
        aria-hidden="true"
        className="mt-4 flex h-40 items-end gap-[2px] border-b border-gray-200"
      >
        {points.map((point) => (
          <div
            key={point.key}
            title={`${point.label}: ${formatValue(point.value)}`}
            className="flex h-full flex-1 flex-col justify-end rounded-t bg-track"
          >
            <div
              className="w-full rounded-t bg-heading/80"
              style={{
                height:
                  max > 0
                    ? `${Math.max((point.value / max) * 100, point.value > 0 ? 2 : 0)}%`
                    : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-black/50">
              <th scope="col" className="py-2 text-start font-medium">
                תקופה
              </th>
              <th scope="col" className="py-2 text-start font-medium">
                {valueLabel}
              </th>
              {secondaryLabel && (
                <th scope="col" className="py-2 text-start font-medium">
                  {secondaryLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key} className="border-b border-gray-100 last:border-0">
                <td className="py-2 text-black/70">{point.label}</td>
                <td className="py-2 font-medium text-heading">{formatValue(point.value)}</td>
                {secondaryLabel && (
                  <td className="py-2 text-black/70">
                    {formatSecondary && point.secondary !== undefined
                      ? formatSecondary(point.secondary)
                      : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
