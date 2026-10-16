import AddToCartButton from '@/components/cart/AddToCartButton'
import DealCountdown from '@/components/home/DealCountdown'
import { ShoppingCart } from '@/components/icons'
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
 * UX08 (14.10.2026), measured before in logs/ux08/before.json at 380/768/1440:
 *
 *   countdown  a 14px label beside a 4px-radius monospace chip (16px/900,
 *              1.6px tracking) on its own row. Now Electro's one yellow pill
 *              in the heading row (DealCountdown.tsx carries the numbers).
 *   badge      "50% הנחה" as a 25px-radius yellow chip inline in the price
 *              row, the modal radius on a 24px chip. Now live's own discount
 *              badge, the one every deals card above already wears
 *              (`.p_con__badge` in product-card-deals.css): red, white
 *              12/700, 4px corner, 2px 10px padding, pinned to the inline-end
 *              top of the photograph, "-50%" left to right. The percentage
 *              stays in the price row for a screen reader only.
 *   CTA        "לרכישה", a link to the product page. Now a real add-to-cart
 *              in the same yellow pill, and after the server accepted the
 *              item it turns the sale green, pops once, and reads
 *              "נוסף לעגלה" with a check for 1.8s (AddToCartButton's
 *              `addedLabel`; the keyframes are `.deal-cta--added` in
 *              globals.css). The store opens the mini-cart as it does for
 *              every add. Product name and photograph still link to the page.
 *   corners    the card and the photograph were `rounded-lg`, this theme's
 *              25px MODAL radius (UX07 found the same on the category tiles).
 *              Now `rounded-md`, 12px.
 *
 * Money is integer agorot end to end: the two prices come off the `_agorot`
 * columns and are formatted by `shekels`; the percentage is basis points from
 * `rankDeals`, rounded once here for display.
 */

/** Rest and hover: live's yellow CTA with dark text. */
const CTA_REST =
  'inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-brand-primary px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80'

/**
 * Added: the sale green with white, the one green on the site dark enough for
 * white (tokens.css), switched by the `data-added` the button sets after the
 * server accepted the item. On its own line so brand-contrast.test.ts (yellow
 * never carries white) reads the resting classes and these separately.
 */
const CTA_ADDED = 'data-added:bg-sale-badge data-added:text-white data-added:hover:opacity-100'

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
      <div
        data-deal-of-the-day
        className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:flex-row md:items-center md:gap-8"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Electro's header: the title with the countdown pill 30px after it
              on the same line, wrapping under it where the line is short. */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <h2
              id="deal-of-the-day-title"
              className="m-0 text-section-title font-bold text-heading"
            >
              הדיל של היום
            </h2>
            <DealCountdown />
          </div>
          {deal.category && (
            <Link
              href={`/category/${deal.category.slug}`}
              // A 24px hit box on a 12px line: touch-targets.spec.ts measured
              // this link at 97x16 against its 24 floor (the one UX08 offender
              // in the section; a flex item is not an inline link in prose).
              className="inline-flex min-h-6 w-fit items-center text-xs text-muted hover:underline"
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
            {percentOff > 0 && <span className="sr-only">{percentOff}% הנחה</span>}
          </p>
          <AddToCartButton
            productId={deal.id}
            productName={deal.nameHe}
            priceAgorot={deal.priceAgorot}
            addedLabel="נוסף לעגלה"
            addedClassName="deal-cta--added"
            className={`${CTA_REST} ${CTA_ADDED}`}
          >
            <ShoppingCart size={18} aria-hidden="true" />
            הוסף לעגלה
          </AddToCartButton>
        </div>
        <Link
          href={href}
          prefetch={false}
          aria-label={`${deal.nameHe} - לעמוד המוצר`}
          className="relative block aspect-square w-full shrink-0 overflow-hidden rounded-md bg-surface md:w-64"
        >
          <SmartImage
            src={deal.imageUrl}
            alt=""
            fill
            sizes="(max-width: 767px) 90vw, 256px"
            className="object-cover"
          />
          {percentOff > 0 && (
            <span
              data-deal-badge
              aria-hidden="true"
              className="absolute end-0 top-0 z-10 rounded-sm bg-deal-badge px-2 py-1 text-badge font-bold leading-6 text-white"
            >
              {/* `end-0` resolves against the element's OWN direction, so the
                  ltr that keeps "-50%" from reading "50%-" goes on an inner
                  span, as live's `.discount_per` sits inside `.p_con__badge`.
                  With it on this span the badge landed on the RIGHT corner
                  (measured 14.10, logs/ux08/e2e-deal-of-the-day.log). */}
              <span dir="ltr">-{percentOff}%</span>
            </span>
          )}
        </Link>
      </div>
    </section>
  )
}
