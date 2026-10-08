import { agorot } from '@/lib/money'
import { shekelsRounded } from '@/lib/money-format'
import { type DailyPoint, chartGeometry, shortDayLabel } from '@/lib/pricing/price-history'

interface Props {
  series: readonly DailyPoint[]
  /** Whether today's price is the lowest of the series, which colours the end marker. */
  atLow?: boolean
}

export const CHART_WIDTH = 600
export const CHART_HEIGHT = 120

/**
 * The price line of a product page (STEP 59): one inline SVG, no library.
 *
 * A STEP line, not a slope, because a price holds until it changes, and a
 * slope between two snapshots draws prices the product never had. Stretched
 * to the column with `preserveAspectRatio="none"` and a non-scaling stroke,
 * so the line keeps its weight at every width. The labels sit in HTML
 * outside the SVG for the same reason: text inside a stretched SVG stretches.
 *
 * The time axis is LTR on purpose, oldest day on the left, which is how every
 * price tracker a shopper has seen reads, Hebrew ones included; the labels
 * around it stay in the page's RTL flow.
 */
export default function PriceHistoryChart({ series, atLow = false }: Props) {
  const geometry = chartGeometry(series, CHART_WIDTH, CHART_HEIGHT)
  if (!geometry) return null

  const min = shekelsRounded(agorot(geometry.minAgorot))
  const max = shekelsRounded(agorot(geometry.maxAgorot))
  const label =
    geometry.minAgorot === geometry.maxAgorot
      ? `מחיר קבוע של ${min} מ-${shortDayLabel(geometry.firstDay)} עד ${shortDayLabel(geometry.lastDay)}`
      : `מחיר בין ${min} ל-${max} מ-${shortDayLabel(geometry.firstDay)} עד ${shortDayLabel(geometry.lastDay)}`

  return (
    <figure className="pdp-price-history__figure" data-testid="price-history-chart">
      <div className="pdp-price-history__scale" aria-hidden="true">
        <span>{max}</span>
        <span>{min}</span>
      </div>
      <div className="pdp-price-history__plot" dir="ltr">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="pdp-price-history__svg"
        >
          <polyline
            className="pdp-price-history__line"
            points={geometry.polyline}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="pdp-price-history__marker"
          data-at-low={atLow ? 'true' : 'false'}
          style={{
            left: `${(geometry.last.x / CHART_WIDTH) * 100}%`,
            top: `${(geometry.last.y / CHART_HEIGHT) * 100}%`,
          }}
          aria-hidden="true"
        />
        <div className="pdp-price-history__axis" aria-hidden="true">
          <span>{shortDayLabel(geometry.firstDay)}</span>
          <span>{shortDayLabel(geometry.lastDay)}</span>
        </div>
      </div>
      <figcaption className="pdp-price-history__caption">{label}</figcaption>
    </figure>
  )
}
