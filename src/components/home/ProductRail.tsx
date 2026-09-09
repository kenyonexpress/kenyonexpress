import ProductCard from '@/components/ProductCard'
import type { RailProduct } from '@/lib/homepage/rails'
import Link from 'next/link'

/**
 * A row of products under a heading, used by the rail and both spotlights.
 *
 * AN EMPTY RAIL RENDERS NOTHING AT ALL - not an empty grid, and not a "no
 * products" message. A merchandising row exists to sell something; with nothing
 * in it, a heading over blank space is a defect a visitor can see and an
 * operator cannot. Measured 2026-09-09, `ending_soon` matches zero of the 44
 * active products because `offer_valid_until` is null on all of them, so this
 * is the live case and not a theoretical one. The admin console prints the
 * match count so the operator finds out there instead.
 *
 * The frame is `max-w-deals`, which is what `DealsOfTheDay` uses, so a
 * configured rail sits on the same grid as the product rows already on the
 * page rather than introducing a second rhythm.
 */
export default function ProductRail({
  title,
  subtitle,
  products,
  moreHref,
  moreLabel,
}: {
  title: string | null
  subtitle?: string | null
  products: RailProduct[]
  moreHref?: string
  moreLabel?: string
}) {
  if (products.length === 0) return null

  return (
    <section
      aria-label={title ?? 'מוצרים'}
      className="mx-auto w-full max-w-deals px-deals-pad py-8 md:px-deals-pad-md xl:px-0"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {title && <h2 className="text-xl font-bold text-heading">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm text-heading/75">{subtitle}</p>}
        </div>
        {moreHref && (
          <Link
            href={moreHref}
            className="text-sm font-medium text-heading underline underline-offset-2"
          >
            {moreLabel ?? 'לכל המוצרים'}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={{
              id: product.id,
              slug: product.slug,
              name_he: product.name_he,
              kenyon_price: product.kenyon_price,
              full_price: product.full_price,
              images: product.images,
              stock_quantity: product.stock_quantity,
            }}
          />
        ))}
      </div>
    </section>
  )
}
