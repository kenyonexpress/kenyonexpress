import FlashCountdown from '@/components/flash/FlashCountdown'
import { getFlashSaleForProduct } from '@/lib/flash-sales/read'
import { flashSalePath, phaseOf } from '@/lib/flash-sales/rules'
import { type Agorot, agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import Link from 'next/link'

/**
 * "This product is in a flash sale" on the product page (STEP 61): the flash
 * price, the clock, how many units are open, and the one way in. The buy row
 * above it keeps the ORDINARY price on purpose: only a shopper who holds a
 * unit pays the flash price, and the hold is taken on the sale page, where
 * the waiting room lives. Renders nothing when the product is in no sale,
 * which is the ordinary state.
 */
export default async function FlashSaleNotice({ productId }: { productId: string }) {
  const sale = await getFlashSaleForProduct(productId)
  if (!sale) return null
  const phase = phaseOf(sale, new Date())
  if (phase === 'ended' || phase === 'off') return null

  const price = agorot(sale.price_agorot) as Agorot
  const soldOut = sale.remaining !== null && sale.remaining <= 0

  return (
    <section
      className="pdp-bundle"
      aria-label="מבצע בזק על המוצר הזה"
      data-testid="flash-sale-notice"
      dir="rtl"
    >
      <h2 className="pdp-details__title">מבצע בזק</h2>
      <div className="pdp-bundle__card flex flex-col gap-3">
        <p className="m-0 text-base font-bold text-heading">{sale.name_he}</p>
        <FlashCountdown startsAt={sale.starts_at} endsAt={sale.ends_at} />
        <p className="m-0 flex items-baseline gap-3">
          <span className="text-xl font-black text-price">{shekels(price)}</span>
          <span className="text-sm text-muted">במקום המחיר הרגיל, ליחידות שנתפסו במבצע</span>
        </p>
        {sale.remaining !== null && (
          <p className="m-0 text-sm text-muted">
            {soldOut
              ? 'כל היחידות תפוסות כרגע; אפשר להיכנס לחדר ההמתנה.'
              : `נותרו ${sale.remaining} מתוך ${sale.allocation} יחידות במחיר הבזק`}
          </p>
        )}
        <Link
          href={flashSalePath(sale.id)}
          prefetch={false}
          className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-primary px-6 text-sm font-bold text-heading transition-opacity hover:opacity-80"
        >
          {phase === 'upcoming' ? 'לפרטי המבצע' : soldOut ? 'לחדר ההמתנה' : 'לתפוס יחידה במבצע'}
        </Link>
      </div>
    </section>
  )
}
