import FlashCountdown from '@/components/flash/FlashCountdown'
import SmartImage from '@/components/ui/SmartImage'
import { getHomeFlashSale } from '@/lib/flash-sales/read'
import { flashSalePath, percentOff, phaseOf } from '@/lib/flash-sales/rules'
import { type Agorot, agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import Link from 'next/link'

/**
 * The flash-sale banner on the home page (STEP 61): the live sale that ends
 * soonest, or the next one opening within a day. Nothing when there is none,
 * which is the ordinary state and keeps the page byte-identical to before.
 *
 * UNDER THE DEALS GRID, with the deal of the day, for the reason page.tsx
 * records: the parity gate scores the first 2600px against live and live has
 * no flash sale. The grid ends past that line at every width.
 *
 * The countdown ticks on the device. The unit count is the cache's (two
 * minutes under traffic) and says so softly ("נותרו כ-"); the sale page
 * polls the live figure.
 *
 * Money is integer agorot end to end: the two prices come off the row as
 * integers and are formatted by `shekels`; the "was" price falls back to the
 * product's compare-at, then its ordinary price, each converted once.
 */
export default async function FlashSaleBanner() {
  const sale = await getHomeFlashSale()
  if (!sale || !sale.product) return null

  const now = new Date()
  const phase = phaseOf(sale, now)
  if (phase === 'ended' || phase === 'off') return null

  const price = agorot(sale.price_agorot) as Agorot
  const referenceAgorot =
    sale.reference_agorot ??
    (sale.product.full_price != null
      ? Math.round(sale.product.full_price * 100)
      : sale.product.kenyon_price != null
        ? Math.round(sale.product.kenyon_price * 100)
        : null)
  const reference =
    referenceAgorot !== null && referenceAgorot > sale.price_agorot
      ? (agorot(referenceAgorot) as Agorot)
      : null
  const off = percentOff(sale.price_agorot, referenceAgorot)
  const remaining = sale.remaining
  const soldOut = remaining !== null && remaining <= 0
  const href = flashSalePath(sale.id)
  const fill =
    remaining === null || sale.allocation <= 0
      ? 0
      : Math.min(100, Math.max(0, Math.round((remaining / sale.allocation) * 100)))

  return (
    <section
      aria-labelledby="flash-sale-title"
      dir="rtl"
      data-testid="flash-sale-banner"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-heading p-4 text-white md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="m-0 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <span className="rounded bg-brand px-2 py-1 text-heading">מבצע בזק</span>
            {phase === 'upcoming' && <span>בקרוב</span>}
          </p>
          <h2 id="flash-sale-title" className="m-0 text-section-title font-bold">
            {sale.name_he}
          </h2>
          <div className="text-heading [&_p]:text-white [&_span:first-child]:text-white">
            <FlashCountdown startsAt={sale.starts_at} endsAt={sale.ends_at} />
          </div>
          <Link href={href} prefetch={false} className="text-lg font-semibold hover:underline">
            {sale.product.name_he}
          </Link>
          <p className="m-0 flex items-baseline gap-3">
            <span className="text-2xl font-black text-brand">{shekels(price)}</span>
            {reference && (
              <span className="text-sm line-through opacity-80">{shekels(reference)}</span>
            )}
            {off > 0 && (
              <span className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-heading">
                {off}% הנחה
              </span>
            )}
          </p>
          {remaining !== null && (
            <div className="flex flex-col gap-1" data-testid="flash-sale-meter">
              <p className="m-0 text-xs">
                {soldOut
                  ? 'כל היחידות תפוסות. אפשר להיכנס לחדר ההמתנה.'
                  : `נותרו כ-${remaining} מתוך ${sale.allocation} יחידות במחיר הבזק`}
              </p>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-white/20"
                role="img"
                aria-label={`נותרו ${remaining} מתוך ${sale.allocation} יחידות`}
              >
                <div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} />
              </div>
            </div>
          )}
          <Link
            href={href}
            prefetch={false}
            className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80"
          >
            {phase === 'upcoming' ? 'לפרטי המבצע' : soldOut ? 'לחדר ההמתנה' : 'לתפוס יחידה'}
          </Link>
        </div>
        <Link
          href={href}
          prefetch={false}
          aria-label={`${sale.product.name_he} - לעמוד המבצע`}
          className="relative block aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-white md:w-64"
        >
          {sale.product.image_url ? (
            <SmartImage
              src={sale.product.image_url}
              alt=""
              fill
              sizes="(max-width: 767px) 90vw, 256px"
              className="object-cover"
            />
          ) : null}
        </Link>
      </div>
    </section>
  )
}
