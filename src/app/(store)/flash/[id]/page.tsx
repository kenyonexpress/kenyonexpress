import FlashClaimPanel from '@/components/flash/FlashClaimPanel'
import SmartImage from '@/components/ui/SmartImage'
import { loadFlashSale } from '@/lib/flash-sales/read'
import { percentOff, phaseOf } from '@/lib/flash-sales/rules'
import { readFlashStatus } from '@/lib/flash-sales/status'
import { type Agorot, agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { z } from 'zod'

type Props = { params: Promise<{ id: string }> }

/**
 * `/flash/<id>`: one flash sale (STEP 61). The product, the flash price
 * against the ordinary one, the clock, and the panel that takes a unit or a
 * place in the waiting room.
 *
 * EVERYTHING IS INSIDE THE BOUNDARY. The page reads the visitor's session
 * (their own claim) and the live unit count, both per request, so under
 * `cacheComponents` the whole body streams in behind a shaped skeleton. The
 * title is static for the same reason.
 *
 * NOINDEX. A sale is hours long; a crawler would index a page that says
 * "המבצע הסתיים" for the rest of its life.
 */
export const metadata: Metadata = {
  title: 'מבצע בזק',
  robots: { index: false, follow: true },
}

const idSchema = z.string().uuid()

export default function FlashSalePage({ params }: Props) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-10" dir="rtl">
      <Suspense fallback={<FlashSkeleton />}>
        <FlashSaleBody params={params} />
      </Suspense>
    </div>
  )
}

function FlashSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-8" aria-busy="true">
      <div className="aspect-square w-full rounded-lg bg-surface md:w-80" />
      <div className="flex flex-1 flex-col gap-3">
        <div className="h-8 w-2/3 rounded bg-surface" />
        <div className="h-6 w-1/3 rounded bg-surface" />
        <div className="h-11 w-48 rounded-full bg-surface" />
      </div>
    </div>
  )
}

async function FlashSaleBody({ params }: Props) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()

  const supabase = await createClient()
  const [{ data: auth }, sale] = await Promise.all([supabase.auth.getUser(), loadFlashSale(id)])
  if (!sale || !sale.product) notFound()

  const userId = auth.user?.id ?? null
  const status = await readFlashStatus(sale.id, userId)
  const phase = phaseOf(sale, new Date())

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
  const productHref = `/product/${encodeURIComponent(sale.product.slug)}`

  return (
    <article className="flex flex-col gap-6 md:flex-row md:gap-10" data-testid="flash-sale-page">
      <Link
        href={productHref}
        prefetch={false}
        aria-label={`${sale.product.name_he} - לעמוד המוצר`}
        className="relative block aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-surface md:w-80"
      >
        {sale.product.image_url ? (
          <SmartImage
            src={sale.product.image_url}
            alt=""
            fill
            sizes="(max-width: 767px) 90vw, 320px"
            className="object-cover"
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p className="m-0 flex items-center gap-2 text-xs font-bold">
          <span className="rounded bg-brand px-2 py-1 text-heading">מבצע בזק</span>
          {phase === 'ended' && <span className="text-muted">הסתיים</span>}
          {phase === 'off' && <span className="text-muted">אינו פעיל</span>}
        </p>
        <h1 className="m-0 text-2xl font-bold text-heading">{sale.name_he}</h1>
        <Link href={productHref} prefetch={false} className="text-lg text-heading hover:underline">
          {sale.product.name_he}
        </Link>
        <p className="m-0 flex items-baseline gap-3">
          <span className="text-3xl font-black text-price">{shekels(price)}</span>
          {reference && (
            <span className="text-base text-muted line-through">{shekels(reference)}</span>
          )}
          {off > 0 && (
            <span className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-heading">
              {off}% הנחה
            </span>
          )}
        </p>
        <p className="m-0 text-sm text-muted">
          {sale.max_per_claim > 1 ? `עד ${sale.max_per_claim} יחידות לקונה. ` : 'יחידה אחת לקונה. '}
          יחידה שנתפסה שמורה לכם {sale.hold_minutes} דקות להשלמת הרכישה; אחרי זה היא עוברת לבא בתור.
        </p>

        <FlashClaimPanel
          saleId={sale.id}
          productId={sale.product_id}
          productName={sale.product.name_he}
          maxPerClaim={sale.max_per_claim}
          signedIn={userId !== null}
          initialStatus={status}
          startsAt={sale.starts_at}
          endsAt={sale.ends_at}
        />
      </div>
    </article>
  )
}
