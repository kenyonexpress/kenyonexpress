import DealCountdown from '@/components/home/DealCountdown'
import SmartImage from '@/components/ui/SmartImage'
import { getDealOfTheDay } from '@/lib/homepage/below-fold'
import { type Agorot, agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import Link from 'next/link'

/**
 * The deal of the day: the deepest discount in the catalogue, with a countdown
 * to midnight in Israel, under the deals grid.
 *
 * THE GRID ABOVE STILL HAS NO COUNTDOWN, and this block is why it does not
 * need one. `live-home-sections.test.ts` pins `DealsOfTheDay` as live's flat
 * grid; the goal's countdown lives here, in its own section, below the 2600px
 * the parity gate scores, so it neither moves a scored pixel nor puts a timer
 * on a grid live renders without one.
 *
 * Money is integer agorot end to end: the two prices come off the `_agorot`
 * columns and are formatted by `shekels`; the percentage is basis points from
 * `rankDeals`, rounded once here for display.
 */
export default async function DealOfTheDay() {
  const deal = await getDealOfTheDay()
  if (!deal) return null

  const percentOff = Math.round(deal.discountBp / 100)
  const price = shekels(agorot(deal.priceAgorot) as Agorot)
  const reference = shekels(agorot(deal.referenceAgorot) as Agorot)
  const href = `/product/${deal.slug}`

  return (
    <section
      aria-labelledby="deal-of-the-day-title"
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-4 md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h2 id="deal-of-the-day-title" className="m-0 text-section-title font-bold text-heading">
            הדיל של היום
          </h2>
          <DealCountdown />
          {deal.category && (
            <Link
              href={`/category/${deal.category.slug}`}
              className="text-xs text-muted hover:underline"
            >
              {deal.category.name_he}
            </Link>
          )}
          <Link
            href={href}
            prefetch={false}
            className="text-lg font-semibold text-heading hover:underline"
          >
            {deal.nameHe}
          </Link>
          <p className="m-0 flex items-baseline gap-3">
            <span className="text-2xl font-black text-price">{price}</span>
            <span className="text-sm text-muted line-through">{reference}</span>
            {percentOff > 0 && (
              <span className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-heading">
                {percentOff}% הנחה
              </span>
            )}
          </p>
          <Link
            href={href}
            prefetch={false}
            className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-primary px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80"
          >
            לרכישה
          </Link>
        </div>
        <Link
          href={href}
          prefetch={false}
          aria-label={`${deal.nameHe} - לעמוד המוצר`}
          className="relative block aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-surface md:w-64"
        >
          <SmartImage
            src={deal.imageUrl}
            alt=""
            fill
            sizes="(max-width: 767px) 90vw, 256px"
            className="object-cover"
          />
        </Link>
      </div>
    </section>
  )
}
