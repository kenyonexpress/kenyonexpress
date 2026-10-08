import PriceHistoryChart from '@/components/storefront/PriceHistoryChart'
import { agorot } from '@/lib/money'
import { shekelsRounded } from '@/lib/money-format'
import { CHART_WINDOW_DAYS, priceSignal } from '@/lib/pricing/price-history'
import { loadPriceHistoryView } from '@/lib/pricing/price-history-read'

interface Props {
  productId: string
  /** The price the page renders now, integer agorot; null for an unpriced row. */
  currentAgorot: number | null
}

export const PRICE_HISTORY_TITLE = 'היסטוריית מחיר'

/**
 * The price history band of a product page (STEP 59): a one-line verdict, the
 * ninety-day chart, and the lowest price the record holds.
 *
 * RENDERED ONLY WITH SOMETHING TO SHOW. Fewer than two observed sale days is
 * not a history, and a band saying "no history yet" on every new product is
 * noise under the buy button. The band therefore appears on its own once the
 * second snapshot lands, with nothing for an operator to switch on.
 *
 * THE VERDICT LINE IS THE SAME RULE THE CARDS USE (`priceSignal`), fed the
 * price this page is rendering, so the badge on a grid tile and the sentence
 * on the page it links to cannot disagree. Every amount is integer agorot
 * formatted once at the edge.
 *
 * No clock is read here: the view, "today" included, comes out of one cache
 * scope (`loadPriceHistoryView`), which keeps the product page static.
 */
export default async function PriceHistory({ productId, currentAgorot }: Props) {
  const view = await loadPriceHistoryView(productId)
  if (!view) return null

  const signal = priceSignal(view.summary, currentAgorot)
  const atLow = currentAgorot !== null && currentAgorot <= view.lowestEverAgorot

  let verdict: string
  if (signal?.allTimeLow) {
    verdict = 'המחיר הנמוך ביותר שנמדד למוצר הזה'
  } else if (signal?.drop) {
    verdict = `ירד ב-${signal.drop.percent}% לעומת המחיר הקודם (${shekelsRounded(agorot(signal.drop.oldAgorot))})`
  } else {
    verdict = `המחיר הנמוך ביותר שנמדד: ${shekelsRounded(agorot(view.lowestEverAgorot))}`
  }

  return (
    <section className="pdp-price-history" aria-labelledby="pdp-price-history-title">
      <h2 id="pdp-price-history-title" className="pdp-details__title">
        {PRICE_HISTORY_TITLE}
      </h2>
      <p
        className="pdp-price-history__verdict"
        data-signal={signal?.allTimeLow ? 'all-time-low' : signal?.drop ? 'drop' : 'none'}
      >
        {verdict}
      </p>
      {view.series.length >= 2 ? (
        <PriceHistoryChart series={view.series} atLow={atLow} />
      ) : (
        <p className="pdp-details__text">
          נמדדו {view.points.length} ימים, אף אחד מהם ב-{CHART_WINDOW_DAYS} הימים האחרונים.
        </p>
      )}
    </section>
  )
}
